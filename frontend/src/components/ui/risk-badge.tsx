import { cn } from "@/lib/utils"
import type { CorRisco } from "@/types"

/**
 * Selo de classificação de risco.
 *
 * DESIGN.md, regra 2: risco nunca é comunicado só por cor. Sob deuteranopia,
 * Vermelha (#FF6B6B) e Verde (#4ADE80) colapsam para quase o mesmo oliva
 * (#AFAF62 e #BDBD85). Como são os dois extremos da urgência, cada nível
 * carrega também uma forma própria e o rótulo escrito.
 */

const ESTILO: Record<CorRisco, { cor: string; forma: "circulo-cheio" | "triangulo" | "circulo-vazado" | "quadrado" }> = {
  Vermelha: { cor: "var(--risco-vermelha)", forma: "circulo-cheio" },
  Amarela: { cor: "var(--risco-amarela)", forma: "triangulo" },
  Verde: { cor: "var(--risco-verde)", forma: "circulo-vazado" },
  Azul: { cor: "var(--risco-azul)", forma: "quadrado" },
}

function Forma({ forma, cor }: { forma: string; cor: string }) {
  const comum = { width: 12, height: 12, viewBox: "0 0 12 12", "aria-hidden": true } as const

  switch (forma) {
    case "circulo-cheio":
      return (
        <svg {...comum}>
          <circle cx="6" cy="6" r="5" fill={cor} />
        </svg>
      )
    case "triangulo":
      return (
        <svg {...comum}>
          <path d="M6 1 L11 10.5 H1 Z" fill={cor} />
        </svg>
      )
    case "circulo-vazado":
      return (
        <svg {...comum}>
          <circle cx="6" cy="6" r="4.25" fill="none" stroke={cor} strokeWidth="2.2" />
        </svg>
      )
    default:
      return (
        <svg {...comum}>
          <rect x="1.25" y="1.25" width="9.5" height="9.5" rx="2.5" fill={cor} />
        </svg>
      )
  }
}

export function RiskBadge({
  cor,
  className,
}: {
  cor: CorRisco
  className?: string
}) {
  const estilo = ESTILO[cor]
  if (!estilo) return null

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] font-semibold",
        className
      )}
      style={{
        color: estilo.cor,
        backgroundColor: `color-mix(in oklch, ${estilo.cor} 14%, var(--bg))`,
      }}
    >
      <Forma forma={estilo.forma} cor={estilo.cor} />
      Risco: {cor}
    </span>
  )
}
