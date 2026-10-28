import logoUrl from '../../assets/logo.png'
import { cn } from '../../lib/utils'

export function Logo({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <img
      src={logoUrl}
      alt="TeamOS"
      width={size}
      height={size}
      className={cn('shrink-0 select-none rounded-[9px] object-cover', className)}
      draggable={false}
    />
  )
}
