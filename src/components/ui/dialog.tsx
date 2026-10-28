import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

const sizes = {
  sm: 'max-w-[420px]',
  md: 'max-w-[560px]',
  lg: 'max-w-[720px]',
  xl: 'max-w-[900px]',
} as const

export function DialogContent({
  className,
  size = 'md',
  children,
  hideClose,
}: {
  className?: string
  size?: keyof typeof sizes
  children: ReactNode
  hideClose?: boolean
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#171a21]/32 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop outline-none data-[state=open]:animate-scale-in',
          sizes[size],
          className,
        )}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className="absolute right-3.5 top-3.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="关闭"
          >
            <X size={16} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({
  title,
  description,
  icon: Icon,
  eyebrow,
  className,
}: {
  title: string
  description?: string
  icon?: LucideIcon
  eyebrow?: string
  className?: string
}) {
  return (
    <div className={cn('border-b border-line px-6 pb-4 pt-5 pr-12', className)}>
      {eyebrow && (
        <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-accent">
          {eyebrow}
        </div>
      )}
      <DialogPrimitive.Title className="flex items-center gap-2 text-[17px] font-semibold leading-6 text-ink">
        {Icon && (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon size={16} />
          </span>
        )}
        {title}
      </DialogPrimitive.Title>
      {description ? (
        <DialogPrimitive.Description className="mt-1.5 text-[13px] leading-5 text-muted">
          {description}
        </DialogPrimitive.Description>
      ) : (
        <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
      )}
    </div>
  )
}

export function DialogBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 py-5', className)}>{children}</div>
}

export function DialogFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 border-t border-line bg-raised px-6 py-3.5',
        className,
      )}
    >
      {children}
    </div>
  )
}
