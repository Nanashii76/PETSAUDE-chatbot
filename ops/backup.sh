#!/bin/sh
set -eu
umask 077
case "${BACKUP_RETENTION_DAYS:-7}" in ''|*[!0-9]*) echo 'Retenção inválida' >&2; exit 1;; esac
[ "${BACKUP_RETENTION_DAYS:-7}" -gt 0 ] || exit 1
mkdir -p /backups
backup="/backups/petsaude-$(date -u +%Y%m%dT%H%M%SZ).dump"
trap 'rm -f "$backup.partial"' EXIT HUP INT TERM
pg_dump --format=custom --no-owner --no-acl --file="$backup.partial"
pg_restore --list "$backup.partial" >/dev/null
mv "$backup.partial" "$backup"
# Só remove backups antigos depois de um dump bem-sucedido.
find /backups -name 'petsaude-*.dump' -type f -mtime +"${BACKUP_RETENTION_DAYS:-7}" -delete
echo "Backup concluído: $backup"
