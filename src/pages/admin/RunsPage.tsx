import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  ExternalLink,
  History,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
  Square,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../../lib/store'
import type { Run, RunStatus, StepState } from '../../lib/types'
import { formatCost, formatDuration, formatRelative, formatTime } from '../../lib/format'
import { cn } from '../../lib/utils'
import { PageBody, PageHeader } from '../../components/layout/PageHeader'
import { AgentAvatar, Avatar } from '../../components/ui/avatar'
import { Badge, StatusPill } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/ui/dialog'
import { EmptyState } from '../../components/ui/empty-state'
import { Select } from '../../components/ui/input'

type StatusFilter = 'all' | RunStatus

const STATUS_ORDER: StatusFilter[] = ['all', 'running', 'done', 'failed', 'stopped']

export function AdminRunsPage() {
  const { state } = useStore()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [agentFilter, setAgentFilter] = useState('all')
  const [sessionFilter, setSessionFilter] = useState('all')

  const statusParam = searchParams.get('status')
  const status: StatusFilter =
    statusParam && STATUS_ORDER.includes(statusParam as StatusFilter)
      ? (statusParam as StatusFilter)
      : 'all'
  const hallRuns = state.runs
  const selectedRun = hallRuns.find((run) => run.id === searchParams.get('run')) ?? null

  const counts = {
    all: hallRuns.length,
    running: hallRuns.filter((run) => run.status === 'running').length,
    done: hallRuns.filter((run) => run.status === 'done').length,
    failed: hallRuns.filter((run) => run.status === 'failed').length,
    stopped: hallRuns.filter((run) => run.status === 'stopped').length,
  }
  const totalCost = hallRuns.reduce((sum, run) => sum + (run.cost ?? 0), 0)
  const doneDurations = hallRuns.filter((run) => run.durationSec != null)
  const avgDuration = doneDurations.length
    ? Math.round(doneDurations.reduce((sum, run) => sum + (run.durationSec ?? 0), 0) / doneDurations.length)
    : 0
  const successRate = hallRuns.length ? Math.round((counts.done / hallRuns.length) * 100) : 0

  const visible = useMemo(() => {
    const needle = query.trim()
    return hallRuns
      .filter((run) => (status === 'all' ? true : run.status === status))
      .filter((run) => (agentFilter === 'all' ? true : run.agentId === agentFilter))
      .filter((run) => (sessionFilter === 'all' ? true : run.sessionId === sessionFilter))
      .filter((run) => {
        if (!needle) return true
        const agent = state.agents.find((item) => item.id === run.agentId)
        const session = state.sessions.find((item) => item.id === run.sessionId)
        return (
          run.prompt.includes(needle) ||
          run.id.includes(needle) ||
          (agent?.name.includes(needle) ?? false) ||
          (session?.title.includes(needle) ?? false)
        )
      })
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
  }, [agentFilter, sessionFilter, query, state.agents, state.sessions, status, hallRuns])

  const setStatus = (next: StatusFilter) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'all') params.delete('status')
    else params.set('status', next)
    setSearchParams(params, { replace: true })
  }

  const openRun = (id: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('run', id)
    setSearchParams(params)
  }

  const closeRun = () => {
    const params = new URLSearchParams(searchParams)
    params.delete('run')
    setSearchParams(params, { replace: true })
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow="管理后台 · 运行记录"
        title="运行记录"
        description="每一次 @助理 都会产生一次可追踪的运行。所有任务都来自公司大厅的同一聊天页，管理员可查看步骤、耗时与错误。"
      />

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { label: '总运行', value: counts.all, hint: `${counts.running} 次正在运行`, icon: History },
          { label: '成功率', value: `${successRate}%`, hint: `${counts.done} 次完成`, icon: CheckCircle2 },
          {
            label: '失败 / 停止',
            value: counts.failed + counts.stopped,
            hint: `${counts.failed} 失败 · ${counts.stopped} 停止`,
            icon: TriangleAlert,
          },
          {
            label: '平均耗时',
            value: avgDuration ? `${avgDuration} 秒` : '—',
            hint: `累计 ${formatCost(totalCost)}`,
            icon: Clock3,
          },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-line bg-surface px-3.5 py-3 shadow-card">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
                {item.label}
              </span>
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-raised text-muted">
                <item.icon size={12} />
              </span>
            </div>
            <div className="mt-1 text-[22px] font-semibold tabular text-ink">{item.value}</div>
            <div className="mt-0.5 text-[10px] text-faint">{item.hint}</div>
          </div>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索任务、助理或会话"
            aria-label="搜索运行记录"
            className="h-8 w-[210px] rounded-lg border border-line bg-surface pl-7 pr-2.5 text-[12px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
          />
        </div>
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
          {STATUS_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatus(key)}
              className={cn(
                'shrink-0 rounded-md px-2 py-1 text-[11px] transition-colors',
                status === key
                  ? 'bg-accent-soft font-medium text-accent-strong'
                  : 'text-muted hover:bg-sunken hover:text-ink',
              )}
            >
              {key === 'all' ? '全部' : key === 'running' ? '运行中' : key === 'done' ? '已完成' : key === 'failed' ? '失败' : '已停止'}{' '}
              {counts[key]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Select
            value={agentFilter}
            onChange={(event) => setAgentFilter(event.target.value)}
            className="h-8 w-[128px] text-[11.5px]"
            aria-label="按助理筛选"
          >
            <option value="all">全部助理</option>
            {state.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </Select>
          <Select
            value={sessionFilter}
            onChange={(event) => setSessionFilter(event.target.value)}
            className="h-8 w-[156px] text-[11.5px]"
            aria-label="按会话筛选"
          >
            <option value="all">全部会话</option>
            {[...state.sessions]
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title}
                </option>
              ))}
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="hidden grid-cols-[minmax(0,1.8fr)_140px_110px_90px_80px_80px_90px_24px] gap-3 border-b border-line bg-raised px-4 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-faint xl:grid">
          <span>任务 / 助理</span>
          <span>会话</span>
          <span>发起人</span>
          <span>状态</span>
          <span>耗时</span>
          <span>成本</span>
          <span>开始时间</span>
          <span />
        </div>
        {visible.length === 0 ? (
          <div className="p-3">
            <EmptyState
              icon={History}
              title="没有匹配的运行记录"
              description="调整筛选条件，或到公司大厅里 @ 一位助理开始任务。"
              compact
              action={
                <Button size="sm" variant="secondary" onClick={() => navigate('/workspace/chat')}>
                  去工作台
                </Button>
              }
            />
          </div>
        ) : (
          visible.map((run) => {
            const agent = state.agents.find((item) => item.id === run.agentId)
            const session = state.sessions.find((item) => item.id === run.sessionId)
            const actor = state.members.find((item) => item.id === run.actorId)
            return (
              <button
                key={run.id}
                type="button"
                onClick={() => openRun(run.id)}
                className="flex w-full flex-col gap-2 border-b border-line px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-raised xl:grid xl:grid-cols-[minmax(0,1.8fr)_140px_110px_90px_80px_80px_90px_24px] xl:items-center xl:gap-3 xl:px-4"
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <AgentAvatar icon={agent?.icon ?? 'sparkles'} color={agent?.color} size="sm" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11.5px] font-medium text-ink">{agent?.name ?? '未知助理'}</span>
                      <span className="text-[9.5px] tabular text-faint">{run.id}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-4 text-muted">{run.prompt}</p>
                  </div>
                </div>
                <div className="hidden truncate text-[11px] text-muted xl:block">
                  {session?.title ?? '公司大厅会话'}
                </div>
                <div className="hidden items-center gap-1.5 xl:flex">
                  {actor ? (
                    <>
                      <Avatar name={actor.name} color={actor.color} size="xs" />
                      <span className="truncate text-[10.5px] text-muted">{actor.name}</span>
                    </>
                  ) : (
                    <span className="text-[10.5px] text-faint">系统</span>
                  )}
                </div>
                <div>
                  <StatusPill status={run.status} />
                </div>
                <div className="hidden text-[10.5px] tabular text-muted xl:block">
                  {formatDuration(run.durationSec)}
                </div>
                <div className="hidden text-[10.5px] tabular text-muted xl:block">
                  {formatCost(run.cost)}
                </div>
                <div className="hidden text-[10.5px] text-faint xl:block">{formatRelative(run.startedAt)}</div>
                <div className="ml-auto flex items-center gap-2 text-faint xl:ml-0 xl:justify-end">
                  <span className="text-[10px] xl:hidden">
                    {session?.title ?? '公司大厅会话'} · {formatRelative(run.startedAt)}
                  </span>
                  <ChevronRight size={14} />
                </div>
              </button>
            )
          })
        )}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[10.5px] leading-5 text-faint">
        <ShieldCheck size={11} className="mt-0.5 shrink-0" />
        运行记录与提示词属于公司数据。运行按公司大厅的会话归属展示；正式版本会按角色进一步细分审计权限，并支持按会话压缩后自动清理。
      </p>

      {selectedRun && <RunDetailDialog run={selectedRun} onClose={closeRun} />}
    </PageBody>
  )
}

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done') return <CheckCircle2 size={14} className="text-success" />
  if (state === 'active') return <Loader2 size={14} className="animate-spin text-accent" />
  if (state === 'failed') return <XCircle size={14} className="text-danger" />
  return <Circle size={14} className="text-line-strong" />
}

