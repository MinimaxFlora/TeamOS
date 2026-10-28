import {
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  LoaderCircle,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type { Run } from '../../lib/types'
import { formatCost, formatDuration } from '../../lib/format'
import { cn } from '../../lib/utils'

export function RunTimeline({ run }: { run: Run }) {
  const [expanded, setExpanded] = useState(run.status !== 'done')
  const isRunning = run.status === 'running'
  const doneCount = run.steps.filter((s) => s.state === 'done').length
  const progress = Math.round((doneCount / run.steps.length) * 100)

  if (run.status === 'done' && !expanded) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1 font-medium text-success">
          <Check size={12} strokeWidth={2.4} />
          已完成 {run.steps.length} 个步骤
        </span>
        <span className="text-line-strong">·</span>
        <span>{formatDuration(run.durationSec)}</span>
        <span className="text-line-strong">·</span>
        <span>{formatCost(run.cost)}</span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-faint transition-colors hover:text-ink"
        >
          查看执行过程 <ChevronDown size={11} />
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-line bg-raised px-3 py-2.5">
      {isRunning && (
        <div className="mb-2.5 flex items-center justify-between gap-2 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <LoaderCircle size={12} className="animate-spin text-accent" />
            正在执行，已用 {formatDuration(Math.max(1, Math.round((Date.now() - new Date(run.startedAt).getTime()) / 1000)))}
          </span>
          <span className="tabular">{progress}%</span>
        </div>
      )}
      {isRunning && (
        <div className="mb-2.5 h-1 overflow-hidden rounded-full bg-sunken">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${Math.max(progress, 8)}%` }}
          />
        </div>
      )}
      <ol className="space-y-2">
        {run.steps.map((step, index) => {
          const state =
            run.status === 'stopped' && step.state === 'active' ? 'pending' : step.state
          return (
            <li key={`${step.label}-${index}`} className="flex items-start gap-2">
              <span
                className={cn(
                  'mt-0.5 inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full',
                  state === 'done' && 'bg-success-soft text-success',
                  state === 'active' && 'text-accent',
                  state === 'failed' && 'bg-danger-soft text-danger',
                  state === 'pending' && 'text-faint',
                )}
              >
                {state === 'done' && <Check size={11} strokeWidth={2.6} />}
                {state === 'active' && <LoaderCircle size={13} className="animate-spin" />}
                {state === 'failed' && <X size={11} strokeWidth={2.6} />}
                {state === 'pending' && <Circle size={7} fill="currentColor" />}
              </span>
              <div className="min-w-0">
                <div
                  className={cn(
                    'text-[12px] leading-4',
                    state === 'active'
                      ? 'font-medium text-ink'
                      : state === 'pending'
                        ? 'text-faint'
                        : 'text-ink-soft',
                  )}
                >
                  {step.label}
                </div>
                {step.detail && (
                  <div className="mt-0.5 text-[10.5px] leading-4 text-faint">{step.detail}</div>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {run.error && run.status !== 'running' && (
        <div className="mt-2.5 flex items-start gap-1.5 rounded-md border border-danger/15 bg-danger-soft px-2.5 py-1.5 text-[11px] leading-5 text-danger">
          <TriangleAlert size={12} className="mt-[3px] shrink-0" />
          <span>{run.error}</span>
        </div>
      )}

      {!isRunning && (
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2 text-[10.5px] text-faint">
          <span>
            {run.status === 'done' ? '完成' : run.status === 'failed' ? '失败' : '已停止'} ·{' '}
            {formatDuration(run.durationSec ?? 0)} · {formatCost(run.cost ?? 0)}
          </span>
          {run.status === 'done' && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex items-center gap-0.5 transition-colors hover:text-ink"
            >
              收起 <ChevronUp size={11} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
