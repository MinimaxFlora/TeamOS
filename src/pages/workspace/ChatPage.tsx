import {
  Archive,
  Bot,
  Brain,
  Check,
  ChevronRight,
  Hash,
  History,
  MessagesSquare,
  PanelLeft,
  Plus,
  Search,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../../lib/store'
import type { ChatSession, Message } from '../../lib/types'
import { cn } from '../../lib/utils'
import { formatDay, formatRelative, isSameDay } from '../../lib/format'
import {
  CONTEXT_BUDGET,
  CONTEXT_LIMIT,
  CONTEXT_WARN,
  contextUsage,
  summarizeMessages,
} from '../../lib/context'
import { AgentAvatar } from '../../components/ui/avatar'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/ui/dialog'
import { EmptyState } from '../../components/ui/empty-state'
import { IconTip } from '../../components/ui/tooltip'
import { MessageItem } from '../../components/chat/MessageItem'
import { Composer } from '../../components/chat/Composer'

function SessionList({
  sessions,
  activeSessionId,
  viewSessionId,
  activeMessages,
  onSelect,
  onNew,
  onBrowseAgents,
}: {
  sessions: ChatSession[]
  activeSessionId: string
  viewSessionId: string
  activeMessages: Message[]
  onSelect: (id: string) => void
  onNew: () => void
  onBrowseAgents: () => void
}) {
  const activeSession = sessions.find((session) => session.id === activeSessionId)
  const activeUsage = contextUsage(activeMessages)
  const archived = sessions
    .filter((session) => session.id !== activeSessionId)
    .sort(
      (a, b) =>
        new Date(b.archivedAt ?? b.createdAt).getTime() -
        new Date(a.archivedAt ?? a.createdAt).getTime(),
    )
  const memory = activeSession?.memory ?? []
  const tone =
    activeUsage.percent >= 90
      ? 'text-danger'
      : activeUsage.percent >= 70
        ? 'text-warning'
        : 'text-accent'
  const barTone =
    activeUsage.percent >= 90
      ? 'bg-danger'
      : activeUsage.percent >= 70
        ? 'bg-warning'
        : 'bg-accent'

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#fbfbfc]">
      <div className="shrink-0 px-3 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-semibold text-ink">会话与记忆</h2>
          <Badge tone="outline" className="h-[18px] px-1.5 text-[9px]">
            单一大厅
          </Badge>
        </div>
        <p className="mt-0.5 text-[10.5px] leading-4 text-faint">
          所有人共用一个聊天页；上下文变长时归档为记忆并开新会话。
        </p>
      </div>

      <div className="shrink-0 px-2.5 pb-2.5">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-lg border border-accent-line bg-accent-soft px-2.5 py-2 text-left text-[12px] font-medium text-accent-strong transition-colors hover:bg-accent-soft/70"
        >
          <Plus size={14} />
          开启新会话
          <span className="ml-auto text-[9.5px] font-normal text-accent/80">归档当前会话</span>
        </button>
      </div>

      <div className="shrink-0 px-2.5 pb-3">
        <div className="rounded-lg border border-line bg-surface px-2.5 py-2 shadow-card">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-medium uppercase tracking-[0.08em] text-faint">当前上下文</span>
            <span className={cn('tabular font-semibold', tone)}>{activeUsage.percent}%</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sunken">
            <div
              className={cn('h-full rounded-full transition-[width]', barTone)}
              style={{ width: `${Math.max(3, activeUsage.percent)}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[9.5px] text-faint">
            <span>约 {activeUsage.tokens.toLocaleString()} tokens</span>
            <span>预算 {CONTEXT_BUDGET.toLocaleString()}</span>
          </div>
          {activeUsage.percent >= CONTEXT_WARN * 100 && (
            <p className={cn('mt-1.5 text-[10px] leading-4', tone)}>
              已接近预算。建议归档并开启新会话，避免继续为长上下文付费。
            </p>
          )}
        </div>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-2">
        <div>
          <div className="px-1.5 pb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-faint">
            本会话记忆
          </div>
          <div className="rounded-lg border border-line bg-surface px-2.5 py-2">
            {memory.length > 0 ? (
              <ul className="space-y-1">
                {memory.map((item) => (
                  <li key={item} className="flex items-start gap-1.5 text-[10.5px] leading-4 text-muted">
                    <Brain size={10} className="mt-0.5 shrink-0 text-accent" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[10.5px] leading-4 text-faint">
                还没有继承记忆。归档当前会话后，摘要会作为轻量记忆带入新会话。
              </p>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 px-1.5 pb-1">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-faint">
              历史会话
            </span>
            <span className="text-[9.5px] text-faint">{archived.length}</span>
          </div>
          <button
            type="button"
            onClick={() => onSelect(activeSessionId)}
            aria-current={viewSessionId === activeSessionId ? 'true' : undefined}
            className={cn(
              'flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors',
              viewSessionId === activeSessionId
                ? 'bg-surface shadow-card ring-1 ring-line'
                : 'hover:bg-sunken/70',
            )}
          >
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
              <MessagesSquare size={13} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[11.5px] font-medium text-ink">
                  {activeSession?.title ?? '当前会话'}
                </span>
                <span className="ml-auto shrink-0 rounded bg-accent-soft px-1 text-[8.5px] text-accent-strong">
                  当前
                </span>
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-muted">
                {activeMessages.length} 条消息 · 约 {activeUsage.tokens.toLocaleString()} tokens
              </span>
            </span>
          </button>

          <div className="mt-1 space-y-0.5">
            {archived.length === 0 ? (
              <p className="px-2 py-2 text-[10.5px] leading-4 text-faint">
                还没有归档会话。上下文变长后，点「开启新会话」即可保存记忆。
              </p>
            ) : (
              archived.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onSelect(session.id)}
                  aria-current={viewSessionId === session.id ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors',
                    viewSessionId === session.id
                      ? 'bg-surface shadow-card ring-1 ring-line'
                      : 'hover:bg-sunken/70',
                  )}
                >
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sunken text-muted">
                    <Archive size={12} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="truncate text-[11.5px] font-medium text-ink-soft">
                        {session.title}
                      </span>
                      <span className="ml-auto shrink-0 text-[9px] text-faint">
                        {formatRelative(session.archivedAt ?? session.createdAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted">
                      {session.messageCount} 条消息 · {session.summary.length} 条记忆
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-line p-2">
        <button
          type="button"
          onClick={onBrowseAgents}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11.5px] text-muted transition-colors hover:bg-sunken hover:text-ink"
        >
          <Bot size={14} className="text-faint" />
          浏览 AI 助理
          <ChevronRight size={12} className="ml-auto text-faint" />
        </button>
      </div>
    </div>
  )
}

export function ChatPage() {
  const {
    state,
    currentUser,
    markGroupRead,
    archiveAndStartNewSession,
    notify,
  } = useStore()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const draft = searchParams.get('draft') ?? ''
  const [listOpen, setListOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [quoted, setQuoted] = useState<Message | undefined>()
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [showJump, setShowJump] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)

  const hall = state.groups.find((group) => group.id === 'g_all') ?? state.groups[0]
  const activeSession = state.sessions.find((session) => session.id === state.activeSessionId)
  const requestedId = searchParams.get('session')
  const requestedSession = state.sessions.find((session) => session.id === requestedId)
  const viewSession = requestedSession ?? activeSession
  const viewingArchived = Boolean(
    viewSession?.archivedAt && viewSession.id !== activeSession?.id,
  )

  // A draft arrives as ?draft=… when jumping here from knowledge or meetings.
  // Consume it once: the composer keeps the text, and the URL stays clean.
  useEffect(() => {
    if (!searchParams.has('draft')) return
    const next = new URLSearchParams(searchParams)
    next.delete('draft')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const activeMessages = useMemo(
    () =>
      activeSession
        ? state.messages
            .filter((message) => message.sessionId === activeSession.id)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        : [],
    [activeSession, state.messages],
  )
  const sessionMessages = useMemo(
    () =>
      viewSession
        ? state.messages
            .filter((message) => message.sessionId === viewSession.id)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        : [],
    [state.messages, viewSession],
  )

  const visibleMessages = useMemo(() => {
    const needle = query.trim()
    if (!searchOpen || !needle) return sessionMessages
    return sessionMessages.filter((message) => {
      if (message.content.includes(needle)) return true
      if (message.authorType === 'human') {
        const author = state.members.find((member) => member.id === message.authorId)
        return Boolean(author?.name.includes(needle))
      }
      if (message.authorType === 'agent') {
        const agent = state.agents.find((item) => item.id === message.authorId)
        return Boolean(agent?.name.includes(needle))
      }
      return false
    })
  }, [sessionMessages, query, searchOpen, state.members, state.agents])

  const agents = useMemo(
    () => state.agents.filter((agent) => agent.status === 'published'),
    [state.agents],
  )
  const members = state.members.filter((member) => member.status === 'active')
  const usage = contextUsage(activeMessages)
  const viewUsage = viewingArchived ? contextUsage(sessionMessages) : usage
  const blocked = !viewingArchived && usage.percent >= CONTEXT_LIMIT * 100
  const running = state.runs.some(
    (run) => run.sessionId === activeSession?.id && run.status === 'running',
  )

  const archivePreview = useMemo(
    () => summarizeMessages(activeMessages, state.agents, state.members),
    [activeMessages, state.agents, state.members],
  )

  useEffect(() => {
    setQuoted(undefined)
    setSearchOpen(false)
    setQuery('')
    setShowJump(false)
    stickRef.current = true
  }, [viewSession?.id])

  useEffect(() => {
    if (hall) markGroupRead(hall.id)
  }, [hall, markGroupRead])

  useEffect(() => {
    if (!stickRef.current) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [visibleMessages.length, viewSession?.id, searchOpen])

  if (!currentUser || !hall || !activeSession || !viewSession) return null

  const openSession = (id: string) => {
    setListOpen(false)
    if (id === state.activeSessionId) navigate('/workspace/chat')
    else navigate(`/workspace/chat?session=${id}`)
  }

  const startNew = () => {
    setListOpen(false)
    if (!activeMessages.some((message) => message.authorType !== 'system')) {
      notify('当前会话还没有消息', {
        description: '直接开始聊天即可；有内容后归档才有可保存的记忆。',
      })
      return
    }
    if (running) {
      notify('还有助理在运行', {
        description: '等这次运行结束或先停止，再归档会话。',
        tone: 'warning',
      })
      return
    }
    setArchiveOpen(true)
  }

  const confirmArchive = () => {
    const result = archiveAndStartNewSession()
    if (!result.ok) {
      notify(result.error ?? '归档失败，请稍后再试。', { tone: 'warning' })
      return
    }
    setArchiveOpen(false)
    navigate('/workspace/chat')
  }

  const scrollToBottom = () => {
    stickRef.current = true
    setShowJump(false)
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-[264px] shrink-0 border-r border-line md:block">
        <SessionList
          sessions={state.sessions}
          activeSessionId={activeSession.id}
          viewSessionId={viewSession.id}
          activeMessages={activeMessages}
          onSelect={openSession}
          onNew={startNew}
          onBrowseAgents={() => navigate('/workspace/agents')}
        />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-canvas">
        <header className="flex h-[58px] shrink-0 items-center gap-2.5 border-b border-line bg-surface px-3 sm:px-4">
          <button
            type="button"
            onClick={() => setListOpen(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink md:hidden"
            aria-label="打开会话与记忆"
          >
            <PanelLeft size={16} />
          </button>

          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Hash size={16} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[14px] font-semibold text-ink">公司大厅</h1>
              {viewingArchived ? (
                <Badge tone="neutral" className="h-[17px] px-1.5 text-[9px]">
                  已归档 · 只读
                </Badge>
              ) : (
                <Badge tone="accent" className="h-[17px] px-1.5 text-[9px]">
                  全员
                </Badge>
              )}
            </div>
            <p className="mt-0.5 truncate text-[10.5px] text-muted">
              {viewingArchived
                ? `${viewSession.title} · 记忆已带入当前会话`
                : `${viewSession.title} · ${members.length} 人 · ${agents.length} 个助理`}
            </p>
          </div>

          <div className="hidden items-center -space-x-1 lg:flex">
            {agents.slice(0, 4).map((agent) => (
              <AgentAvatar
                key={agent.id}
                icon={agent.icon}
                color={agent.color}
                size="sm"
                title={`${agent.name} · ${agent.title}`}
                className="ring-2 ring-surface"
              />
            ))}
            {agents.length > 4 && (
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] border border-line bg-raised text-[10px] text-muted ring-2 ring-surface">
                +{agents.length - 4}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setListOpen(true)}
            className={cn(
              'hidden h-8 items-center gap-1.5 rounded-lg border px-2 text-[10.5px] tabular md:inline-flex',
              viewUsage.percent >= 90
                ? 'border-danger/20 bg-danger-soft text-danger'
                : viewUsage.percent >= 70
                  ? 'border-warning/20 bg-warning-soft text-warning'
                  : 'border-line bg-raised text-muted',
            )}
            title={`${viewingArchived ? '归档快照' : '估算上下文'}约 ${viewUsage.tokens.toLocaleString()} tokens`}
          >
            <Brain size={12} /> {viewUsage.percent}%
          </button>

          <div className="flex items-center gap-0.5">
            <IconTip label={searchOpen ? '关闭搜索' : '搜索消息'}>
              <button
                type="button"
                onClick={() => {
                  setSearchOpen((open) => !open)
                  setQuery('')
                }}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                  searchOpen
                    ? 'bg-accent-soft text-accent-strong'
                    : 'text-muted hover:bg-sunken hover:text-ink',
                )}
                aria-label="搜索消息"
                aria-pressed={searchOpen}
              >
                {searchOpen ? <X size={15} /> : <Search size={15} />}
              </button>
            </IconTip>
            <IconTip label="归档并开启新会话">
              <button
                type="button"
                onClick={startNew}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink"
                aria-label="归档并开启新会话"
              >
                <Plus size={16} />
              </button>
            </IconTip>
          </div>
        </header>

        {searchOpen && (
          <div className="flex shrink-0 items-center gap-2 border-b border-line bg-raised px-3 py-2 sm:px-4">
            <Search size={13} className="shrink-0 text-faint" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="在当前会话中搜索消息、成员或助理…"
              aria-label="搜索当前会话消息"
              className="h-7 min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-faint"
            />
            <span className="shrink-0 text-[10.5px] text-faint">
              {query.trim() ? `${visibleMessages.length} 条结果` : '输入关键词'}
            </span>
          </div>
        )}

        {viewingArchived && (
          <div className="flex shrink-0 items-center gap-2 border-b border-line bg-raised px-3 py-2 text-[11px] text-muted sm:px-4">
            <Archive size={13} className="shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate">
              正在查看已归档会话，原始消息只读；摘要已作为记忆带入当前会话。
            </span>
            <button
              type="button"
              onClick={() => navigate('/workspace/chat')}
              className="shrink-0 font-medium text-accent hover:text-accent-strong"
            >
              返回当前会话
            </button>
          </div>
        )}

        {!viewingArchived && usage.percent >= CONTEXT_WARN * 100 && (
          <div
            className={cn(
              'flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-4',
              blocked
                ? 'border-danger/15 bg-danger-soft'
                : 'border-warning/15 bg-warning-soft',
            )}
          >
            <Brain
              size={14}
              className={cn('shrink-0', blocked ? 'text-danger' : 'text-warning')}
            />
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  'text-[11.5px] font-medium',
                  blocked ? 'text-danger' : 'text-warning',
                )}
              >
                {blocked
                  ? '上下文已满，继续发送会显著增加 token 成本'
                  : `上下文已用 ${usage.percent}%，建议归档当前会话`}
              </div>
              <p
                className={cn(
                  'mt-0.5 text-[10.5px] leading-4',
                  blocked ? 'text-danger/80' : 'text-warning/90',
                )}
              >
                归档会保存 {archivePreview.length} 条记忆摘要并开启新会话；原始消息仍可在历史中查看。
              </p>
            </div>
            <Button size="sm" variant={blocked ? 'primary' : 'secondary'} onClick={startNew}>
              <Archive size={13} /> 归档并开新会话
            </Button>
          </div>
        )}

        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={() => {
              const el = scrollRef.current
              if (!el) return
              const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
              stickRef.current = nearBottom
              setShowJump(!nearBottom)
            }}
            className="h-full overflow-y-auto py-2"
          >
            {visibleMessages.length === 0 ? (
              <div className="px-5 py-8">
                <EmptyState
                  icon={searchOpen && query.trim() ? Search : MessagesSquare}
                  title={searchOpen && query.trim() ? '没有找到相关消息' : '这里还没有消息'}
                  description={
                    searchOpen && query.trim()
                      ? '换个关键词，或关闭搜索查看全部对话。'
                      : agents.length > 0
                        ? `发第一条消息，或者直接输入 @ 召唤 ${agents
                            .slice(0, 2)
                            .map((agent) => agent.name)
                            .join('、')}。`
                        : '公司还没有发布助理，先和同事打个招呼吧。'
                  }
                  compact
                />
              </div>
            ) : (
              visibleMessages.map((message, index) => {
                const previous = visibleMessages[index - 1]
                const showDay =
                  !previous ||
                  !isSameDay(new Date(previous.createdAt), new Date(message.createdAt))
                return (
                  <div key={message.id}>
                    {showDay && (
                      <div className="my-3 flex items-center gap-3 px-5">
                        <div className="h-px flex-1 bg-line" />
                        <span className="text-[10px] font-medium text-faint">
                          {formatDay(message.createdAt)}
                        </span>
                        <div className="h-px flex-1 bg-line" />
                      </div>
                    )}
                    <MessageItem message={message} onQuote={setQuoted} />
                  </div>
                )
              })
            )}
          </div>

          {showJump && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[10.5px] text-muted shadow-pop transition-colors hover:text-ink"
            >
              <Check size={11} /> 回到最新
            </button>
          )}
        </div>

        {viewingArchived ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface px-4 py-3">
            <History size={14} className="shrink-0 text-faint" />
            <p className="min-w-0 flex-1 text-[11px] leading-5 text-muted">
              这是归档快照，不能继续回复。它的 {viewSession.summary.length} 条记忆已带入当前会话。
            </p>
            <Button size="sm" variant="secondary" onClick={() => navigate('/workspace/chat')}>
              返回当前会话
            </Button>
          </div>
        ) : (
          <Composer
            key={activeSession.id}
            group={hall}
            initialValue={draft}
            quoted={quoted}
            onClearQuote={() => setQuoted(undefined)}
            disabled={blocked}
          />
        )}
      </section>

      <aside className="hidden w-[292px] shrink-0 border-l border-line bg-surface xl:block">
        <div className="h-full overflow-y-auto">
          <div className="border-b border-line px-4 py-3.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Sparkles size={14} />
              </span>
              <div>
                <div className="text-[12.5px] font-semibold text-ink">轻量记忆</div>
                <div className="text-[10px] text-faint">归档后只携带摘要，不重放全部消息</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-raised px-2.5 py-2">
                <div className="text-[9.5px] uppercase tracking-wide text-faint">本会话</div>
                <div className="mt-0.5 text-[16px] font-semibold tabular text-ink">
                  {viewingArchived ? viewSession.messageCount : sessionMessages.length}
                  <span className="ml-1 text-[10px] font-normal text-muted">条消息</span>
                </div>
              </div>
              <div className="rounded-lg bg-raised px-2.5 py-2">
                <div className="text-[9.5px] uppercase tracking-wide text-faint">
                  {viewingArchived ? '归档 tokens' : '上下文'}
                </div>
                <div className="mt-0.5 text-[16px] font-semibold tabular text-ink">
                  {viewUsage.tokens.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          <section className="border-b border-line px-4 py-3.5">
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-faint">
              <Brain size={12} /> {viewingArchived ? '归档摘要' : '继承的记忆'}
            </h3>
            {(viewingArchived ? viewSession.summary : activeSession.memory ?? []).length > 0 ? (
              <ul className="space-y-1.5">
                {(viewingArchived ? viewSession.summary : activeSession.memory ?? []).map(
                  (item) => (
                    <li
                      key={item}
                      className="flex items-start gap-1.5 text-[11px] leading-5 text-muted"
                    >
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent/70" />
                      {item}
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p className="text-[11px] leading-5 text-faint">
                当前会话还没有继承记忆。归档时会把议题、产出与参与人压缩成 3–4 条摘要。
              </p>
            )}
          </section>

          <section className="border-b border-line px-4 py-3.5">
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-faint">
              <UsersRound size={12} /> 公司成员
            </h3>
            <div className="flex flex-wrap gap-1">
              {members.slice(0, 8).map((member) => (
                <span
                  key={member.id}
                  className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] text-ink-soft"
                >
                  {member.name} · {member.jobTitle}
                </span>
              ))}
              {members.length > 8 && (
                <span className="px-1 py-0.5 text-[10px] text-faint">+{members.length - 8}</span>
              )}
            </div>
          </section>

          <section className="border-b border-line px-4 py-3.5">
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-faint">
              <Bot size={12} /> 可 @ 的助理 · {agents.length}
            </h3>
            <div className="space-y-2">
              {agents.map((agent) => (
                <div key={agent.id} className="flex items-center gap-2">
                  <AgentAvatar icon={agent.icon} color={agent.color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11.5px] font-medium text-ink">{agent.name}</div>
                    <div className="truncate text-[10px] text-muted">{agent.title}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/workspace/agents')}
                    className="text-[10px] text-faint hover:text-accent"
                  >
                    能力
                  </button>
                </div>
              ))}
            </div>
          </section>

          <div className="px-4 py-4 text-[10px] leading-5 text-faint">
            <div className="flex items-start gap-1.5">
              <Archive size={11} className="mt-0.5 shrink-0" />
              上下文预算按 8,000 tokens 估算；归档摘要在服务端根据消息记录提炼，不额外调用模型。达到 70% 会提示归档，90% 会阻止继续发送。
            </div>
          </div>
        </div>
      </aside>

      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent
          size="md"
          className="left-0 top-0 h-dvh max-h-dvh w-[300px] max-w-[88vw] translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0"
        >
          <DialogHeader
            title="会话与记忆"
            description="归档旧会话，开启一段更省 token 的新会话"
            className="px-4 pb-3 pt-4 pr-12"
          />
          <div className="min-h-0 flex-1">
            <SessionList
              sessions={state.sessions}
              activeSessionId={activeSession.id}
              viewSessionId={viewSession.id}
              activeMessages={activeMessages}
              onSelect={openSession}
              onNew={startNew}
              onBrowseAgents={() => {
                setListOpen(false)
                navigate('/workspace/agents')
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent size="lg">
          <DialogHeader
            title="归档当前会话并开启新会话？"
            description="先保存轻量记忆，再清空上下文。这个操作不会删除原始消息。"
          />
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '当前消息', value: `${activeMessages.length} 条` },
                { label: '上下文', value: `${usage.tokens.toLocaleString()} tokens` },
                { label: '将保留', value: `${archivePreview.length} 条记忆` },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-line bg-raised px-2.5 py-2">
                  <div className="text-[9.5px] uppercase tracking-wide text-faint">{item.label}</div>
                  <div className="mt-0.5 text-[13px] font-semibold tabular text-ink">{item.value}</div>
                </div>
              ))}
            </div>

            <section>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                <Brain size={13} className="text-accent" /> 将写入的记忆摘要
              </h3>
              <ul className="space-y-1.5 rounded-lg border border-line bg-surface px-3 py-2.5">
                {archivePreview.length > 0 ? (
                  archivePreview.map((item) => (
                    <li key={item} className="flex items-start gap-1.5 text-[11.5px] leading-5 text-ink-soft">
                      <span className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-accent/70" />
                      {item}
                    </li>
                  ))
                ) : (
                  <li className="text-[11.5px] leading-5 text-faint">
                    这段会话以系统消息为主，没有可提炼的议题。
                  </li>
                )}
              </ul>
            </section>

            <div className="rounded-lg border border-warning/20 bg-warning-soft px-3 py-2.5 text-[10.5px] leading-5 text-warning">
              新会话只携带上面的摘要，不会把全部历史消息再次发给模型，因此能显著减少 token。
              归档后原会话只读，可在左侧「历史会话」中回看。
              <span className="mt-1 block text-warning/80">
                摘要在服务端根据消息内容生成，不额外调用模型，因此归档不会产生模型费用。
              </span>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setArchiveOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={confirmArchive}>
              <Archive size={14} /> 归档并开启新会话
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
