import type { ComponentProps, HTMLAttributes } from "react"

import { cn } from "@/lib/utils"

export type MessageFrom = "user" | "assistant" | "system"

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: MessageFrom
}

function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      className={cn(
        "group flex w-full items-end gap-2.5 py-0.5",
        from === "user" ? "is-user justify-end" : "is-assistant justify-start",
        className
      )}
      data-from={from}
      {...props}
    />
  )
}

export type MessageContentProps = HTMLAttributes<HTMLDivElement>

/**
 * Bolha de mensagem. Largura máxima em 68ch: corpo de texto confortável fica
 * entre 65 e 75ch, e a resposta do agente costuma ser markdown longo.
 */
function MessageContent({ className, children, ...props }: MessageContentProps) {
  return (
    <div
      className={cn(
        "flex max-w-[68ch] flex-col gap-2 overflow-hidden px-4 py-3 text-[0.9375rem] leading-relaxed",
        "rounded-lg",
        // Agente: superfície elevada, canto inferior esquerdo "preso" ao avatar
        "group-[.is-assistant]:rounded-bl-sm group-[.is-assistant]:border group-[.is-assistant]:border-line group-[.is-assistant]:bg-surface group-[.is-assistant]:text-ink",
        // Profissional: preenchimento índigo da capa
        "group-[.is-user]:rounded-br-sm group-[.is-user]:bg-indigo-fill group-[.is-user]:text-ink",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export type MessageAvatarProps = ComponentProps<"div"> & {
  name?: string
}

function MessageAvatar({ className, name, children, ...props }: MessageAvatarProps) {
  return (
    <div
      className={cn(
        "grid size-8 shrink-0 place-items-center overflow-hidden rounded-full",
        "bg-surface-2 text-[0.6875rem] font-semibold text-ink-muted",
        className
      )}
      title={name}
      {...props}
    >
      {children ?? name?.slice(0, 2).toUpperCase()}
    </div>
  )
}

export { Message, MessageContent, MessageAvatar }
