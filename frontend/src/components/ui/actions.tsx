import type { ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export type ActionsProps = ComponentProps<"div">

function Actions({ className, children, ...props }: ActionsProps) {
  return (
    <div className={cn("flex items-center gap-0.5", className)} {...props}>
      {children}
    </div>
  )
}

export type ActionProps = ComponentProps<typeof Button> & {
  /** Rótulo acessível e texto da dica. Obrigatório: o botão só tem ícone. */
  label: string
}

/**
 * Botão de ação sob uma resposta do agente.
 *
 * O ícone sozinho nunca basta: `label` vira `aria-label` e dica em hover, para
 * que leitor de tela e usuário novo saibam o que o botão faz.
 */
function Action({ className, label, children, ...props }: ActionProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={label}
            className={cn(
              "text-ink-faint hover:bg-surface-2 hover:text-ink",
              className
            )}
            size="icon-sm"
            type="button"
            variant="ghost"
            {...props}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export { Actions, Action }
