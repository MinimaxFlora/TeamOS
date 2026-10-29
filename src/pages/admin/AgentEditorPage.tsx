import {
  ArrowLeft,
  BookOpen,
  Bot,
  CheckCircle2,
  Info,
  LoaderCircle,
  Lock,
  MoreHorizontal,
  Pause,
  Play,
  Save,
  Sparkles,
  Trash2,
  TriangleAlert,
  UsersRound,
  Wrench,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, type AgentTestResult } from '../../lib/api'
import { useStore } from '../../lib/store'
import type { Agent, AgentIcon } from '../../lib/types'
import { DEPARTMENTS, MODELS, TOOL_DEFINITIONS } from '../../lib/seed'
import { cn } from '../../lib/utils'
import { formatDate, formatRelative } from '../../lib/format'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown'
import { EmptyState } from '../../components/ui/empty-state'
import { Field, Input, Select, Textarea } from '../../components/ui/input'
import { Switch } from '../../components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'

const ICON_OPTIONS: AgentIcon[] = [
  'sparkles',
  'briefcase',
  'pen',
  'chart',
  'file',
  'users',
  'headset',
  'megaphone',
  'calculator',
  'scale',
  'code',
  'globe',
  'flask',
  'palette',
]

const COLOR_OPTIONS = [
  '#2f55d4',
  '#11795c',
  '#9a5b07',
  '#b93c3c',
  '#6b5bd2',
  '#0f766e',
  '#56657a',
  '#7a4a2b',
  '#374151',
  '#4b5b76',
]

type Issue = { level: 'error' | 'warn'; text: string }

function configOf(agent: Agent) {
  return {
    name: agent.name,
    title: agent.title,
    department: agent.department,
    description: agent.description,
    responsibilities: agent.responsibilities,
    outOfScope: agent.outOfScope,
    instructions: agent.instructions,
    tone: agent.tone,
    escalation: agent.escalation,
    model: agent.model,
    skills: agent.skills,
    tools: agent.tools,
    knowledge: agent.knowledge,
    groupIds: agent.groupIds,
    color: agent.color,
    icon: agent.icon,
  }
}

