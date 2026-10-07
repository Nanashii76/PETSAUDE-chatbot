import type { ComponentProps } from "react"
import { ArrowDownIcon } from "lucide-react"
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ConversationProps = ComponentProps<typeof StickToBottom>

/**
 * Área rolável da conversa. Mantém a visão colada no fim enquanto chegam
 * mensagens, mas solta assim que o profissional rola para cima — ele pode
 * estar relendo o que relatou enquanto a resposta é gerada.
 */
function Conversation({ className, ...props }: ConversationProps) {
  return (
    <StickToBottom
      className={cn("relative flex-1 overflow-y-auto", className)}
      initial="smooth"
      resize="smooth"
      role="log"
      {...props}
    />
  )
}

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>

function ConversationContent({ className, ...props }: ConversationContentProps) {
  return (
    <StickToBottom.Content
      className={cn("mx-auto flex w-full max-w-3xl flex-col gap-5 p-5", className)}
      {...props}
    />
  )
}

export type ConversationScrollButtonProps = ComponentProps<typeof Button>

function ConversationScrollButton({
  className,
  ...props
}: ConversationScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()

  if (isAtBottom) return null

  return (
    <Button
      className={cn(
        "absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-line bg-surface-2 text-ink shadow-[0_2px_6px_rgb(8_10_30_/_0.4)] hover:bg-surface-2",
        className
      )}
      onClick={() => scrollToBottom()}
      size="icon-sm"
      type="button"
      variant="secondary"
      aria-label="Ir para a última mensagem"
      {...props}
    >
      <ArrowDownIcon />
    </Button>
  )
}

export { Conversation, ConversationContent, ConversationScrollButton }