function RunDetailDialog({ run, onClose }: { run: Run; onClose: () => void }) {
  const { state, stopRun, retryRun } = useStore()
  const navigate = useNavigate()
  const agent = state.agents.find((item) => item.id === run.agentId)
  const session = state.sessions.find((item) => item.id === run.sessionId)
  const actor = state.members.find((item) => item.id === run.actorId)
  const doneSteps = run.steps.filter((step) => step.state === 'done').length
  const progress = run.steps.length ? Math.round((doneSteps / run.steps.length) * 100) : 0

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader
          title={`${agent?.name ?? '助理'} · 运行详情`}
          description={`${session?.title ?? '公司大厅会话'} · 发起人 ${actor?.name ?? '未知'}`}
        />
        <DialogBody className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={run.status} />
            <Badge tone="outline">{run.id}</Badge>
            <span className="text-[10.5px] text-faint">{formatTime(run.startedAt)}</span>
            {run.durationSec != null && (
              <span className="text-[10.5px] text-faint">· 耗时 {formatDuration(run.durationSec)}</span>
            )}
            {run.cost != null && (
              <span className="text-[10.5px] text-faint">· 成本 {formatCost(run.cost)}</span>
            )}
          </div>

          <section>
            <h3 className="mb-1.5 text-[12px] font-semibold text-ink">任务提示词</h3>
            <blockquote className="rounded-lg border border-line bg-raised px-3 py-2.5 text-[12px] leading-5 text-ink-soft">
              {run.prompt}
            </blockquote>
          </section>

          {run.status === 'running' && (
            <div>
              <div className="mb-1 flex items-center justify-between text-[10.5px] text-muted">
                <span>执行进度</span>
                <span className="tabular">{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{ width: `${Math.max(progress, 6)}%` }}
                />
              </div>
            </div>
          )}

          <section>
            <h3 className="mb-2 text-[12px] font-semibold text-ink">执行步骤</h3>
            <ol className="space-y-2.5">
              {run.steps.map((step, index) => (
                <li key={`${step.label}-${index}`} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                    <StepIcon state={step.state} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11.5px] font-medium text-ink">{step.label}</span>
                      {step.state === 'active' && <Badge tone="accent">进行中</Badge>}
                      {step.state === 'failed' && <Badge tone="danger">失败</Badge>}
                    </div>
                    {step.detail && (
                      <p className="mt-0.5 text-[10.5px] leading-4 text-muted">{step.detail}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {run.error && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5">
              <TriangleAlert size={13} className="mt-0.5 shrink-0 text-danger" />
              <div>
                <div className="text-[11.5px] font-medium text-danger">运行未完成</div>
                <p className="mt-0.5 text-[11px] leading-5 text-danger">{run.error}</p>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
            <div className="grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-4">
              <div>
                <div className="text-faint">助理</div>
                <div className="mt-0.5 text-ink-soft">{agent?.name ?? '未知'}</div>
              </div>
              <div>
                <div className="text-faint">会话</div>
                <div className="mt-0.5 truncate text-ink-soft">{session?.title ?? '公司大厅'}</div>
              </div>
              <div>
                <div className="text-faint">开始</div>
                <div className="mt-0.5 text-ink-soft">{formatTime(run.startedAt)}</div>
              </div>
              <div>
                <div className="text-faint">结束</div>
                <div className="mt-0.5 text-ink-soft">
                  {run.endedAt ? formatTime(run.endedAt) : '未结束'}
                </div>
              </div>
            </div>
          </div>

          <p className="text-[10px] leading-5 text-faint">
            运行由服务端调用 Hermes / 模型接口，步骤和输出来自真实流式响应。停止会中断这次请求，已生成的内容仍保留在会话里。
          </p>
        </DialogBody>
        <DialogFooter className="justify-between">
          <div>
            {session && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigate(
                    session.id === state.activeSessionId
                      ? '/workspace/chat'
                      : `/workspace/chat?session=${session.id}`,
                  )
                  onClose()
                }}
              >
                <ExternalLink size={13} /> 打开会话
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              关闭
            </Button>
            {run.status === 'running' && (
              <Button variant="danger" onClick={() => stopRun(run.id)}>
                <Square size={12} /> 停止运行
              </Button>
            )}
            {(run.status === 'failed' || run.status === 'stopped') && (
              <Button variant="primary" onClick={() => retryRun(run.id)}>
                <RotateCcw size={13} /> 重新运行
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
