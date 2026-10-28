import {
  Bot,
  Briefcase,
  Calculator,
  ChevronRight,
  FileText,
  Globe,
  Headset,
  LayoutGrid,
  Megaphone,
  Plus,
  Scale,
  Search,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../lib/store'
import type { Template } from '../../lib/types'
import { DEPARTMENTS, TEMPLATES, TEMPLATE_CATEGORIES, TOOL_DEFINITIONS } from '../../lib/seed'
import { cn } from '../../lib/utils'
import { PageBody, PageHeader } from '../../components/layout/PageHeader'
import { AgentAvatar, AgentIconGlyph } from '../../components/ui/avatar'
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
import { Field, Input, Select } from '../../components/ui/input'

const categoryIcons: Record<string, LucideIcon> = {
  全部: LayoutGrid,
  产品研发: Sparkles,
  销售增长: Briefcase,
  运营支持: Megaphone,
  文档处理: FileText,
  客户成功: Headset,
  市场研究: Globe,
  人事财务: Calculator,
  法务合规: Scale,
}

type StatusFilter = 'all' | 'published' | 'draft' | 'paused'

export function AdminAgentsPage() {
  const { state, notify } = useStore()
  const navigate = useNavigate()
  const [category, setCategory] = useState('全部')
  const [sort, setSort] = useState<'curated' | 'popular'>('curated')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null)
  const [blankOpen, setBlankOpen] = useState(false)

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const item of TEMPLATE_CATEGORIES) {
      counts[item] = item === '全部' ? TEMPLATES.length : TEMPLATES.filter((t) => t.category === item).length
    }
    return counts
  }, [])

  const templates = useMemo(() => {
    const filtered = category === '全部' ? TEMPLATES : TEMPLATES.filter((t) => t.category === category)
    return sort === 'popular' ? [...filtered].sort((a, b) => b.popularity - a.popularity) : filtered
  }, [category, sort])

  const agents = useMemo(() => {
    const needle = query.trim()
    return state.agents
      .filter((agent) => (statusFilter === 'all' ? true : agent.status === statusFilter))
      .filter(
        (agent) =>
          !needle ||
          agent.name.includes(needle) ||
          agent.title.includes(needle) ||
          agent.department.includes(needle),
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [query, state.agents, statusFilter])

  const counts = {
    all: state.agents.length,
    published: state.agents.filter((agent) => agent.status === 'published').length,
    draft: state.agents.filter((agent) => agent.status === 'draft').length,
    paused: state.agents.filter((agent) => agent.status === 'paused').length,
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow="管理后台 · AI 助理"
        title="助理团队"
        description="从模板快速组建助理，或为公司的特殊岗位写一个全新的助理。每个助理单独绑定技能、工具与知识范围，发布后员工才能使用。"
        actions={
          <Button variant="primary" size="sm" onClick={() => setBlankOpen(true)}>
            <Plus size={14} /> 新建空白助理
          </Button>
        }
      />

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              从模板开始
              <Badge tone="outline">{TEMPLATES.length} 个官方模板</Badge>
            </h2>
            <p className="mt-1 text-[12px] leading-5 text-muted">
              模板已配好职责、提示词与技能组合，创建后是草稿；检查知识范围与工具权限后再发布。
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 shadow-card">
            {[
              { key: 'curated' as const, label: '综合推荐' },
              { key: 'popular' as const, label: '最热' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSort(item.key)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                  sort === item.key ? 'bg-sunken text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
          {TEMPLATE_CATEGORIES.map((item) => {
            const Icon = categoryIcons[item] ?? Sparkles
            const active = category === item
            return (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={cn(
                  'flex flex-col items-start gap-1.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                  active
                    ? 'border-accent-line bg-accent-soft text-accent-strong'
                    : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:bg-raised',
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <Icon size={14} className={active ? 'text-accent' : 'text-muted'} />
                  <span className="text-[10px] text-faint">{categoryCounts[item]}</span>
                </div>
                <span className="truncate text-[11.5px] font-medium">{item}</span>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => {
            const skillNames = template.skills
              .map((id) => state.skills.find((skill) => skill.id === id)?.name)
              .filter(Boolean)
            return (
              <article
                key={template.id}
                className="flex flex-col rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                    style={{
                      backgroundColor: `${template.color}10`,
                      borderColor: `${template.color}22`,
                      color: template.color,
                    }}
                  >
                    <AgentIconGlyph icon={template.icon} size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate text-[13.5px] font-semibold text-ink">{template.name}</h3>
                      <Badge tone="outline" className="h-[17px] px-1.5 text-[9px]">
                        {template.category}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-accent-strong">{template.tagline}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-faint">
                    <Users size={10} /> {template.popularity}
                  </span>
                </div>
                <p className="mt-2.5 line-clamp-2 text-[11.5px] leading-5 text-muted">{template.description}</p>
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {skillNames.slice(0, 3).map((name) => (
                    <span key={name} className="rounded bg-sunken px-1.5 py-0.5 text-[10px] text-ink-soft">
                      {name}
                    </span>
                  ))}
                  {skillNames.length > 3 && (
                    <span className="text-[10px] text-faint">+{skillNames.length - 3}</span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
                  <span className="text-[10px] text-faint">{template.responsibilities.length} 项职责</span>
                  <Button size="sm" variant="subtle" onClick={() => setPreviewTemplate(template)}>
                    使用模板 <ChevronRight size={12} />
                  </Button>
                </div>
              </article>
            )
          })}
        </div>

        {templates.length === 0 && (
          <EmptyState
            icon={Sparkles}
            title="这个分类还没有模板"
            description="可以切换到其他分类，或者从空白助理开始自己写。"
            className="mt-2"
            compact
          />
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">公司里的助理</h2>
            <p className="mt-1 text-[12px] text-muted">
              草稿与已停用的助理不会出现在员工工作台。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索助理"
                aria-label="搜索公司助理"
                className="h-8 w-[170px] rounded-lg border border-line bg-surface pl-7 pr-2.5 text-[12px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
              />
            </div>
            <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
              {(
                [
                  ['all', `全部 ${counts.all}`],
                  ['published', `已发布 ${counts.published}`],
                  ['draft', `草稿 ${counts.draft}`],
                  ['paused', `已停用 ${counts.paused}`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={cn(
                    'shrink-0 rounded-md px-2 py-1 text-[11px] transition-colors',
                    statusFilter === key
                      ? 'bg-accent-soft font-medium text-accent-strong'
                      : 'text-muted hover:bg-sunken hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.7fr)_110px_100px_80px_36px] gap-3 border-b border-line bg-raised px-4 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-faint md:grid">
            <span>助理</span>
            <span>技能</span>
            <span>状态</span>
            <span>可用范围</span>
            <span>版本</span>
            <span />
          </div>
          {agents.length === 0 ? (
            <div className="p-3">
              <EmptyState
                icon={Bot}
                title="没有匹配的助理"
                description="调整筛选条件，或从上面的模板新建一个。"
                compact
              />
            </div>
          ) : (
            agents.map((agent) => {
              const skills = state.skills.filter((skill) => agent.skills.includes(skill.id))
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => navigate(`/admin/agents/${agent.id}`)}
                  className="flex w-full flex-col gap-2 border-b border-line px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-raised md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.7fr)_110px_100px_80px_36px] md:items-center md:gap-3 md:px-4"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <AgentAvatar icon={agent.icon} color={agent.color} size="md" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-medium text-ink">{agent.name}</span>
                        {agent.status === 'published' && agent.dirty && (
                          <span className="shrink-0 rounded bg-warning-soft px-1 text-[9px] text-warning">
                            未发布修改
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[10.5px] text-muted">
                        {agent.title} · {agent.department}
                      </div>
                    </div>
                  </div>

                  <div className="hidden min-w-0 flex-wrap gap-1 md:flex">
                    {skills.slice(0, 3).map((skill) => (
                      <span
                        key={skill.id}
                        className="inline-flex items-center gap-1 rounded bg-sunken px-1.5 py-0.5 text-[10px] text-ink-soft"
                      >
                        <AgentIconGlyph icon={skill.icon} size={9} />
                        {skill.name}
                      </span>
                    ))}
                    {skills.length > 3 && (
                      <span className="text-[10px] text-faint">+{skills.length - 3}</span>
                    )}
                    {skills.length === 0 && <span className="text-[10px] text-faint">未绑定</span>}
                  </div>

                  <div className="flex items-center gap-2 md:block">
                    <StatusPill status={agent.status} />
                  </div>

                  <div className="hidden text-[11px] text-muted md:block">全公司</div>
                  <div className="hidden text-[11px] tabular text-muted md:block">v{agent.version}</div>

                  <div className="ml-auto flex items-center gap-2 text-faint md:ml-0 md:justify-end">
                    <span className="text-[10px] md:hidden">
                      {skills.length} 技能 · 全公司 · v{agent.version}
                    </span>
                    <ChevronRight size={14} />
                  </div>
                </button>
              )
            })
          )}
        </div>
      </section>

      {previewTemplate && (
        <TemplateDialog
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          onCreate={(id) => {
            setPreviewTemplate(null)
            navigate(`/admin/agents/${id}`)
          }}
        />
      )}

      <BlankAgentDialog
        open={blankOpen}
        onOpenChange={setBlankOpen}
        onCreate={(id) => {
          setBlankOpen(false)
          navigate(`/admin/agents/${id}`)
        }}
        onError={(message) => notify(message, { tone: 'warning' })}
      />
    </PageBody>
  )
}

function TemplateDialog({
  template,
  onClose,
  onCreate,
}: {
  template: Template
  onClose: () => void
  onCreate: (id: string) => void
}) {
  const { state, createAgentFromTemplate, notify } = useStore()
  const [name, setName] = useState(template.defaultName)
  const [department, setDepartment] = useState('产品部')
  const skills = state.skills.filter((skill) => template.skills.includes(skill.id))
  const tools = template.tools

  const handleCreate = () => {
    if (!name.trim()) {
      notify('给助理起个名字', { tone: 'warning' })
      return
    }
    const id = createAgentFromTemplate(template.id, name, department)
    if (!id) {
      notify('创建失败，模板不可用', { tone: 'danger' })
      return
    }
    notify(`已创建「${name.trim()}」草稿`, {
      description: '检查职责、技能与知识范围后即可发布。',
      tone: 'success',
    })
    onCreate(id)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader
          title={`使用「${template.name}」模板`}
          description={template.tagline}
        />
        <DialogBody className="space-y-4">
          <p className="text-[12.5px] leading-6 text-ink-soft">{template.description}</p>

          <div>
            <h3 className="mb-1.5 text-[12px] font-semibold text-ink">模板职责</h3>
            <ul className="space-y-1">
              {template.responsibilities.map((item) => (
                <li key={item} className="flex items-start gap-2 text-[12px] leading-5 text-muted">
                  <span className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-accent/60" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-1.5 text-[12px] font-semibold text-ink">预置技能</h3>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((skill) => (
                <span
                  key={skill.id}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px]',
                    skill.status === 'enabled'
                      ? 'border-line bg-raised text-ink-soft'
                      : 'border-line bg-surface text-faint',
                  )}
                  title={skill.status !== 'enabled' ? '该技能当前不可用，创建时会被跳过' : skill.description}
                >
                  <AgentIconGlyph icon={skill.icon} size={10} />
                  {skill.name}
                  {skill.status !== 'enabled' && <span className="text-[9px]">（不可用）</span>}
                </span>
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {tools.map((tool) => (
                <span key={tool} className="rounded bg-sunken px-1.5 py-0.5 text-[10px] text-muted">
                  <Wrench size={9} className="mr-0.5 inline" />
                  {TOOL_DEFINITIONS.find((item) => item.key === tool)?.label ?? tool}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="助理名字" htmlFor="template-name">
              <Input
                id="template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={12}
                placeholder={template.defaultName}
              />
            </Field>
            <Field label="所属部门" htmlFor="template-dept">
              <Select
                id="template-dept"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
              >
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <p className="rounded-lg bg-raised px-3 py-2 text-[10.5px] leading-4 text-faint">
            创建后是草稿，不会立即出现在员工工作台。你可以在编辑器里调整提示词、技能与可见知识，再发布正式版本。
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={handleCreate}>
            <Sparkles size={14} /> 创建草稿
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BlankAgentDialog({
  open,
  onOpenChange,
  onCreate,
  onError,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (id: string) => void
  onError: (message: string) => void
}) {
  const { createBlankAgent } = useStore()
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('产品部')

  const reset = () => {
    setName('')
    setTitle('')
    setDepartment('产品部')
  }

  const handleCreate = () => {
    if (!name.trim() || !title.trim()) {
      onError('请填写助理名字与岗位名称。')
      return
    }
    const id = createBlankAgent({ name, title, department })
    reset()
    onCreate(id)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent size="md">
        <DialogHeader
          title="新建空白助理"
          description="适合公司独有的岗位。创建后需要自己写职责、指令并绑定技能。"
        />
        <DialogBody className="space-y-4">
          <Field label="助理名字" required htmlFor="blank-name" hint="员工会看到这个名字">
            <Input
              id="blank-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={12}
              placeholder="例如：投标助理"
            />
          </Field>
          <Field label="岗位名称" required htmlFor="blank-title">
            <Input
              id="blank-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={20}
              placeholder="例如：售前方案支持"
            />
          </Field>
          <Field label="所属部门" htmlFor="blank-dept">
            <Select
              id="blank-dept"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
            >
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </Select>
          </Field>
          <div className="rounded-lg border border-line bg-raised px-3 py-2 text-[10.5px] leading-4 text-faint">
            空白助理默认只有「读取工作区文件」工具，没有技能和知识。发布前必须至少绑定一项技能；发布后在公司大厅对全员可用。
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="primary" onClick={handleCreate}>
            <Plus size={14} /> 创建并编辑
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
