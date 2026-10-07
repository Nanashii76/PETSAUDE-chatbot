import { cva } from "class-variance-authority"

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-[120ms] ease-brand disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-azure/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-ink-muted hover:bg-surface-2 hover:text-ink",
        outline: "border border-line bg-transparent text-ink hover:bg-surface-2",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-azure underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 [&_svg]:size-4",
        sm: "h-8 rounded-sm px-3 text-[13px] [&_svg]:size-4",
        lg: "h-11 rounded-lg px-6 [&_svg]:size-5",
        icon: "size-9 [&_svg]:size-4",
        "icon-sm": "size-8 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)
