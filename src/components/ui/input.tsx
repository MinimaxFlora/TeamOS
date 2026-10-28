import { forwardRef } from 'react'
import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from '../../lib/utils'

const fieldBase =
  'w-full rounded-lg border border-line-strong bg-surface text-ink shadow-card transition-colors placeholder:text-faint hover:border-[#c4cad4] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:bg-raised disabled:text-muted'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldBase, 'h-9 px-3 text-sm', className)} {...props} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(fieldBase, 'min-h-[96px] resize-y px-3 py-2 text-sm leading-6', className)}
        {...props}
      />
    )
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(fieldBase, 'h-9 cursor-pointer px-2.5 pr-8 text-sm', className)}
        {...props}
      >
        {children}
      </select>
    )
  },
)

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-[13px] font-medium text-ink-soft', className)} {...props} />
}

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  htmlFor?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor={htmlFor}>
            {label}
            {required && <span className="ml-0.5 text-danger">*</span>}
          </Label>
          {hint && <span className="text-xs text-faint">{hint}</span>}
        </div>
      )}
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

export function Checkbox({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'h-4 w-4 shrink-0 cursor-pointer rounded border-line-strong accent-[var(--color-accent)]',
        className,
      )}
      {...props}
    />
  )
}
