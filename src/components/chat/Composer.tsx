import {
  ArrowUp,
  AtSign,
  CornerDownLeft,
  FilePlus2,
  Quote,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Agent, Attachment, Group, Message } from '../../lib/types'
import { useStore } from '../../lib/store'
import { cn, uid } from '../../lib/utils'
import { AgentAvatar } from '../ui/avatar'
import { formatClock } from '../../lib/format'
import { formatFileSize, kindFromName } from './AttachmentCard'

export function Composer({
  group,
  quoted,
  onClearQuote,
  disabled = false,
  initialValue = '',
}: {
  group: Group
  quoted?: Message
  onClearQuote: () => void
  disabled?: boolean
  initialValue?: string
}) {
  const { state, sendMessage, notify } = useStore()
  const [value, setValue] = useState(initialValue)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState(-1)
  const [activeIndex, setActiveIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const availableAgents = useMemo(
    () => state.agents.filter((agent) => agent.status === 'published'),
    [state.agents],
  )
  const mentionMatches = mentionQuery === null
    ? []
    : availableAgents.filter((agent) =>
        mentionQuery ? agent.name.includes(mentionQuery) || agent.title.includes(mentionQuery) : true,
      )

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(168, Math.max(46, el.scrollHeight))}px`
  }, [value])

  useEffect(() => {
    setActiveIndex(0)
  }, [mentionQuery])

  useEffect(() => {
    if (quoted) textareaRef.current?.focus()
  }, [quoted])

  useEffect(() => {
    if (!initialValue) return
    const el = textareaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
    // Only focus on mount; later edits are the user's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const quotedAuthor = quoted
    ? quoted.authorType === 'agent'
      ? state.agents.find((agent) => agent.id === quoted.authorId)?.name
      : state.members.find((member) => member.id === quoted.authorId)?.name
    : undefined

  const updateMentionState = (next: string, caret: number) => {
    const before = next.slice(0, caret)
    const match = /(?:^|\s)@([^\s@]{0,20})$/.exec(before)
    if (match) {
      setMentionStart(caret - match[1].length - 1)
      setMentionQuery(match[1])
    } else {
      setMentionStart(-1)
      setMentionQuery(null)
    }
  }

  const insertMention = (agent: Agent) => {
    const el = textareaRef.current
    const caret = el?.selectionStart ?? value.length
    const start = mentionStart >= 0 ? mentionStart : caret
    const next = `${value.slice(0, start)}@${agent.name} ${value.slice(caret)}`
    setValue(next)
    setMentionQuery(null)
    setMentionStart(-1)
    requestAnimationFrame(() => {
      const position = start + agent.name.length + 2
      el?.focus()
      el?.setSelectionRange(position, position)
    })
  }

  const appendMention = (agent: Agent) => {
    const needsSpace = value.length > 0 && !/\s$/.test(value)
    const next = `${value}${needsSpace ? ' ' : ''}@${agent.name} `
    setValue(next)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      el?.focus()
      el?.setSelectionRange(next.length, next.length)
    })
  }

  const openMentionMenu = () => {
    const el = textareaRef.current
    if (!el) return
    if (mentionQuery !== null) {
      setMentionQuery(null)
      return
    }
    const caret = el.selectionStart ?? value.length
    const before = value.slice(0, caret)
    const insert = `${before.length > 0 && !/\s$/.test(before) ? ' ' : ''}@`
    const next = `${before}${insert}${value.slice(caret)}`
    setValue(next)
    setMentionStart(caret + insert.length - 1)
    setMentionQuery('')
    requestAnimationFrame(() => {
      el.focus()
      const position = caret + insert.length
      el.setSelectionRange(position, position)
    })
  }

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const accepted: Attachment[] = []
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        notify(`${file.name} 超过 20 MB`, {
          description: '当前限制单个附件 20 MB。',
          tone: 'warning',
        })
        continue
      }
      accepted.push({
        id: uid('att'),
        name: file.name,
        size: formatFileSize(file.size),
        kind: kindFromName(file.name),
      })
    }
    if (accepted.length > 0) {
      setAttachments((prev) => [...prev, ...accepted].slice(0, 5))
      notify(`已添加 ${accepted.length} 个附件`, {
        description: '当前版本只记录文件名与大小，不会上传文件内容。',
      })
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleSend = () => {
    if (disabled) return
    const content = value.trim()
    if (!content) {
      if (attachments.length > 0) {
        notify('先写一句说明再发送', {
          description: '请先写一句说明再发送附件。',
          tone: 'warning',
        })
      }
      return
    }

    const mentioned = availableAgents.filter((agent) => content.includes(`@${agent.name}`))
    const runnable = mentioned.filter((agent) => agent.status === 'published')
    sendMessage({
      content,
      mentionAgentIds: runnable.map((agent) => agent.id),
      attachments: attachments.length > 0 ? attachments : undefined,
      quotedId: quoted?.id,
    })
    const silent = mentioned.filter((agent) => agent.status !== 'published')
    if (silent.length > 0) {
      notify(`${silent.map((agent) => agent.name).join('、')} 不会响应`, {
        description: '该助理尚未发布或已停用，消息已发送给群成员。',
        tone: 'warning',
      })
    }
    setValue('')
    setAttachments([])
    setMentionQuery(null)
    setMentionStart(-1)
    onClearQuote()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((index) => (index + 1) % mentionMatches.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((index) => (index - 1 + mentionMatches.length) % mentionMatches.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        insertMention(mentionMatches[activeIndex])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMentionQuery(null)
        return
      }
    }

    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-line bg-surface px-3 pb-3 pt-2.5 sm:px-4 lg:px-5">
      <div className="rounded-xl border border-line-strong bg-surface shadow-card transition-colors focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/10">
        {quoted && (
          <div className="flex items-start gap-2 border-b border-line px-3 py-2">
            <Quote size={13} className="mt-0.5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <div className="text-[10.5px] text-accent-strong">
                回复 {quotedAuthor ?? '成员'} · {formatClock(quoted.createdAt)}
              </div>
              <div className="truncate text-[11.5px] text-muted">{quoted.content || '（附件消息）'}</div>
            </div>
            <button
              type="button"
              onClick={onClearQuote}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint hover:bg-sunken hover:text-ink"
              aria-label="取消引用"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2">
            {attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md border border-line bg-raised px-2 py-1 text-[11px] text-ink-soft"
              >
                <span className="truncate">{attachment.name}</span>
                <span className="shrink-0 text-[10px] text-faint">{attachment.size}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((item) => item.id !== attachment.id))}
                  className="text-faint hover:text-danger"
                  aria-label={`移除 ${attachment.name}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative">
          {mentionQuery !== null && (
            <div
              className="absolute bottom-full left-2 z-20 mb-1 w-[280px] overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-pop"
              role="listbox"
              aria-label="选择要召唤的助理"
            >
              <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-[0.1em] text-faint">
                {mentionMatches.length > 0 ? '可用助理' : '没有匹配的助理'}
              </div>
              {mentionMatches.map((agent, index) => (
                <button
                  key={agent.id}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertMention(agent)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                    index === activeIndex ? 'bg-sunken' : 'hover:bg-raised',
                  )}
                >
                  <AgentAvatar icon={agent.icon} color={agent.color} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-ink">
                      @{agent.name}
                    </span>
                    <span className="block truncate text-[10.5px] text-muted">{agent.title}</span>
                  </span>
                </button>
              ))}
              <div className="mt-1 border-t border-line px-2.5 pb-1 pt-1.5 text-[10px] text-faint">
                ↑↓ 选择 · Enter 插入 · Esc 关闭
              </div>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={value}
            rows={1}
            disabled={disabled}
            onChange={(event) => {
              setValue(event.target.value)
              updateMentionState(event.target.value, event.target.selectionStart ?? 0)
            }}
            onKeyDown={handleKeyDown}
            onClick={(event) => {
              const target = event.currentTarget
              updateMentionState(value, target.selectionStart ?? 0)
            }}
            onBlur={() => window.setTimeout(() => setMentionQuery(null), 120)}
            placeholder={
              disabled
                ? '上下文已满，请归档并开启新会话后继续…'
                : `发消息到${group.name}，输入 @ 召唤助理…`
            }
            aria-label={`发送消息到 ${group.name}`}
            className="max-h-[168px] min-h-[46px] w-full resize-none bg-transparent px-3 py-2.5 text-[13px] leading-6 text-ink outline-none placeholder:text-faint disabled:cursor-not-allowed"
          />
        </div>

        <div className="flex items-center gap-1 px-2 pb-1.5 pt-0.5">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="sr-only"
            accept=".doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp"
            onChange={(event) => handleFiles(event.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-40"
            aria-label="添加附件"
            title="添加附件（当前版本只记录元数据）"
          >
            <FilePlus2 size={15} />
          </button>
          <button
            type="button"
            onClick={openMentionMenu}
            disabled={disabled}
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
              mentionQuery !== null
                ? 'bg-accent-soft text-accent-strong'
                : 'text-faint hover:bg-sunken hover:text-ink',
            )}
            aria-label="提及助理"
            aria-expanded={mentionQuery !== null}
            title="提及助理"
          >
            <AtSign size={15} />
          </button>

          <div className="mx-1 h-4 w-px bg-line" />

          <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {availableAgents.length > 0 ? (
              availableAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => appendMention(agent)}
                  disabled={disabled}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong disabled:pointer-events-none disabled:opacity-40"
                  title={`@${agent.name} · ${agent.title}`}
                >
                  <AgentAvatar icon={agent.icon} color={agent.color} size="xs" />
                  <span className="max-sm:hidden">{agent.name}</span>
                </button>
              ))
            ) : (
              <span className="truncate text-[10.5px] text-faint">还没有已发布的助理</span>
            )}
          </div>

          <span className="hidden shrink-0 items-center gap-1 text-[10px] text-faint md:inline-flex">
            <CornerDownLeft size={10} /> 发送 · Shift+Enter 换行
          </span>
          <button
            type="button"
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            className="ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-card transition-colors hover:bg-accent-strong disabled:pointer-events-none disabled:opacity-40"
            aria-label="发送消息"
          >
            <ArrowUp size={16} strokeWidth={2.2} />
          </button>
        </div>
      </div>
      <p className="mt-1.5 px-1 text-[10px] leading-4 text-faint">
        {disabled
          ? '当前会话的上下文已满。归档后会保留摘要并开启新会话，避免继续消耗 token。'
          : '助理会读取当前会话的上下文与已授权知识；执行过程和引用来源会记录在消息里。'}
      </p>
    </div>
  )
}
