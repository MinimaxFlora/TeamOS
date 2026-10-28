import {
  BookOpen,
  Copy,
  Link2,
  Quote,
  RotateCcw,
  Square,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import { useStore } from '../../lib/store'
import type { Message } from '../../lib/types'
import { formatClock } from '../../lib/format'
import { copyText } from '../../lib/utils'
import { AgentAvatar, Avatar } from '../ui/avatar'
import { Badge, StatusPill } from '../ui/badge'
import { AttachmentCard } from './AttachmentCard'
import { RunTimeline } from './RunTimeline'
import { IconTip } from '../ui/tooltip'
import { cn } from '../../lib/utils'

export function MessageItem({
  message,
  highlightName,
  onQuote,
}: {
  message: Message
  highlightName?: string
  onQuote: (message: Message) => void
}) {
  const { state, notify, stopRun, retryRun, setFeedback } = useStore()

  if (message.authorType === 'system') {
    return (
      <div className="my-3 flex items-center justify-center px-5">
        <span className="inline-flex max-w-full items-center rounded-full border border-line bg-raised px-3 py-1 text-center text-[11px] leading-5 text-faint">
          {message.content}
        </span>
      </div>
    )
  }

  const quoted = message.quotedId
    ? state.messages.find((m) => m.id === message.quotedId)
    : undefined
  const quotedAuthor = quoted
    ? quoted.authorType === 'agent'
      ? state.agents.find((a) => a.id === quoted.authorId)?.name
      : state.members.find((m) => m.id === quoted.authorId)?.name
    : undefined

  const quoteBlock = quoted ? (
    <div className="mb-2 max-w-[520px] rounded-md border-l-2 border-accent-line bg-raised px-2.5 py-1.5">
      <div className="text-[10.5px] text-accent-strong">
        {quotedAuthor ?? '成员'} · {formatClock(quoted.createdAt)}
      </div>
      <div className="truncate text-[11px] text-muted">{quoted.content || '（附件消息）'}</div>
    </div>
  ) : null

  if (message.authorType === 'human') {
    const author = state.members.find((m) => m.id === message.authorId)
    const name = author?.name ?? '未知成员'
    return (
      <div className="group flex gap-3 px-4 py-2.5 transition-colors hover:bg-raised/70 lg:px-5">
        <Avatar name={name} color={author?.color ?? '#6f7684'} size="md" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className={cn(
                'text-[13px] font-semibold text-ink',
                highlightName === name && 'text-accent-strong',
              )}
            >
              {name}
            </span>
            <span className="text-[10.5px] text-muted">{author?.jobTitle ?? '成员'}</span>
            <span className="text-[10.5px] text-faint">{formatClock(message.createdAt)}</span>
            <div className="ml-auto flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              <IconTip label="引用回复">
                <button
                  type="button"
                  onClick={() => onQuote(message)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-faint hover:bg-sunken hover:text-ink"
                  aria-label="引用回复"
                >
                  <Quote size={13} />
                </button>
              </IconTip>
              <IconTip label="复制">
                <button
                  type="button"
                  onClick={() =>
                    copyText(message.content)
                      .then(() => notify('消息已复制'))
                      .catch(() => notify('复制失败', { tone: 'warning' }))
                  }
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-faint hover:bg-sunken hover:text-ink"
                  aria-label="复制消息"
                >
                  <Copy size={13} />
                </button>
              </IconTip>
            </div>
          </div>
          {quoteBlock}
          <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-6 text-ink-soft">
            {message.content}
          </p>
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {message.attachments.map((attachment) => (
                <AttachmentCard key={attachment.id} attachment={attachment} />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const agent = state.agents.find((a) => a.id === message.authorId)
  const run = message.runId ? state.runs.find((r) => r.id === message.runId) : undefined
  const status = run?.status
  const isRunning = status === 'running'
  const canRetry = status === 'failed' || status === 'stopped'
  const hasContent = message.content.trim().length > 0

  return (
    <div className="mx-3 my-3 overflow-hidden rounded-xl border border-line bg-surface shadow-card sm:mx-4 lg:mx-5">
      <div
        className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5"
        style={{ backgroundColor: `${agent?.color ?? '#2f55d4'}09` }}
      >
        <AgentAvatar
          icon={agent?.icon ?? 'sparkles'}
          color={agent?.color ?? '#2f55d4'}
          size="sm"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-ink">
              {agent?.name ?? '助理'}
            </span>
            <Badge tone="accent" className="h-[17px] px-1.5 text-[9.5px] font-semibold tracking-wide">
              AI 助理
            </Badge>
          </div>
          <div className="truncate text-[10.5px] text-muted">{agent?.title ?? ''}</div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {status && <StatusPill status={status} />}
          <span className="text-[10.5px] text-faint">{formatClock(message.createdAt)}</span>
        </div>
      </div>

      <div className="px-3.5 py-3">
        {quoteBlock}
        {isRunning ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-[12px] text-muted">
              <span className="inline-flex h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
              正在处理这条消息，完成后会直接回复在这里。
            </div>
            {run && <RunTimeline run={run} />}
          </div>
        ) : (
          <>
            {hasContent && (
              <p className="whitespace-pre-wrap text-[13px] leading-6 text-ink-soft">{message.content}</p>
            )}
            {!hasContent && status === 'stopped' && (
              <p className="text-[12.5px] text-muted">已停止生成，没有产生新的内容。</p>
            )}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {message.attachments.map((attachment) => (
                  <AttachmentCard key={attachment.id} attachment={attachment} />
                ))}
              </div>
            )}
            {message.sources && message.sources.length > 0 && (
              <div className="mt-3 rounded-lg border border-line bg-raised px-3 py-2">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
                  <Link2 size={10} /> 引用来源
                </div>
                <div className="space-y-1">
                  {message.sources.map((source) => (
                    <div key={source.label} className="flex items-start gap-1.5">
                      <BookOpen size={11} className="mt-[4px] shrink-0 text-faint" />
                      <div className="min-w-0">
                        <div className="truncate text-[11px] text-ink-soft">{source.label}</div>
                        <div className="truncate text-[10px] text-faint">{source.meta}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {run && (
              <div className="mt-3">
                <RunTimeline run={run} />
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-line px-2 py-1.5">
        <button
          type="button"
          disabled={!hasContent}
          onClick={() =>
            copyText(message.content)
              .then(() => notify('回复已复制'))
              .catch(() => notify('复制失败', { tone: 'warning' }))
          }
          className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10.5px] text-faint transition-colors hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          <Copy size={11} /> 复制
        </button>
        <button
          type="button"
          disabled={!hasContent}
          onClick={() => onQuote(message)}
          className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10.5px] text-faint transition-colors hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          <Quote size={11} /> 引用
        </button>
        <div className="ml-1 flex items-center gap-0.5">
          <IconTip label="回答有用">
            <button
              type="button"
              disabled={!hasContent}
              onClick={() => setFeedback(message.id, 'up')}
              aria-pressed={message.feedback === 'up'}
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-sunken disabled:pointer-events-none disabled:opacity-40',
                message.feedback === 'up' ? 'bg-success-soft text-success' : 'text-faint hover:text-ink',
              )}
            >
              <ThumbsUp size={11} />
            </button>
          </IconTip>
          <IconTip label="回答有问题">
            <button
              type="button"
              disabled={!hasContent}
              onClick={() => setFeedback(message.id, 'down')}
              aria-pressed={message.feedback === 'down'}
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-sunken disabled:pointer-events-none disabled:opacity-40',
                message.feedback === 'down' ? 'bg-danger-soft text-danger' : 'text-faint hover:text-ink',
              )}
            >
              <ThumbsDown size={11} />
            </button>
          </IconTip>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {run && (
            <span className="hidden text-[10px] text-faint sm:inline">运行 {run.id.slice(0, 8)}</span>
          )}
          {isRunning && run && (
            <button
              type="button"
              onClick={() => stopRun(run.id)}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-line px-2 text-[10.5px] font-medium text-ink-soft transition-colors hover:border-danger/30 hover:bg-danger-soft hover:text-danger"
            >
              <Square size={9} fill="currentColor" /> 停止
            </button>
          )}
          {canRetry && run && (
            <button
              type="button"
              onClick={() => retryRun(run.id)}
              className="inline-flex h-6 items-center gap-1 rounded-md bg-accent-soft px-2 text-[10.5px] font-medium text-accent-strong transition-colors hover:bg-accent-line/60"
            >
              <RotateCcw size={10} /> 重试
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
