import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-raised text-center',
        compact ? 'px-5 py-8' : 'px-6 py-14',
        className,
      )}
    >
      <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-muted shadow-card">
        <Icon size={19} strokeWidth={1.8} />
      </span>
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {description && (
        <p className="mt-1 max-w-[360px] text-[13px] leading-5 text-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
