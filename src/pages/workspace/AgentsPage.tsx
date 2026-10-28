import {
  BookOpen,
  Bot,
  ChevronRight,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Wrench,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../lib/store'
import type { Agent } from '../../lib/types'
import { TOOL_DEFINITIONS } from '../../lib/seed'
import { cn } from '../../lib/utils'
import { PageBody, PageHeader } from '../../components/layout/PageHeader'
import { AgentAvatar, AgentIconGlyph } from '../../components/ui/avatar'
import { Badge, RiskBadge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/ui/dialog'
import { EmptyState } from '../../components/ui/empty-state'

export function WorkspaceAgentsPage() {
  const { state, currentUser } = useStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('全部')
  const [selected, setSelected] = useState<Agent | null>(null)

  const published = useMemo(
    () => state.agents.filter((agent) => agent.status === 'published'),
    [state.agents],
  )
  const departments = useMemo(
    () => ['全部', ...Array.from(new Set(published.map((agent) => agent.department)))],
    [published],
  )
  const visible = published.filter((agent) => {
    const matchesDepartment = department === '全部' || agent.department === department
    const needle = query.trim()
    const matchesQuery =
      !needle ||
      agent.name.includes(needle) ||
      agent.title.includes(needle) ||
      agent.description.includes(needle)
    return matchesDepartment && matchesQuery
  })

  const goToHall = () => {
    setSelected(null)
    navigate('/workspace/chat')
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow="AI 助理"
        title="你的 AI 同事们"
        description="每位助理都有明确的岗位、职责、技能与知识范围。它们都在公司大厅里，输入 @ 就能召唤。"
        actions={
          currentUser?.role === 'admin' ? (
            <Button size="sm" onClick={() => navigate('/admin/agents')}>
              <Bot size={14} /> 管理助理
            </Button>
          ) : (
            <Badge tone="outline" className="h-7 px-2.5">
              <ShieldCheck size={12} /> 由管理员维护
            </Badge>
          )
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-[300px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索助理、岗位或能力"
            aria-label="搜索助理"
            className="h-9 w-full rounded-lg border border-line-strong bg-surface pl-8 pr-3 text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
        </div>
        <div className="no-scrollbar flex flex-1 items-center gap-1.5 overflow-x-auto">
          {departments.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setDepartment(item)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
                department === item
                  ? 'border-accent-line bg-accent-soft text-accent-strong'
                  : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="没有匹配的助理"
          description={
            published.length === 0
              ? '管理员还没有发布助理。发布后，团队成员就能在公司大厅里 @ 它们。'
              : '换个关键词或部门试试。'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((agent) => {
            const skills = state.skills.filter((skill) => agent.skills.includes(skill.id))
            return (
              <article
                key={agent.id}
                className="group flex flex-col rounded-xl border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-pop"
              >
                <div className="flex items-start gap-3">
                  <AgentAvatar icon={agent.icon} color={agent.color} size="xl" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h2 className="truncate text-[14px] font-semibold text-ink">{agent.name}</h2>
                      <Badge tone="outline" className="h-[18px] px-1.5 text-[9.5px]">
                        {agent.department}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-muted">{agent.title}</p>
                    <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-faint">
                      <UsersRound size={10} />
                      公司大厅 · 全员可用
                    </div>
                  </div>
                </div>

                <p className="mt-3 line-clamp-2 text-[12px] leading-5 text-muted">{agent.description}</p>

                <div className="mt-2.5 space-y-1">
                  {agent.responsibilities.slice(0, 2).map((item) => (
                    <div key={item} className="flex items-start gap-1.5 text-[11.5px] leading-5 text-ink-soft">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent/60" />
                      <span className="line-clamp-1">{item}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1">
                  {skills.slice(0, 3).map((skill) => (
                    <span
                      key={skill.id}
                      className="inline-flex items-center gap-1 rounded-md bg-sunken px-1.5 py-0.5 text-[10px] text-ink-soft"
                      title={skill.description}
                    >
                      <AgentIconGlyph icon={skill.icon} size={10} />
                      {skill.name}
                    </span>
                  ))}
                  {skills.length > 3 && (
                    <span className="text-[10px] text-faint">+{skills.length - 3}</span>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
                  <Button size="sm" variant="primary" onClick={goToHall} className="flex-1">
                    <MessageSquare size={13} /> 去大厅 @ {agent.name}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setSelected(agent)}>
                    查看能力 <ChevronRight size={13} />
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Sparkles size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-medium text-ink">想让助理多一项能力？</div>
          <p className="mt-0.5 text-[11.5px] leading-5 text-muted">
            助理的技能、工具与可见知识由管理员统一配置，避免越权。把你的需求告诉管理员即可。
          </p>
        </div>
        {currentUser?.role === 'admin' && (
          <Button size="sm" variant="secondary" onClick={() => navigate('/admin/skills')}>
            <Wrench size={13} /> 前往 Skills 中心
          </Button>
        )}
      </div>

      <AgentDetailDialog
        agent={selected}
        onClose={() => setSelected(null)}
        onGoToHall={goToHall}
      />
    </PageBody>
  )
}

function AgentDetailDialog({
  agent,
  onClose,
  onGoToHall,
}: {
  agent: Agent | null
  onClose: () => void
  onGoToHall: () => void
}) {
  const { state } = useStore()
  if (!agent) return null

  const skills = state.skills.filter((skill) => agent.skills.includes(skill.id))
  const tools = TOOL_DEFINITIONS.filter((tool) => agent.tools.includes(tool.key))
  const knowledge = state.knowledge.filter((space) => agent.knowledge.includes(space.id))

  return (
    <Dialog open={Boolean(agent)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader
          title={`${agent.name} · ${agent.title}`}
          description={`${agent.department} · 由管理员配置并发布`}
        />
        <DialogBody className="space-y-5">
          <p className="text-[13px] leading-6 text-ink-soft">{agent.description}</p>

          <section>
            <h3 className="mb-2 text-[12px] font-semibold text-ink">负责什么</h3>
            <ul className="space-y-1.5">
              {agent.responsibilities.map((item) => (
                <li key={item} className="flex items-start gap-2 text-[12.5px] leading-5 text-ink-soft">
                  <span className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-accent/70" />
                  {item}
                </li>
              ))}
            </ul>
            {agent.outOfScope && (
              <p className="mt-2 rounded-lg bg-raised px-3 py-2 text-[11.5px] leading-5 text-muted">
                不负责：{agent.outOfScope}
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink">
              <Sparkles size={13} className="text-accent" /> 已绑定技能 · {skills.length}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {skills.map((skill) => (
                <div key={skill.id} className="rounded-lg border border-line bg-raised px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <AgentIconGlyph icon={skill.icon} size={12} className="text-muted" />
                    <span className="text-[12px] font-medium text-ink">{skill.name}</span>
                    <RiskBadge risk={skill.risk} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted">{skill.description}</p>
                </div>
              ))}
              {skills.length === 0 && <p className="text-[11.5px] text-faint">暂未绑定技能。</p>}
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                <Wrench size={13} className="text-muted" /> 可用工具
              </h3>
              <div className="space-y-1.5">
                {tools.map((tool) => (
                  <div key={tool.key} className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span className="text-ink-soft">{tool.label}</span>
                    <RiskBadge risk={tool.risk} />
                  </div>
                ))}
                {tools.length === 0 && <p className="text-[11.5px] text-faint">仅能读写对话内容。</p>}
              </div>
            </section>
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                <BookOpen size={13} className="text-muted" /> 可见知识
              </h3>
              <div className="space-y-1.5">
                {knowledge.map((space) => (
                  <div key={space.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span className="text-ink-soft">{space.name}</span>
                    <span className="text-[10px] text-faint">
                      {state.knowledgeDocs.filter(
                        (doc) => doc.spaceId === space.id && doc.status === 'ready',
                      ).length}{' '}
                      篇
                    </span>
                  </div>
                ))}
                {knowledge.length === 0 && <p className="text-[11.5px] text-faint">未绑定知识空间。</p>}
              </div>
            </section>
          </div>

          <section>
            <h3 className="mb-2 text-[12px] font-semibold text-ink">在哪里可以找到它</h3>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <UsersRound size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-ink">公司大厅 · 全员可用</div>
                <p className="mt-0.5 text-[10.5px] leading-4 text-muted">
                  在同一个聊天页输入 @{agent.name} 即可召唤；长对话会归档为记忆后开新会话。
                </p>
              </div>
            </div>
          </section>

          <p className="rounded-lg bg-raised px-3 py-2 text-[10.5px] leading-4 text-faint">
            员工不能修改助理的提示词、技能或工具权限。发现助理回答越权或答错，请点踩并在公司大厅里说明，管理员会在运行记录里复盘。
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
          <Button variant="primary" onClick={onGoToHall}>
            <MessageSquare size={14} /> 去大厅 @ {agent.name}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
