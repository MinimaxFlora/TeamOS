import {
  BarChart3,
  Briefcase,
  Calculator,
  Code2,
  FileText,
  FlaskConical,
  Globe,
  Headphones,
  Megaphone,
  Palette,
  PenLine,
  Scale,
  Sparkles,
  Users,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import type { AgentIcon } from '../../lib/types'

const iconMap = {
  sparkles: Sparkles,
  briefcase: Briefcase,
  pen: PenLine,
  chart: BarChart3,
  file: FileText,
  users: Users,
  headset: Headphones,
  megaphone: Megaphone,
  calculator: Calculator,
  scale: Scale,
  code: Code2,
  globe: Globe,
  flask: FlaskConical,
  palette: Palette,
} as const

const avatarSizes = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
  xl: 'h-12 w-12 text-base',
} as const

const iconSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 19,
  xl: 22,
} as const

export type AvatarSize = keyof typeof avatarSizes

function initials(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  if (/^[一-龥]{3,}$/.test(trimmed)) return trimmed.slice(-2)
  if (/^[一-龥]+$/.test(trimmed)) return trimmed
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return trimmed.slice(0, 2).toUpperCase()
}

export function Avatar({
  name,
  color = '#4b5b76',
  size = 'md',
  className,
  square,
  title,
}: {
  name: string
  color?: string
  size?: AvatarSize
  className?: string
  square?: boolean
  title?: string
}) {
  return (
    <span
      title={title ?? name}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center font-semibold leading-none',
        square ? 'rounded-lg' : 'rounded-full',
        avatarSizes[size],
        className,
      )}
      style={{ backgroundColor: `${color}16`, color }}
    >
      {initials(name)}
    </span>
  )
}

export function AgentIconGlyph({
  icon,
  size = 16,
  className,
}: {
  icon: AgentIcon
  size?: number
  className?: string
}) {
  const Icon = iconMap[icon] ?? Sparkles
  return <Icon size={size} strokeWidth={1.9} className={className} />
}

export function AgentAvatar({
  icon,
  color = '#2f55d4',
  size = 'md',
  className,
  title,
}: {
  icon: AgentIcon
  color?: string
  size?: AvatarSize
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-[10px] border',
        avatarSizes[size],
        className,
      )}
      style={{
        backgroundColor: `${color}12`,
        borderColor: `${color}24`,
        color,
      }}
    >
      <AgentIconGlyph icon={icon} size={iconSizes[size]} />
    </span>
  )
}

export function PresenceDot({ tone = 'success', className }: { tone?: 'success' | 'warning' | 'neutral'; className?: string }) {
  const color = tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-faint'
  return <span className={cn('inline-block h-1.5 w-1.5 rounded-full', color, className)} />
}
