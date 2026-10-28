import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 text-xs font-medium uppercase tracking-[0.12em] text-accent">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[22px] font-semibold leading-8 tracking-[-0.01em] text-ink">{title}</h1>
        {description && (
          <p className="mt-1 max-w-[720px] text-[13px] leading-5 text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto w-full max-w-[1440px] px-5 py-6 lg:px-8', className)}>{children}</div>
  )
}

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs leading-5 text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}
