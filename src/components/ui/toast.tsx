import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react'
import { useStore } from '../../lib/store'
import { cn } from '../../lib/utils'

const toneStyles = {
  default: { icon: Info, color: 'text-accent', bg: 'bg-accent-soft' },
  success: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success-soft' },
  warning: { icon: TriangleAlert, color: 'text-warning', bg: 'bg-warning-soft' },
  danger: { icon: XCircle, color: 'text-danger', bg: 'bg-danger-soft' },
} as const

export function ToastViewport() {
  const { toasts, dismissToast } = useStore()

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[90] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2">
      {toasts.map((toast) => {
        const meta = toneStyles[toast.tone]
        const Icon = meta.icon
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex animate-slide-right items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-pop"
            role="status"
          >
            <span className={cn('mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md', meta.bg, meta.color)}>
              <Icon size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-5 text-ink">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-xs leading-5 text-muted">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint transition-colors hover:bg-sunken hover:text-ink"
              aria-label="关闭提示"
            >
              <X size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
