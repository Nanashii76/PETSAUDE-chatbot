import time
import os
import sys
import json
import subprocess
import psutil

OUTPUT_FILE = sys.argv[1] if len(sys.argv) > 1 else "load-tests/metrics.json"

def get_node_procs():
    procs = []
    for p in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            cmd = " ".join(p.info['cmdline'] or [])
            if "src/server.ts" in cmd or "dist/server.js" in cmd:
                procs.append(p)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return procs

def get_docker_stats():
    try:
        out = subprocess.check_output(
            ["docker", "stats", "--no-stream", "--format", "{{.Name}},{{.CPUPerc}},{{.MemUsage}}", "petsaude-postgres"],
            stderr=subprocess.DEVNULL
        ).decode().strip()
        parts = out.split(",")
        if len(parts) >= 3:
            cpu = float(parts[1].replace("%", "").strip() or 0)
            mem_raw = parts[2].split("/")[0].strip()
            mem_mb = 0.0
            if "GiB" in mem_raw:
                mem_mb = float(mem_raw.replace("GiB", "").strip()) * 1024
            elif "MiB" in mem_raw:
                mem_mb = float(mem_raw.replace("MiB", "").strip())
            elif "kB" in mem_raw:
                mem_mb = float(mem_raw.replace("kB", "").strip()) / 1024
            return {"cpu_percent": cpu, "mem_mb": mem_mb}
    except Exception:
        pass
    return {"cpu_percent": 0.0, "mem_mb": 0.0}

def get_pg_connections():
    try:
        out = subprocess.check_output([
            "docker", "exec", "petsaude-postgres", "psql", "-U", "postgres", "-d", "petsaude",
            "-t", "-A", "-c",
            "SELECT count(*), count(*) FILTER (WHERE state = 'active'), count(*) FILTER (WHERE state = 'idle') FROM pg_stat_activity WHERE datname = 'petsaude';"
        ], stderr=subprocess.DEVNULL).decode().strip()
        parts = out.split("|")
        if len(parts) == 3:
            return {"total": int(parts[0]), "active": int(parts[1]), "idle": int(parts[2])}
    except Exception:
        pass
    return {"total": 0, "active": 0, "idle": 0}

history = []
print(f"Monitoring started. Writing to {OUTPUT_FILE}...")

try:
    while True:
        timestamp = time.time()
        sys_cpu = psutil.cpu_percent(interval=None)
        sys_mem = psutil.virtual_memory()

        node_cpu = 0.0
        node_mem_mb = 0.0
        procs = get_node_procs()
        for p in procs:
            try:
                node_cpu += p.cpu_percent(interval=None)
                node_mem_mb += p.memory_info().rss / (1024 * 1024)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        docker_stats = get_docker_stats()
        pg_conns = get_pg_connections()

        entry = {
            "timestamp": timestamp,
            "system_cpu_percent": sys_cpu,
            "system_mem_used_mb": sys_mem.used / (1024 * 1024),
            "system_mem_total_mb": sys_mem.total / (1024 * 1024),
            "system_mem_percent": sys_mem.percent,
            "node_cpu_percent": node_cpu,
            "node_mem_mb": node_mem_mb,
            "postgres_cpu_percent": docker_stats["cpu_percent"],
            "postgres_mem_mb": docker_stats["mem_mb"],
            "pg_connections": pg_conns
        }
        history.append(entry)

        with open(OUTPUT_FILE, "w") as f:
            json.dump(history, f, indent=2)

        time.sleep(0.5)
except KeyboardInterrupt:
    print(f"\nMonitoring stopped. Total samples: {len(history)}")
