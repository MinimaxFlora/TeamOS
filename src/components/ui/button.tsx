import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'iconSm'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white shadow-card hover:bg-accent-strong active:bg-accent-strong disabled:hover:bg-accent',
  secondary:
    'border border-line-strong bg-surface text-ink shadow-card hover:bg-raised active:bg-sunken',
  ghost: 'text-ink-soft hover:bg-sunken hover:text-ink',
  subtle: 'bg-accent-soft text-accent-strong hover:bg-accent-line/60',
  danger: 'bg-danger text-white shadow-card hover:bg-[#a53434]',
  link: 'text-accent underline-offset-4 hover:underline',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-[13px] rounded-lg gap-1.5',
  md: 'h-9 px-3.5 text-sm rounded-lg gap-2',
  lg: 'h-10 px-4 text-sm rounded-lg gap-2',
  icon: 'h-8 w-8 rounded-lg',
  iconSm: 'h-7 w-7 rounded-md',
}

export function buttonStyles(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string) {
  return cn(
    'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    'disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  )
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonStyles(variant, size, className)}
      {...props}
    />
  )
})
