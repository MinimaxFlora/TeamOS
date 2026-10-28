import {
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  Plus,
  Power,
  Search,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../../lib/store'
import type { Risk, Skill } from '../../lib/types'
import { SKILL_CATEGORIES } from '../../lib/seed'
import { formatRelative } from '../../lib/format'
import { cn } from '../../lib/utils'
import { PageBody, PageHeader } from '../../components/layout/PageHeader'
import { AgentAvatar, AgentIconGlyph } from '../../components/ui/avatar'
import { Badge, RiskBadge, StatusPill } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/ui/dialog'
import { EmptyState } from '../../components/ui/empty-state'
import { Checkbox, Field, Input, Select, Textarea } from '../../components/ui/input'

type StatusFilter = 'all' | Skill['status']

const PERMISSION_OPTIONS = [
  '读取工作区文件',
  '写入工作区文件',
  '网络访问',
  '读取企业知识',
  '发送消息',
  '执行服务器命令',
]

export function AdminSkillsPage() {
  const { state, currentUser, notify, createSkill, deleteSkill, setSkillStatus } = useStore()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [category, setCategory] = useState('all')
  const [source, setSource] = useState('all')
  const [addOpen, setAddOpen] = useState(false)
  const [action, setAction] = useState<{ type: 'reject' | 'disable' | 'delete'; skill: Skill } | null>(null)

  const selectedSkill = state.skills.find((skill) => skill.id === searchParams.get('skill')) ?? null
  const reviewSkills = state.skills.filter((skill) => skill.status === 'review')
  const counts = {
    enabled: state.skills.filter((skill) => skill.status === 'enabled').length,
    review: reviewSkills.length,
    disabled: state.skills.filter((skill) => skill.status === 'disabled').length,
    high: state.skills.filter((skill) => skill.risk === 'high').length,
  }

  const visible = useMemo(() => {
    const needle = query.trim()
    return state.skills
      .filter((skill) => (statusFilter === 'all' ? true : skill.status === statusFilter))
      .filter((skill) => (category === 'all' ? true : skill.category === category))
      .filter((skill) => (source === 'all' ? true : skill.source === source))
      .filter(
        (skill) =>
          !needle ||
          skill.name.includes(needle) ||
          skill.description.includes(needle) ||
          skill.author.includes(needle),
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [category, query, source, state.skills, statusFilter])

  const openSkill = (id: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('skill', id)
    setSearchParams(next)
  }

  const closeSkill = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('skill')
    setSearchParams(next, { replace: true })
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow="管理后台 · Skills"
        title="Skills 中心"
        description="技能是可执行扩展。导入或自建后先进入审核，确认权限、来源与风险后，才能绑定给助理。"
        actions={
          <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> 添加 Skill
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: '已启用', value: counts.enabled, icon: CheckCircle2, tone: 'text-success bg-success-soft' },
          { label: '待审核', value: counts.review, icon: TriangleAlert, tone: 'text-warning bg-warning-soft' },
          { label: '已停用', value: counts.disabled, icon: Power, tone: 'text-muted bg-sunken' },
          { label: '高风险技能', value: counts.high, icon: ShieldCheck, tone: 'text-danger bg-danger-soft' },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-line bg-surface px-3.5 py-3 shadow-card">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
                {item.label}
              </span>
              <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-md', item.tone)}>
                <item.icon size={12} />
              </span>
            </div>
            <div className="mt-1 text-[22px] font-semibold tabular text-ink">{item.value}</div>
          </div>
        ))}
      </div>

      {reviewSkills.length > 0 && (
        <section className="mb-5 rounded-xl border border-warning/25 bg-warning-soft/60 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-warning-soft text-warning">
              <TriangleAlert size={13} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-ink">
                {reviewSkills.length} 个 Skill 等待审核
              </div>
              <p className="mt-0.5 text-[10.5px] leading-4 text-muted">
                核对来源、权限与风险后再启用。高风险技能会要求额外确认。
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setStatusFilter('review')
                setQuery('')
                setCategory('all')
                setSource('all')
              }}
            >
              只看待审核
            </Button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {reviewSkills.slice(0, 3).map((skill) => (
              <button
                key={skill.id}
                type="button"
                onClick={() => openSkill(skill.id)}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink-soft transition-colors hover:border-accent-line hover:text-ink"
              >
                <AgentIconGlyph icon={skill.icon} size={11} />
                {skill.name}
                <RiskBadge risk={skill.risk} />
                <ChevronRight size={11} className="text-faint" />
              </button>
            ))}
            {reviewSkills.length > 3 && (
              <span className="px-1 py-1 text-[10.5px] text-muted">+{reviewSkills.length - 3}</span>
            )}
          </div>
        </section>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 Skill"
            aria-label="搜索 Skill"
            className="h-8 w-[190px] rounded-lg border border-line bg-surface pl-7 pr-2.5 text-[12px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
          />
        </div>
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
          {(
            [
              ['all', `全部 ${state.skills.length}`],
              ['enabled', `已启用 ${counts.enabled}`],
              ['review', `待审核 ${counts.review}`],
              ['disabled', `已停用 ${counts.disabled}`],
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
        <div className="ml-auto flex items-center gap-1.5">
          <Select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-8 w-[124px] text-[11.5px]"
            aria-label="按分类筛选"
          >
            <option value="all">全部分类</option>
            {SKILL_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
          <Select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="h-8 w-[112px] text-[11.5px]"
            aria-label="按来源筛选"
          >
            <option value="all">全部来源</option>
            <option value="official">TeamOS 官方</option>
            <option value="custom">企业自建</option>
            <option value="imported">Skills Hub</option>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="hidden grid-cols-[minmax(0,1.7fr)_100px_90px_100px_minmax(0,1fr)_100px_24px] gap-3 border-b border-line bg-raised px-4 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-faint md:grid">
          <span>Skill</span>
          <span>分类</span>
          <span>风险</span>
          <span>状态</span>
          <span>绑定助理</span>
          <span>更新</span>
          <span />
        </div>
        {visible.length === 0 ? (
          <div className="p-3">
            <EmptyState
              icon={Box}
              title="没有匹配的 Skill"
              description="调整筛选条件，或添加一个新的技能。"
              compact
              action={
                <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
                  <Plus size={13} /> 添加 Skill
                </Button>
              }
            />
          </div>
        ) : (
          visible.map((skill) => {
            const agents = state.agents.filter((agent) => skill.agentIds.includes(agent.id))
            return (
              <button
                key={skill.id}
                type="button"
                onClick={() => openSkill(skill.id)}
                className="flex w-full flex-col gap-2 border-b border-line px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-raised md:grid md:grid-cols-[minmax(0,1.7fr)_100px_90px_100px_minmax(0,1fr)_100px_24px] md:items-center md:gap-3 md:px-4"
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-soft">
                    <AgentIconGlyph icon={skill.icon} size={15} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium text-ink">{skill.name}</span>
                      <span className="text-[9.5px] tabular text-faint">v{skill.version}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[10.5px] text-muted">{skill.description}</p>
                    <p className="mt-0.5 text-[9.5px] text-faint">
                      {skill.sourceLabel} · {skill.license}
                    </p>
                  </div>
                </div>

                <div className="hidden text-[11px] text-muted md:block">{skill.category}</div>
                <div className="hidden md:block">
                  <RiskBadge risk={skill.risk} />
                </div>
                <div>
                  <StatusPill status={skill.status} />
                </div>
                <div className="hidden items-center gap-1 md:flex">
                  {agents.slice(0, 3).map((agent) => (
                    <span key={agent.id} title={agent.name}>
                      <AgentAvatar icon={agent.icon} color={agent.color} size="xs" />
                    </span>
                  ))}
                  {agents.length > 3 && (
                    <span className="text-[10px] text-faint">+{agents.length - 3}</span>
                  )}
                  {agents.length === 0 && <span className="text-[10px] text-faint">未绑定</span>}
                </div>
                <div className="hidden text-[10.5px] text-faint md:block">
                  {formatRelative(skill.updatedAt)}
                </div>
                <div className="ml-auto flex items-center gap-2 text-faint md:ml-0 md:justify-end">
                  <span className="text-[10px] md:hidden">
                    {skill.category} · {formatRelative(skill.updatedAt)}
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
        技能目前作为助理的提示与工作流配置使用，不会下载或执行第三方代码；接入可执行 Skill 前需要隔离运行域、签名校验与资源配额。
      </p>

      <AddSkillDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        existing={state.skills}
        currentUserName={currentUser?.name ?? '管理员'}
        onCreate={(id) => {
          const next = new URLSearchParams(searchParams)
          next.set('skill', id)
          setSearchParams(next)
        }}
        createSkill={createSkill}
        notify={notify}
      />

      <SkillDetailDialog
        skill={selectedSkill}
        onClose={closeSkill}
        onOpenAgent={(id) => navigate(`/admin/agents/${id}`)}
        onRequestAction={(type, skill) => setAction({ type, skill })}
      />

      <ConfirmDialog
        open={Boolean(action)}
        onOpenChange={(open) => !open && setAction(null)}
        title={
          action?.type === 'delete'
            ? `删除「${action.skill.name}」？`
            : action?.type === 'reject'
              ? `拒绝「${action?.skill.name}」？`
              : `停用「${action?.skill.name}」？`
        }
        description={
          action?.type === 'delete'
            ? `这个 Skill 会从 ${action.skill.agentIds.length} 个助理解除绑定并删除，无法撤销。`
            : action?.type === 'reject'
              ? '拒绝后状态变为已停用，不会绑定给任何助理。你之后仍可以重新审核启用。'
              : `停用后助理不能继续使用它；如果助理包含这个技能，发布检查会阻止发布。已绑定的 ${action?.skill.agentIds.length ?? 0} 个助理会受影响。`
        }
        confirmLabel={action?.type === 'delete' ? '删除 Skill' : action?.type === 'reject' ? '拒绝并停用' : '停用 Skill'}
        onConfirm={() => {
          if (!action) return
          if (action.type === 'delete') {
            deleteSkill(action.skill.id)
            closeSkill()
          } else {
            setSkillStatus(action.skill.id, 'disabled')
          }
          setAction(null)
        }}
      />
    </PageBody>
  )
}

function AddSkillDialog({
  open,
  onOpenChange,
  existing,
  currentUserName,
  onCreate,
  createSkill,
  notify,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existing: Skill[]
  currentUserName: string
  onCreate: (id: string) => void
  createSkill: ReturnType<typeof useStore>['createSkill']
  notify: ReturnType<typeof useStore>['notify']
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('文档处理')
  const [source, setSource] = useState<'custom' | 'imported'>('custom')
  const [version, setVersion] = useState('0.1.0')
  const [risk, setRisk] = useState<Risk>('medium')
  const [permissions, setPermissions] = useState<string[]>([])

  const reset = () => {
    setName('')
    setDescription('')
    setCategory('文档处理')
    setSource('custom')
    setVersion('0.1.0')
    setRisk('medium')
    setPermissions([])
  }

  const handleCreate = () => {
    if (!name.trim() || !description.trim()) {
      notify('请填写 Skill 名称与说明。', { tone: 'warning' })
      return
    }
    if (existing.some((skill) => skill.name === name.trim())) {
      notify('已存在同名 Skill', { description: '换一个名字，避免助理与审计记录混淆。', tone: 'warning' })
      return
    }
    const id = createSkill({
      name,
      description,
      category,
      source,
      version,
      risk,
      permissions,
    })
    reset()
    onOpenChange(false)
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
      <DialogContent size="lg">
        <DialogHeader
          title="添加 Skill"
          description="新建或导入的 Skill 会先进入待审核队列，审核通过后才能绑定给助理。"
        />
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="名称" required htmlFor="skill-name">
              <Input
                id="skill-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：客户访谈编码"
                maxLength={24}
              />
            </Field>
            <Field label="版本" htmlFor="skill-version" hint="语义化版本">
              <Input
                id="skill-version"
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                placeholder="0.1.0"
                maxLength={16}
              />
            </Field>
          </div>

          <Field label="能力说明" required htmlFor="skill-desc" hint={`${description.length}/160`}>
            <Textarea
              id="skill-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value.slice(0, 160))}
              rows={3}
              placeholder="它能做什么、输入输出是什么、什么时候不该用。"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="分类" htmlFor="skill-category">
              <Select
                id="skill-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {SKILL_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="来源" htmlFor="skill-source">
              <Select
                id="skill-source"
                value={source}
                onChange={(event) => setSource(event.target.value as 'custom' | 'imported')}
              >
                <option value="custom">企业自建 · {currentUserName}</option>
                <option value="imported">从 Skills Hub 导入</option>
              </Select>
            </Field>
          </div>

          <div>
            <div className="mb-1.5 text-[13px] font-medium text-ink-soft">风险等级</div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['low', '低风险', '只处理文本，不触达外部系统'],
                  ['medium', '需留意', '会读写文件或知识空间'],
                  ['high', '高风险', '涉及网络、命令或敏感数据'],
                ] as const
              ).map(([key, label, hint]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRisk(key)}
                  aria-pressed={risk === key}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-colors',
                    risk === key
                      ? 'border-accent-line bg-accent-soft'
                      : 'border-line bg-surface hover:bg-raised',
                  )}
                >
                  <span className="block text-[11.5px] font-medium text-ink">{label}</span>
                  <span className="mt-0.5 block text-[10px] text-muted">{hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[13px] font-medium text-ink-soft">申请的权限</div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {PERMISSION_OPTIONS.map((permission) => (
                <label
                  key={permission}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11.5px] text-ink-soft hover:bg-raised"
                >
                  <Checkbox
                    checked={permissions.includes(permission)}
                    onChange={(event) =>
                      setPermissions((prev) =>
                        event.target.checked
                          ? [...prev, permission]
                          : prev.filter((item) => item !== permission),
                      )
                    }
                  />
                  {permission}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-raised px-3 py-2.5 text-[10.5px] leading-4 text-muted">
            当前版本不会加载技能代码。接入执行型 Skill 时，
            需要签名校验、权限审查与资源配额，并在隔离运行域执行；来源与版本会写入审计记录。
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="primary" onClick={handleCreate}>
            <Plus size={14} /> 提交审核
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SkillDetailDialog({
  skill,
  onClose,
  onOpenAgent,
  onRequestAction,
}: {
  skill: Skill | null
  onClose: () => void
  onOpenAgent: (id: string) => void
  onRequestAction: (type: 'reject' | 'disable' | 'delete', skill: Skill) => void
}) {
  const { state, setSkillStatus } = useStore()
  const [ack, setAck] = useState(false)

  useEffect(() => {
    setAck(false)
  }, [skill?.id])

  if (!skill) return null

  const agents = state.agents.filter((agent) => skill.agentIds.includes(agent.id))
  const needsAck = skill.status === 'review' && skill.risk === 'high'

  const approve = () => {
    setSkillStatus(skill.id, 'enabled')
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader
          title={skill.name}
          description={`${skill.category} · ${skill.sourceLabel}`}
        />
        <DialogBody className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={skill.status} />
            <RiskBadge risk={skill.risk} />
            <Badge tone="outline">v{skill.version}</Badge>
            <Badge tone="outline">{skill.license}</Badge>
            <span className="ml-auto text-[10.5px] text-faint">
              更新于 {formatRelative(skill.updatedAt)} · {skill.author}
            </span>
          </div>

          <p className="text-[13px] leading-6 text-ink-soft">{skill.description}</p>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink">
              <ShieldCheck size={13} /> 申请的权限
            </h3>
            {skill.permissions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {skill.permissions.map((permission) => (
                  <span
                    key={permission}
                    className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink-soft"
                  >
                    {permission}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11.5px] text-faint">不申请额外权限，只处理对话内容。</p>
            )}
            <p className="mt-2 text-[10.5px] leading-4 text-faint">
              权限只是上限；助理实际可用范围还受其工具配置与成员权限约束。
            </p>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink">
              <Users size={13} /> 已绑定助理 · {agents.length}
            </h3>
            {agents.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => onOpenAgent(agent.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink-soft transition-colors hover:border-accent-line hover:text-ink"
                  >
                    <AgentAvatar icon={agent.icon} color={agent.color} size="xs" />
                    {agent.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11.5px] text-faint">尚未绑定到任何助理。</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[12px] font-semibold text-ink">变更记录</h3>
            <ol className="space-y-2 border-l border-line pl-3.5">
              {skill.changelog.map((entry) => (
                <li key={`${entry.version}-${entry.date}`} className="relative">
                  <span className="absolute -left-[18px] top-1.5 h-2 w-2 rounded-full bg-line-strong" />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11.5px] font-medium text-ink">v{entry.version}</span>
                    <span className="text-[10px] text-faint">{formatRelative(entry.date)}</span>
                  </div>
                  <p className="text-[11px] leading-5 text-muted">{entry.note}</p>
                </li>
              ))}
            </ol>
          </section>

          {skill.status === 'review' && (
            <div className="rounded-lg border border-warning/20 bg-warning-soft px-3 py-2.5">
              <div className="flex items-start gap-2">
                <TriangleAlert size={13} className="mt-0.5 shrink-0 text-warning" />
                <div className="min-w-0 flex-1 text-[11px] leading-5 text-warning">
                  <span className="font-medium">等待审核。</span>
                  启用前请确认来源可信、权限与职责匹配。启用后，助理才能绑定它。
                  {needsAck && (
                    <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11px] leading-5 text-ink-soft">
                      <Checkbox
                        checked={ack}
                        onChange={(event) => setAck(event.target.checked)}
                        className="mt-0.5"
                      />
                      我已核对高风险权限（{skill.permissions.join('、') || '无额外权限'}）并确认来源可信。
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {skill.status === 'review' ? (
            <>
              <Button variant="secondary" onClick={() => onRequestAction('reject', skill)}>
                拒绝
              </Button>
              <Button variant="primary" onClick={approve} disabled={needsAck && !ack}>
                <Check size={14} /> 通过并启用
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => onRequestAction('delete', skill)}>
                <Trash2 size={13} /> 删除
              </Button>
              {skill.status === 'enabled' ? (
                <Button variant="secondary" onClick={() => onRequestAction('disable', skill)}>
                  <X size={14} /> 停用
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setSkillStatus(skill.id, 'enabled')}>
                  <Power size={14} /> 启用
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