export function AgentEditorPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const { state, notify, updateAgent, publishAgent, pauseAgent, resumeAgent, deleteAgent, validateAgent } =
    useStore()
  const navigate = useNavigate()
  const agent = state.agents.find((item) => item.id === agentId)
  const [draft, setDraft] = useState<Agent | null>(agent ?? null)
  const [tab, setTab] = useState('overview')
  const [newResponsibility, setNewResponsibility] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving'>('idle')
  const [publishOpen, setPublishOpen] = useState(false)
  const [pendingPublish, setPendingPublish] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    if (!agent) return
    setDraft(agent)
  }, [agent?.id, agent?.updatedAt, agent?.status, agent?.version])

  const savedConfig = useMemo(() => (agent ? JSON.stringify(configOf(agent)) : ''), [agent])
  const draftConfig = useMemo(() => (draft ? JSON.stringify(configOf(draft)) : ''), [draft])
  const unsaved = Boolean(draft && savedConfig !== draftConfig)

  useEffect(() => {
    if (!pendingPublish) return
    setPendingPublish(false)
    setPublishOpen(true)
  }, [pendingPublish, agent?.updatedAt])

  if (!agent || !draft) {
    return (
      <PageBody>
        <EmptyState
          icon={Bot}
          title="助理不存在"
          description="它可能已被删除，或链接不完整。"
          action={
            <Button variant="secondary" onClick={() => navigate('/admin/agents')}>
              返回助理团队
            </Button>
          }
        />
      </PageBody>
    )
  }

  const patch = (value: Partial<Agent>) => setDraft((prev) => (prev ? { ...prev, ...value } : prev))

  const saveDraft = () => {
    if (!draft) return
    setSaveState('saving')
    updateAgent(agent.id, configOf(draft))
    window.setTimeout(() => {
      setSaveState('idle')
      notify('草稿已保存', {
        description: '发布后版本号会更新，并记录到版本历史。',
        tone: 'success',
      })
    }, 260)
  }

  const handlePublishClick = () => {
    if (unsaved) {
      saveDraft()
      setPendingPublish(true)
      return
    }
    setPublishOpen(true)
  }

  const handleStatusAction = (action: 'pause' | 'resume') => {
    if (unsaved) {
      notify('请先保存草稿', {
        description: '停用或恢复前需要保存当前修改，避免丢失。',
        tone: 'warning',
      })
      return
    }
    if (action === 'pause') pauseAgent(agent.id)
    else resumeAgent(agent.id)
  }

  const publishCheck: { ok: boolean; issues: Issue[] } = publishOpen
    ? validateAgent(agent.id)
    : { ok: true, issues: [] }
  const errorCount = publishCheck.issues.filter((issue) => issue.level === 'error').length
  const [major, minor] = agent.version.split('.').map((value) => Number(value) || 0)
  const nextVersion = agent.status === 'draft' ? '1.0' : `${major}.${minor + 1}`

  const addResponsibility = () => {
    const value = newResponsibility.trim()
    if (!value) return
    if (draft.responsibilities.includes(value)) {
      setNewResponsibility('')
      return
    }
    patch({ responsibilities: [...draft.responsibilities, value] })
    setNewResponsibility('')
  }

  return (
    <PageBody className="max-w-[1120px]">
      <button
        type="button"
        onClick={() => navigate('/admin/agents')}
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={13} /> 返回助理团队
      </button>

      <PageHeader
        eyebrow={`AI 助理 · ${agent.department}`}
        title={`${agent.name} · ${agent.title}`}
        description={agent.description || '还没有一句话简介。员工会在助理目录中看到这段说明。'}
        actions={
          <>
            <StatusPill status={agent.status} />
            {unsaved ? (
              <Badge tone="warning">未保存</Badge>
            ) : agent.dirty ? (
              <Badge tone="warning">有未发布修改</Badge>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={saveDraft}
              disabled={!unsaved || saveState === 'saving'}
            >
              {saveState === 'saving' ? (
                <LoaderCircle size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}
              保存草稿
            </Button>
            <Button variant="primary" size="sm" onClick={handlePublishClick}>
              <Sparkles size={13} /> {agent.status === 'published' ? '发布更新' : '发布'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="iconSm" aria-label="更多操作">
                  <MoreHorizontal size={15} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[200px]">
                {agent.status === 'paused' ? (
                  <DropdownMenuItem onSelect={() => handleStatusAction('resume')}>
                    <Play size={14} /> 恢复使用
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => handleStatusAction('pause')}>
                    <Pause size={14} /> 停用助理
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  disabled={agent.status !== 'published'}
                  className="data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  onSelect={() => navigate('/workspace/agents')}
                >
                  <UsersRound size={14} /> 在员工目录中查看
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem danger onSelect={() => setDeleteOpen(true)}>
                  <Trash2 size={14} /> 删除助理
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="rounded-xl border border-line bg-surface shadow-card">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="no-scrollbar overflow-x-auto border-b border-line px-3 sm:px-4">
            <TabsList className="w-max min-w-full">
              <TabsTrigger value="overview">概览</TabsTrigger>
              <TabsTrigger value="instructions">职责与指令</TabsTrigger>
              <TabsTrigger value="model">模型</TabsTrigger>
              <TabsTrigger value="skills">技能与工具</TabsTrigger>
              <TabsTrigger value="knowledge">知识范围</TabsTrigger>
              <TabsTrigger value="scope">使用范围</TabsTrigger>
              <TabsTrigger value="test">测试</TabsTrigger>
              <TabsTrigger value="versions">版本历史</TabsTrigger>
            </TabsList>
          </div>

          <div className="p-4 sm:p-6">
            {unsaved && (
              <div className="mb-5 flex items-start gap-2 rounded-lg border border-warning/20 bg-warning-soft px-3 py-2 text-[11.5px] leading-5 text-warning">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                你正在编辑未保存的草稿。保存后点击「发布」，员工才能看到新的版本。
              </div>
            )}

            <TabsContent value="overview" className="space-y-6">
              <section>
                <h2 className="text-[13px] font-semibold text-ink">基本信息</h2>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  名字和岗位会显示在公司大厅、助理目录与运行记录里。
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="助理名字" required htmlFor="agent-name">
                    <Input
                      id="agent-name"
                      value={draft.name}
                      onChange={(event) => patch({ name: event.target.value })}
                      maxLength={12}
                    />
                  </Field>
                  <Field label="岗位名称" required htmlFor="agent-title">
                    <Input
                      id="agent-title"
                      value={draft.title}
                      onChange={(event) => patch({ title: event.target.value })}
                      maxLength={20}
                    />
                  </Field>
                  <Field label="所属部门" htmlFor="agent-dept">
                    <Select
                      id="agent-dept"
                      value={draft.department}
                      onChange={(event) => patch({ department: event.target.value })}
                    >
                      {DEPARTMENTS.map((department) => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="当前版本" hint="发布后自动递增">
                    <Input value={`v${agent.version}`} readOnly disabled />
                  </Field>
                </div>
                <Field
                  label="一句话简介"
                  required
                  htmlFor="agent-description"
                  className="mt-3"
                  hint={`${draft.description.length}/120`}
                >
                  <Textarea
                    id="agent-description"
                    value={draft.description}
                    onChange={(event) => patch({ description: event.target.value.slice(0, 120) })}
                    rows={2}
                    placeholder="员工会看到这段说明，写清楚它擅长什么。"
                  />
                </Field>
              </section>

              <section>
                <h2 className="text-[13px] font-semibold text-ink">外观</h2>
                <p className="mt-0.5 text-[11.5px] text-muted">用于公司大厅的消息头像与助理目录，避免与同事混淆。</p>
                <div className="mt-3 flex flex-wrap items-start gap-5">
                  <div>
                    <div className="mb-1.5 text-[11px] font-medium text-muted">图标</div>
                    <div className="grid grid-cols-7 gap-1.5">
                      {ICON_OPTIONS.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => patch({ icon })}
                          aria-pressed={draft.icon === icon}
                          aria-label={`选择图标 ${icon}`}
                          className={cn(
                            'inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors',
                            draft.icon === icon
                              ? 'border-accent-line bg-accent-soft text-accent'
                              : 'border-line bg-surface text-muted hover:bg-raised hover:text-ink',
                          )}
                        >
                          <AgentIconGlyph icon={icon} size={15} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1.5 text-[11px] font-medium text-muted">主题色</div>
                    <div className="flex max-w-[220px] flex-wrap gap-1.5">
                      {COLOR_OPTIONS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => patch({ color })}
                          aria-pressed={draft.color === color}
                          aria-label={`选择颜色 ${color}`}
                          className={cn(
                            'h-6 w-6 rounded-full border-2 transition-transform hover:scale-105',
                            draft.color === color ? 'border-ink' : 'border-transparent',
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2">
                    <AgentAvatar icon={draft.icon} color={draft.color} size="lg" />
                    <div>
                      <div className="text-[12px] font-medium text-ink">{draft.name || '未命名助理'}</div>
                      <div className="text-[10.5px] text-muted">{draft.title || '未设置岗位'}</div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-line bg-raised p-4">
                <h2 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                  <Info size={13} /> 发布前需要确认
                </h2>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {[
                    { label: '至少一个可用 Skill', ok: draft.skills.length > 0 },
                    { label: '已设置职责与指令', ok: Boolean(draft.instructions.trim()) },
                    { label: '发布后在公司大厅可用', ok: true },
                    { label: '已选择模型', ok: Boolean(draft.model.id) },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5 text-[11.5px]">
                      <span
                        className={cn(
                          'inline-flex h-4 w-4 items-center justify-center rounded-full',
                          item.ok ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning',
                        )}
                      >
                        {item.ok ? <CheckCircle2 size={11} /> : <TriangleAlert size={10} />}
                      </span>
                      <span className={item.ok ? 'text-ink-soft' : 'text-warning'}>{item.label}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2.5 text-[10.5px] leading-4 text-faint">
                  发布检查基于已保存的草稿；如果刚修改过，请先保存再发布。
                </p>
              </section>
            </TabsContent>

            <TabsContent value="instructions" className="space-y-6">
              <section>
                <h2 className="text-[13px] font-semibold text-ink">职责清单</h2>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  用短句写清楚它负责什么，员工在助理目录里也能看到。
                </p>
                <div className="mt-3 space-y-1.5">
                  {draft.responsibilities.map((item, index) => (
                    <div key={`${index}-${item.slice(0, 6)}`} className="flex items-center gap-2">
                      <span className="w-5 shrink-0 text-right text-[10px] text-faint">{index + 1}</span>
                      <Input
                        value={item}
                        onChange={(event) => {
                          const next = [...draft.responsibilities]
                          next[index] = event.target.value
                          patch({ responsibilities: next })
                        }}
                        aria-label={`第 ${index + 1} 项职责`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          patch({ responsibilities: draft.responsibilities.filter((_, i) => i !== index) })
                        }
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-faint hover:bg-danger-soft hover:text-danger"
                        aria-label="删除这项职责"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  {draft.responsibilities.length === 0 && (
                    <p className="rounded-lg border border-dashed border-line-strong px-3 py-3 text-[11.5px] text-faint">
                      还没有职责条目。至少写一项，员工才知道什么时候找它。
                    </p>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={newResponsibility}
                    onChange={(event) => setNewResponsibility(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        addResponsibility()
                      }
                    }}
                    placeholder="添加一项职责，按 Enter"
                    aria-label="添加职责"
                  />
                  <Button variant="secondary" onClick={addResponsibility} disabled={!newResponsibility.trim()}>
                    添加
                  </Button>
                </div>
              </section>

              <section className="grid gap-3 lg:grid-cols-2">
                <Field
                  label="工作方式与边界"
                  htmlFor="agent-instructions"
                  hint="这是助理的系统指令"
                >
                  <Textarea
                    id="agent-instructions"
                    value={draft.instructions}
                    onChange={(event) => patch({ instructions: event.target.value })}
                    rows={9}
                    className="min-h-[210px]"
                  />
                </Field>
                <div className="space-y-3">
                  <Field label="不负责什么" htmlFor="agent-out">
                    <Textarea
                      id="agent-out"
                      value={draft.outOfScope}
                      onChange={(event) => patch({ outOfScope: event.target.value })}
                      rows={3}
                      placeholder="例如：不代替负责人做最终排期决策。"
                    />
                  </Field>
                  <Field label="语气" htmlFor="agent-tone">
                    <Input
                      id="agent-tone"
                      value={draft.tone}
                      onChange={(event) => patch({ tone: event.target.value })}
                      placeholder="例如：直接、结构化、先结论后依据"
                    />
                  </Field>
                  <Field label="什么时候交给人类" htmlFor="agent-escalation">
                    <Textarea
                      id="agent-escalation"
                      value={draft.escalation}
                      onChange={(event) => patch({ escalation: event.target.value })}
                      rows={3}
                      placeholder="例如：涉及定价或合同条款时，请管理员确认。"
                    />
                  </Field>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="model" className="space-y-6">
              <section>
                <h2 className="text-[13px] font-semibold text-ink">选择模型</h2>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  模型凭证由部署环境管理，不会出现在浏览器或前端代码中。
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {MODELS.map((model) => {
                    const selected = draft.model.id === model.id
                    return (
                      <button
                        key={model.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() =>
                          patch({ model: { provider: model.provider, id: model.id, temperature: draft.model.temperature } })
                        }
                        className={cn(
                          'flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors',
                          selected
                            ? 'border-accent-line bg-accent-soft/60'
                            : 'border-line bg-surface hover:bg-raised',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                            selected ? 'border-accent bg-accent text-white' : 'border-line-strong',
                          )}
                        >
                          {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[12.5px] font-medium text-ink">{model.label}</span>
                            <Badge tone={model.provider === '私有部署' ? 'success' : 'neutral'} className="h-[17px] px-1.5 text-[9px]">
                              {model.hint}
                            </Badge>
                          </span>
                          <span className="mt-0.5 block text-[10.5px] text-muted">
                            {model.provider} · {model.id}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>

              <section className="max-w-[520px]">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-[13px] font-semibold text-ink">温度</h2>
                  <span className="text-[11px] tabular text-muted">{draft.model.temperature.toFixed(1)}</span>
                </div>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  越低越稳定，适合文档与法务；越高越发散，适合头脑风暴。助理默认建议 0.3–0.5。
                </p>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={draft.model.temperature}
                  onChange={(event) =>
                    patch({ model: { ...draft.model, temperature: Number(event.target.value) } })
                  }
                  className="mt-3 w-full accent-[var(--color-accent)]"
                  aria-label="模型温度"
                />
                <div className="mt-1 flex justify-between text-[10px] text-faint">
                  <span>0 · 稳定</span>
                  <span>1 · 发散</span>
                </div>
              </section>

              <div className="rounded-lg border border-line bg-raised px-3.5 py-3 text-[11px] leading-5 text-muted">
                这里保存模型偏好与温度。实际调用由服务端的 Hermes 运行，API Key 不会进入浏览器；运行记录会展示后端、耗时与估算成本。
              </div>
            </TabsContent>

            <TabsContent value="skills" className="space-y-6">
              <section>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="text-[13px] font-semibold text-ink">
                      Skills · 已绑定 {draft.skills.length} 个
                    </h2>
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      技能决定助理能做什么。待审核或已停用的技能不能随助理发布。
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/admin/skills')}>
                    <Wrench size={13} /> 技能中心
                  </Button>
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  {state.skills.map((skill) => {
                    const selected = draft.skills.includes(skill.id)
                    const unavailable = skill.status !== 'enabled'
                    return (
                      <div
                        key={skill.id}
                        className={cn(
                          'flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                          selected ? 'border-accent-line bg-accent-soft/40' : 'border-line bg-surface',
                        )}
                      >
                        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-ink-soft">
                          <AgentIconGlyph icon={skill.icon} size={15} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[12px] font-medium text-ink">{skill.name}</span>
                            <RiskBadge risk={skill.risk} />
                            {unavailable && (
                              <Badge tone={skill.status === 'review' ? 'warning' : 'neutral'} className="h-[17px] px-1.5 text-[9px]">
                                {skill.status === 'review' ? '待审核' : '已停用'}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-4 text-muted">
                            {skill.description}
                          </p>
                        </div>
                        <Switch
                          checked={selected}
                          disabled={unavailable && !selected}
                          onCheckedChange={(checked) => {
                            if (checked && unavailable) {
                              notify('该 Skill 当前不可用', {
                                description: '先在 技能中心完成审核或启用。',
                                tone: 'warning',
                              })
                              return
                            }
                            patch({
                              skills: checked
                                ? [...draft.skills, skill.id]
                                : draft.skills.filter((id) => id !== skill.id),
                            })
                          }}
                          aria-label={`绑定 ${skill.name}`}
                          className="mt-1"
                        />
                      </div>
                    )
                  })}
                </div>
              </section>

              <section>
                <h2 className="text-[13px] font-semibold text-ink">工具权限</h2>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  只勾选完成职责必需的工具。高风险工具调用会写入审计记录。
                </p>
                <div className="mt-3 space-y-2">
                  {TOOL_DEFINITIONS.map((tool) => {
                    const checked = draft.tools.includes(tool.key)
                    return (
                      <div
                        key={tool.key}
                        className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[12px] font-medium text-ink">{tool.label}</span>
                            <RiskBadge risk={tool.risk} />
                            <span className="text-[9.5px] text-faint">{tool.key}</span>
                          </div>
                          <p className="mt-0.5 text-[10.5px] leading-4 text-muted">{tool.description}</p>
                        </div>
                        <Switch
                          checked={checked}
                          onCheckedChange={(next) => {
                            if (next && tool.risk === 'high') {
                              notify('已开启高风险工具', {
                                description: '发布后每次调用都会记录审计事件；建议同时设置审批。',
                                tone: 'warning',
                              })
                            }
                            patch({
                              tools: next
                                ? [...draft.tools, tool.key]
                                : draft.tools.filter((key) => key !== tool.key),
                            })
                          }}
                          aria-label={`开启 ${tool.label}`}
                        />
                      </div>
                    )
                  })}
                </div>
                {draft.tools.includes('shell.run') && (
                  <p className="mt-2 flex items-start gap-1.5 text-[10.5px] leading-4 text-danger">
                    <TriangleAlert size={11} className="mt-0.5 shrink-0" />
                    脚本执行权限风险最高。当前版本不会从聊天中直接执行命令；接入执行类工具前，应配置命令白名单、资源配额与人工审批。
                  </p>
                )}
              </section>
            </TabsContent>

            <TabsContent value="knowledge" className="space-y-4">
              <div>
                <h2 className="text-[13px] font-semibold text-ink">可见知识范围</h2>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  只能看到勾选空间内的已审批文档。受限空间还需要结合成员权限判断。
                </p>
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                {state.knowledge.map((space) => {
                  const checked = draft.knowledge.includes(space.id)
                  return (
                    <div
                      key={space.id}
                      className={cn(
                        'flex items-start gap-3 rounded-lg border px-3 py-3',
                        checked ? 'border-accent-line bg-accent-soft/40' : 'border-line bg-surface',
                      )}
                    >
                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-ink-soft">
                        {space.restricted ? <Lock size={14} /> : <BookOpen size={14} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-medium text-ink">{space.name}</span>
                          {space.restricted && (
                            <Badge tone="warning" className="h-[17px] px-1.5 text-[9px]">
                              受限
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-[10.5px] leading-4 text-muted">{space.description}</p>
                        <div className="mt-1 text-[9.5px] text-faint">
                          {
                            state.knowledgeDocs.filter(
                              (doc) => doc.spaceId === space.id && doc.status === 'ready',
                            ).length
                          }{' '}
                          篇已审批文档
                        </div>
                      </div>
                      <Switch
                        checked={checked}
                        onCheckedChange={(next) =>
                          patch({
                            knowledge: next
                              ? [...draft.knowledge, space.id]
                              : draft.knowledge.filter((id) => id !== space.id),
                          })
                        }
                        aria-label={`允许访问 ${space.name}`}
                        className="mt-1"
                      />
                    </div>
                  )
                })}
              </div>
              <div className="rounded-lg border border-line bg-raised px-3.5 py-3 text-[11px] leading-5 text-muted">
                知识写入必须经过管理员审批并保留来源。助理回答时应附引用；找不到依据时明确说明，不能编造。
              </div>
            </TabsContent>

            <TabsContent value="scope" className="space-y-4">
              <div>
                <h2 className="text-[13px] font-semibold text-ink">使用范围</h2>
                <p className="mt-0.5 text-[11.5px] leading-5 text-muted">
                  TeamOS 每家公司只有一个公司大厅。助理发布后自动对全公司可见，员工在同一个聊天页里
                  输入 @ 即可召唤，由公司大厅统一承载。
                </p>
              </div>

              <div className="rounded-xl border border-accent-line bg-accent-soft/60 p-4">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-accent shadow-card">
                    <UsersRound size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12.5px] font-semibold text-ink">公司大厅</span>
                      <Badge tone={draft.status === 'published' ? 'success' : 'outline'} dot>
                        {draft.status === 'published' ? '全员可用' : '发布后全员可用'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[10.5px] leading-4 text-muted">
                      全公司 {state.members.filter((member) => member.status === 'active').length} 位在职成员
                      都可以在会话里 @ 它；管理员不会看到员工的私有对话内容。
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ['可见范围', '全公司', '不按部门拆分'],
                  ['调用方式', '@ 助理名字', '在同一聊天页'],
                  ['上下文', '当前会话', '归档时压缩为记忆'],
                ].map(([label, value, hint]) => (
                  <div key={label} className="rounded-lg border border-line bg-raised px-3 py-2.5">
                    <div className="text-[9.5px] uppercase tracking-wide text-faint">{label}</div>
                    <div className="mt-0.5 text-[12.5px] font-semibold text-ink">{value}</div>
                    <div className="mt-0.5 text-[10px] text-muted">{hint}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-line bg-raised px-3.5 py-3 text-[11px] leading-5 text-muted">
                停用或删除后，助理会立即从公司大厅的 @ 列表中消失。文件读写、网络访问等高风险工具
                仍受工具授权与审批约束，与使用范围相互独立。
              </div>
            </TabsContent>

            <TabsContent value="test">
              <TestPanel agent={draft} />
            </TabsContent>

            <TabsContent value="versions" className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-[13px] font-semibold text-ink">版本历史</h2>
                  <p className="mt-0.5 text-[11.5px] text-muted">
                    发布时自动记录版本与操作人。当前版本暂不支持回滚到历史版本。
                  </p>
                </div>
                <Badge tone="outline">当前 v{agent.version}</Badge>
              </div>
              <ol className="relative space-y-4 border-l border-line pl-5">
                {agent.versions.map((version, index) => (
                  <li key={`${version.version}-${version.at}`} className="relative">
                    <span
                      className={cn(
                        'absolute -left-[26px] top-1 inline-flex h-3 w-3 items-center justify-center rounded-full border-2 border-surface',
                        index === 0 ? 'bg-accent' : 'bg-line-strong',
                      )}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-semibold text-ink">v{version.version}</span>
                      {index === 0 && <Badge tone="accent" className="h-[17px] px-1.5 text-[9px]">最新</Badge>}
                      <span className="text-[10.5px] text-faint">
                        {formatDate(version.at)} · {version.author}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-5 text-muted">{version.note}</p>
                  </li>
                ))}
                <li className="relative">
                  <span className="absolute -left-[26px] top-1 inline-flex h-3 w-3 rounded-full border-2 border-surface bg-line-strong" />
                  <div className="text-[11.5px] text-muted">
                    创建于 {formatDate(agent.createdAt)} · 最近更新 {formatRelative(agent.updatedAt)}
                  </div>
                  {agent.templateId && (
                    <div className="mt-0.5 text-[10.5px] text-faint">由官方模板创建</div>
                  )}
                </li>
              </ol>
              {agent.dirty && (
                <div className="rounded-lg border border-warning/20 bg-warning-soft px-3 py-2 text-[11px] leading-5 text-warning">
                  当前有未发布的修改。发布后才会生成新的版本记录。
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent size="md">
          <DialogHeader
            title={`发布「${agent.name}」v${nextVersion}`}
            description="发布后，员工可以在公司大厅里 @ 它。"
          />
          <DialogBody className="space-y-3">
            {publishCheck.issues.length === 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-success/20 bg-success-soft px-3 py-2.5">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" />
                <div>
                  <div className="text-[12px] font-medium text-success">检查通过</div>
                  <p className="mt-0.5 text-[11px] leading-5 text-success/90">
                    技能、模型与指令均已就绪。发布记录会写入版本历史与审计日志。
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {publishCheck.issues.map((issue) => (
                  <div
                    key={issue.text}
                    className={cn(
                      'flex items-start gap-2 rounded-lg border px-3 py-2 text-[11.5px] leading-5',
                      issue.level === 'error'
                        ? 'border-danger/20 bg-danger-soft text-danger'
                        : 'border-warning/20 bg-warning-soft text-warning',
                    )}
                  >
                    <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                    <span>
                      <span className="font-medium">{issue.level === 'error' ? '必须修复：' : '提醒：'}</span>
                      {issue.text}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-lg bg-raised px-3 py-2.5 text-[10.5px] leading-4 text-muted">
              本版本会记录说明「发布当前草稿」与操作人。若发现问题，可以停用助理或发布修复版本；员工侧已有的运行会正常结束。
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPublishOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={errorCount > 0}
              onClick={() => {
                const result = publishAgent(agent.id)
                if (!result.ok) {
                  notify('发布被阻止', {
                    description: '请先修复检查项。',
                    tone: 'danger',
                  })
                  return
                }
                setPublishOpen(false)
              }}
            >
              <Sparkles size={14} />
              {errorCount > 0 ? '修复后才能发布' : publishCheck.issues.length > 0 ? '仍然发布' : '确认发布'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`删除「${agent.name}」？`}
        description="删除后员工将无法再 @ 它，技能绑定也会移除。这个操作无法在界面撤销。"
        confirmLabel="删除助理"
        onConfirm={() => {
          deleteAgent(agent.id)
          navigate('/admin/agents')
        }}
      />
    </PageBody>
  )
}

function TestPanel({ agent }: { agent: Agent }) {
  const { state, notify } = useStore()
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState<'idle' | 'running' | 'done'>('idle')
  const [result, setResult] = useState<AgentTestResult | null>(null)

  const skills = state.skills.filter((skill) => agent.skills.includes(skill.id))
  const knowledge = state.knowledge.filter((space) => agent.knowledge.includes(space.id))

  const runTest = async () => {
    const value = prompt.trim()
    if (!value) {
      notify('先写一个测试问题', { tone: 'warning' })
      return
    }
    setStatus('running')
    setResult(null)
    try {
      const response = await api.testAgent(agent, value)
      setResult(response)
      setStatus('done')
    } catch (error) {
      notify('测试失败', {
        tone: 'danger',
        description: error instanceof Error ? error.message : '请检查模型设置后重试',
      })
      setStatus('idle')
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <h2 className="text-[13px] font-semibold text-ink">试用当前配置</h2>
        <p className="mt-0.5 text-[11.5px] leading-5 text-muted">
          使用编辑器里的当前草稿（无需先保存）发起一次真实模型调用，不会发到公司大厅，也不会写入运行记录。
        </p>
        <div className="mt-3">
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            placeholder="例如：帮我把下周客户演示的需求收敛成一页提纲。"
            aria-label="测试问题"
          />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={runTest} disabled={status === 'running'}>
            {status === 'running' ? (
              <LoaderCircle size={13} className="animate-spin" />
            ) : (
              <Play size={13} />
            )}
            {status === 'running' ? '模型运行中…' : '运行测试'}
          </Button>
          <span className="text-[10px] text-faint">
            草稿温度 {agent.model.temperature.toFixed(1)} · 实际模型由「设置 → 大模型」决定
          </span>
        </div>

        {result && (
          <div className="mt-4 rounded-lg border border-line bg-raised p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <AgentAvatar icon={agent.icon} color={agent.color} size="sm" />
              <span className="text-[12px] font-medium text-ink">{agent.name}</span>
              <Badge tone="success" className="h-[17px] px-1.5 text-[9px]">
                真实模型
              </Badge>
              <span className="text-[10px] text-faint">
                {result.backend === 'hermes' ? 'Hermes' : '直连模型'} · {(result.latencyMs / 1000).toFixed(1)}s
              </span>
            </div>
            <p className="whitespace-pre-wrap text-[12px] leading-6 text-ink-soft">{result.reply}</p>
            {result.sources.length > 0 && (
              <div className="mt-3 border-t border-line pt-2">
                <div className="text-[10px] font-medium text-faint">引用来源</div>
                <ul className="mt-1 space-y-1">
                  {result.sources.map((source) => (
                    <li key={source.label} className="text-[10.5px] text-muted">
                      {source.label} · {source.meta}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <aside className="space-y-3">
        <div className="rounded-lg border border-line bg-surface px-3.5 py-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">本次会用到</h3>
          <div className="mt-2 space-y-1.5 text-[11.5px]">
            <div className="flex items-center justify-between">
              <span className="text-muted">模型</span>
              <span className="text-ink-soft">{agent.model.id}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">技能</span>
              <span className="text-ink-soft">{skills.length} 个</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">知识空间</span>
              <span className="text-ink-soft">{knowledge.length} 个</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">工具</span>
              <span className="text-ink-soft">{agent.tools.length} 个</span>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-line bg-raised px-3.5 py-3 text-[10.5px] leading-4 text-muted">
          测试只做一次模型推理，不执行任何工具；知识检索会按当前账号权限过滤，受限文档不会出现在引用里。
        </div>
        {agent.status !== 'published' && (
          <div className="flex items-start gap-1.5 rounded-lg border border-warning/20 bg-warning-soft px-3 py-2 text-[10.5px] leading-4 text-warning">
            <Info size={11} className="mt-0.5 shrink-0" />
            该助理尚未发布，员工工作台里还看不到它。
          </div>
        )}
      </aside>
    </div>
  )
}
