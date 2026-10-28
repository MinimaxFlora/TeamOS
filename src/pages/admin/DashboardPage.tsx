import {
  ArrowRight,
  BookOpen,
  Bot,
  Box,
  Cable,
  CheckCircle2,
  Clock3,
  History,
  MessagesSquare,
  Plus,
  Server,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type GatewayStatus } from '../../lib/api'
import { useStore } from '../../lib/store'
import { formatCost, formatDuration, formatRelative, greeting } from '../../lib/format'
import { cn } from '../../lib/utils'
import { PageBody, PageHeader, SectionTitle } from '../../components/layout/PageHeader'
import { AgentAvatar, Avatar } from '../../components/ui/avatar'
import { Badge, StatusPill } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'

const DAY = 24 * 60 * 60 * 1000

export function AdminDashboardPage() {
  const { state, currentUser } = useStore()
  const navigate = useNavigate()
  const [hermes, setHermes] = useState<GatewayStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .status()
      .then((result) => {
        if (!cancelled) setHermes(result.hermes)
      })
      .catch(() => {
        if (!cancelled) setHermes(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const activeMembers = state.members.filter((member) => member.status === 'active')
  const publishedAgents = state.agents.filter((agent) => agent.status === 'published')
  const reviewSkills = state.skills.filter((skill) => skill.status === 'review')
  const invited = state.members.filter((member) => member.status === 'invited')
  const draftAgents = state.agents.filter((agent) => agent.status !== 'published')
  const dirtyAgents = state.agents.filter((agent) => agent.dirty)
  const reviewDocs = state.knowledgeDocs.filter((doc) => doc.status === 'review')
  const readyDocs = state.knowledgeDocs.filter((doc) => doc.status === 'ready')
  const pendingConnectors = state.connectors.filter(
    (connector) => connector.status !== 'connected',
  )
  const workGroupRuns = state.runs.filter(
    (run) => state.groups.find((group) => group.id === run.groupId)?.kind === 'group',
  )
  const failedRuns = workGroupRuns.filter((run) => run.status === 'failed')

  const recentRuns = useMemo(
    () =>
      [...workGroupRuns]
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, 6),
    [workGroupRuns],
  )
  const recentAudit = useMemo(
    () => [...state.audit].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 5),
    [state.audit],
  )
  const weekRuns = workGroupRuns.filter(
    (run) => Date.now() - new Date(run.startedAt).getTime() <= 7 * DAY,
  )
  const totalCost = workGroupRuns.reduce((sum, run) => sum + (run.cost ?? 0), 0)
  const doneRuns = workGroupRuns.filter((run) => run.status === 'done')
  const avgDuration = doneRuns.length
    ? Math.round(doneRuns.reduce((sum, run) => sum + (run.durationSec ?? 0), 0) / doneRuns.length)
    : 0

  const tasks = [
    reviewSkills.length > 0 && {
      key: 'skills',
      icon: Box,
      title: `${reviewSkills.length} 个 Skill 等待审核`,
      detail: '核对权限与来源后再启用，未审核的技能不能绑定给助理。',
      to: '/admin/skills',
      tone: 'warning' as const,
    },
    reviewDocs.length > 0 && {
      key: 'docs',
      icon: BookOpen,
      title: `${reviewDocs.length} 篇知识文档等待审批`,
      detail: '审批通过后才会进入助理的知识范围，并开始带来源回答。',
      to: '/admin/knowledge',
      tone: 'warning' as const,
    },
    pendingConnectors.length > 0 && {
      key: 'connectors',
      icon: Cable,
      title: `${pendingConnectors.length} 个渠道尚未接入`,
      detail: '补齐回调地址、签名密钥与权限范围后才能接收外部事件。',
      to: '/admin/connectors',
      tone: 'neutral' as const,
    },
    failedRuns.length > 0 && {
      key: 'runs',
      icon: TriangleAlert,
      title: `${failedRuns.length} 次助理运行失败`,
      detail: '查看失败步骤与错误信息，必要时重新运行。',
      to: '/admin/runs?status=failed',
      tone: 'danger' as const,
    },
    invited.length > 0 && {
      key: 'invited',
      icon: UserPlus,
      title: `${invited.length} 位成员等待加入`,
      detail: '邀请已创建；成员接受后即可进入公司大厅并 @ 助理。',
      to: '/admin/members',
      tone: 'neutral' as const,
    },
    draftAgents.length > 0 && {
      key: 'drafts',
      icon: Bot,
      title: `${draftAgents.length} 个助理还未发布`,
      detail: '草稿或已停用的助理不会出现在员工目录，也不能被 @。',
      to: '/admin/agents',
      tone: 'neutral' as const,
    },
    dirtyAgents.length > 0 && {
      key: 'dirty',
      icon: ShieldCheck,
      title: `${dirtyAgents.length} 个已发布助理有未发布改动`,
      detail: '当前线上仍是旧版本，员工看到的配置不会随草稿变化。',
      to: '/admin/agents',
      tone: 'neutral' as const,
    },
  ].filter(Boolean) as {
    key: string
    icon: typeof Box
    title: string
    detail: string
    to: string
    tone: 'warning' | 'danger' | 'neutral'
  }[]

  const kpis = [
    {
      label: '在职成员',
      value: activeMembers.length,
      hint: `${state.members.length - activeMembers.length} 位待加入`,
      icon: UsersRound,
      to: '/admin/members',
    },
    {
      label: '已发布助理',
      value: publishedAgents.length,
      hint: '全公司在大厅可见 · 草稿不计入',
      icon: Bot,
      to: '/admin/agents',
    },
    {
      label: '近 7 天运行',
      value: weekRuns.length,
      hint: `平均 ${formatDuration(avgDuration)} · 累计 ${formatCost(totalCost)}`,
      icon: History,
      to: '/admin/runs',
    },
    {
      label: '可用 Skill',
      value: state.skills.filter((skill) => skill.status === 'enabled').length,
      hint: `${reviewSkills.length} 个待审核 · ${state.skills.length} 个总数`,
      icon: Box,
      to: '/admin/skills',
    },
    {
      label: '已审批知识',
      value: readyDocs.length,
      hint: `${reviewDocs.length} 篇待审批 · ${state.knowledge.length} 个空间`,
      icon: BookOpen,
      to: '/admin/knowledge',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow="管理后台 · 概览"
        title={`${greeting()}，${currentUser?.name ?? '管理员'}`}
        description={`这里是${state.company.name}的 TeamOS 管理后台。成员、助理与技能都只属于这家公司。`}
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => navigate('/workspace/chat')}>
              <MessagesSquare size={14} /> 进入公司大厅
            </Button>
            <Button size="sm" variant="primary" onClick={() => navigate('/admin/agents')}>
              <Plus size={14} /> 创建助理
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-2.5 xl:grid-cols-5">
        {kpis.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => navigate(item.to)}
            className="group rounded-xl border border-line bg-surface px-4 py-3.5 text-left shadow-card transition-colors hover:border-accent-line"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-[0.07em] text-faint">
                {item.label}
              </span>
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-raised text-muted transition-colors group-hover:bg-accent-soft group-hover:text-accent">
                <item.icon size={13} />
              </span>
            </div>
            <div className="mt-1.5 text-[26px] font-semibold leading-8 tabular text-ink">{item.value}</div>
            <div className="mt-0.5 line-clamp-1 text-[10.5px] text-muted">{item.hint}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-xl border border-line bg-surface shadow-card">
            <div className="border-b border-line px-4 py-3">
              <SectionTitle
                title="需要你处理"
                description="只显示真正需要管理员动作的事项。"
                action={
                  <Badge tone={tasks.length ? 'warning' : 'success'}>
                    {tasks.length ? `${tasks.length} 项` : '全部处理完'}
                  </Badge>
                }
              />
            </div>
            {tasks.length === 0 ? (
              <div className="flex items-center gap-3 px-4 py-6">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-success-soft text-success">
                  <CheckCircle2 size={17} />
                </span>
                <div>
                  <div className="text-[12.5px] font-medium text-ink">目前没有待处理事项</div>
                  <p className="mt-0.5 text-[11px] text-muted">
                    审核队列、失败运行与邀请状态都会实时出现在这里。
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-line">
                {tasks.map((task) => (
                  <button
                    key={task.key}
                    type="button"
                    onClick={() => navigate(task.to)}
                    className="group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-raised"
                  >
                    <span
                      className={cn(
                        'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                        task.tone === 'danger'
                          ? 'bg-danger-soft text-danger'
                          : task.tone === 'warning'
                            ? 'bg-warning-soft text-warning'
                            : 'bg-raised text-muted',
                      )}
                    >
                      <task.icon size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium text-ink">{task.title}</span>
                      <span className="mt-0.5 block text-[10.5px] leading-4 text-muted">{task.detail}</span>
                    </span>
                    <ArrowRight
                      size={14}
                      className="mt-1 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                    />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">最近运行</h2>
                <p className="mt-0.5 text-[11px] text-muted">助理每次被 @ 的执行记录，失败与停止也可追踪。</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => navigate('/admin/runs')}>
                全部记录 <ArrowRight size={13} />
              </Button>
            </div>
            <div className="divide-y divide-line">
              {recentRuns.map((run) => {
                const agent = state.agents.find((item) => item.id === run.agentId)
                const session = state.sessions.find((item) => item.id === run.sessionId)
                const actor = state.members.find((item) => item.id === run.actorId)
                return (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => navigate(`/admin/runs?run=${run.id}`)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-raised"
                  >
                    <AgentAvatar icon={agent?.icon ?? 'sparkles'} color={agent?.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[12px] font-medium text-ink">
                          {agent?.name ?? '未知助理'}
                        </span>
                        <span className="text-[10px] text-faint">于 {session?.title ?? '公司大厅会话'}</span>
                        <StatusPill status={run.status} />
                      </div>
                      <p className="mt-1 line-clamp-1 text-[11px] text-muted">{run.prompt}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-faint">
                        <span>{actor?.name ?? '成员'}</span>
                        <span>·</span>
                        <span>{formatRelative(run.startedAt)}</span>
                        {run.durationSec != null && (
                          <>
                            <span>·</span>
                            <span>{formatDuration(run.durationSec)}</span>
                          </>
                        )}
                        {run.cost != null && (
                          <>
                            <span>·</span>
                            <span>{formatCost(run.cost)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-xl border border-line bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">最近管理动态</h2>
                <p className="mt-0.5 text-[11px] text-muted">发布、审核、成员与会话归档都会写入审计。</p>
              </div>
              <Clock3 size={14} className="text-faint" />
            </div>
            <ol className="divide-y divide-line">
              {recentAudit.map((event) => {
                const actor = state.members.find((member) => member.id === event.actorId)
                return (
                  <li key={event.id} className="flex items-start gap-3 px-4 py-3">
                    <Avatar name={actor?.name ?? '系统'} color={actor?.color} size="xs" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="text-[11.5px] font-medium text-ink">{actor?.name ?? '系统'}</span>
                        <span className="text-[11px] text-muted">{event.action}</span>
                        <span className="text-[11px] font-medium text-ink-soft">{event.target}</span>
                      </div>
                      <p className="mt-0.5 text-[10.5px] text-faint">
                        {event.detail} · {formatRelative(event.at)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-xl border border-line bg-surface shadow-card">
            <div className="border-b border-line px-4 py-3">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Server size={14} /> 部署与实例
              </h2>
            </div>
            <div className="space-y-3 px-4 py-3.5">
              <div className="rounded-lg border border-line bg-raised px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] font-medium text-ink">当前运行模式</span>
                  <Badge tone={hermes?.status === 'ready' ? 'success' : 'warning'} dot>
                    {hermes?.status === 'ready'
                      ? '服务端 · Hermes 已连接'
                      : hermes
                        ? `服务端 · Hermes ${hermes.status}`
                        : '服务端 · 检查中'}
                  </Badge>
                </div>
                <p className="mt-1 text-[10.5px] leading-4 text-muted">
                  数据保存在服务端 SQLite（Docker 数据卷），模型调用经由 Hermes Gateway；
                  未配置模型时仍可管理成员、知识与会话。
                </p>
              </div>
              <dl className="space-y-2">
                {[
                  ['目标部署', state.company.deployment],
                  ['版本计划', state.company.plan],
                  ['时区', state.company.timezone],
                  ['公司创建', formatRelative(state.company.createdAt)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3 text-[11px]">
                    <dt className="shrink-0 text-faint">{label}</dt>
                    <dd className="text-right text-ink-soft">{value}</dd>
                  </div>
                ))}
              </dl>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => navigate('/admin/settings#deployment')}
              >
                查看部署设置
              </Button>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-surface shadow-card">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">助理一览</h2>
            </div>
            <div className="divide-y divide-line">
              {state.agents
                .filter((agent) => agent.status === 'published')
                .slice(0, 5)
                .map((agent) => {
                  const agentRuns = workGroupRuns.filter((run) => run.agentId === agent.id)
                  const success = agentRuns.filter((run) => run.status === 'done').length
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => navigate(`/admin/agents/${agent.id}`)}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-raised"
                    >
                      <AgentAvatar icon={agent.icon} color={agent.color} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11.5px] font-medium text-ink">{agent.name}</div>
                        <div className="truncate text-[10px] text-faint">
                          v{agent.version} · 公司大厅可用
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] tabular text-ink-soft">{agentRuns.length} 次</div>
                        <div className="text-[9.5px] text-faint">{success} 成功</div>
                      </div>
                    </button>
                  )
                })}
            </div>
            <div className="border-t border-line px-4 py-2.5">
              <button
                type="button"
                onClick={() => navigate('/admin/agents')}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
              >
                管理全部助理 <ArrowRight size={12} />
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-raised px-4 py-3.5">
            <div className="flex items-start gap-2">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-muted" />
              <div>
                <div className="text-[11.5px] font-medium text-ink">数据边界</div>
                <p className="mt-1 text-[10.5px] leading-5 text-muted">
                  成员、消息、文件、技能与审计都属于当前公司实例。正式部署时，每个客户使用独立数据库与对象存储，
                  不共享模型凭据，也不会出现在 URL 或日志中。
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </PageBody>
  )
}
