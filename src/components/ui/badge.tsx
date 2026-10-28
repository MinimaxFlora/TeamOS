import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'outline'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-sunken text-ink-soft',
  accent: 'bg-accent-soft text-accent-strong',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  outline: 'border border-line-strong bg-surface text-muted',
}

const dotTones: Record<BadgeTone, string> = {
  neutral: 'bg-faint',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  outline: 'bg-faint',
}

export function Badge({
  tone = 'neutral',
  dot,
  className,
  children,
}: {
  tone?: BadgeTone
  dot?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotTones[tone])} />}
      {children}
    </span>
  )
}

export type StatusKind =
  | 'published'
  | 'draft'
  | 'paused'
  | 'enabled'
  | 'review'
  | 'disabled'
  | 'running'
  | 'done'
  | 'failed'
  | 'stopped'
  | 'active'
  | 'invited'

const statusMap: Record<StatusKind, { tone: BadgeTone; label: string }> = {
  published: { tone: 'success', label: '已发布' },
  draft: { tone: 'warning', label: '草稿' },
  paused: { tone: 'neutral', label: '已停用' },
  enabled: { tone: 'success', label: '已启用' },
  review: { tone: 'warning', label: '待审核' },
  disabled: { tone: 'neutral', label: '已停用' },
  running: { tone: 'accent', label: '运行中' },
  done: { tone: 'success', label: '已完成' },
  failed: { tone: 'danger', label: '失败' },
  stopped: { tone: 'neutral', label: '已停止' },
  active: { tone: 'success', label: '在职' },
  invited: { tone: 'warning', label: '待加入' },
}

export function StatusPill({ status, className }: { status: StatusKind; className?: string }) {
  const meta = statusMap[status]
  return (
    <Badge tone={meta.tone} dot className={className}>
      {meta.label}
    </Badge>
  )
}

const riskMap: Record<'low' | 'medium' | 'high', { tone: BadgeTone; label: string }> = {
  low: { tone: 'neutral', label: '低风险' },
  medium: { tone: 'warning', label: '需留意' },
  high: { tone: 'danger', label: '高风险' },
}

export function RiskBadge({ risk }: { risk: 'low' | 'medium' | 'high' }) {
  const meta = riskMap[risk]
  return <Badge tone={meta.tone}>{meta.label}</Badge>
}
