import {
  BarChart3,
  BookOpen,
  Bot,
  Box,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  FileText,
  FileUp,
  Globe,
  GraduationCap,
  LifeBuoy,
  Loader2,
  Palette,
  PenLine,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, type InstalledSkill, type MarketIndex, type MarketSkill } from '../../lib/api'
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
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs'

type StatusFilter = 'all' | Skill['status']

const PERMISSION_OPTIONS = [
  '读取工作区文件',
  '写入工作区文件',
  '网络访问',
  '读取企业知识',
  '发送消息',
  '执行服务器命令',
]

/** 技能源的分类 → TeamOS 自己的中文分类，保证筛选器与助理绑定都能复用。 */
const MARKET_CATEGORY_MAP: Record<string, string> = {
  'office-efficiency': '文档处理',
  'content-creation': '内容创作',
  development: '编程开发',
  'dev-programming': '编程开发',
  'data-analysis': '数据分析',
  'design-media': '内容创作',
  'ai-agent': '自动化',
  'knowledge-management': '知识检索',
  'business-operations': '销售增长',
  'business-ops': '销售增长',
  education: '信息整理',
  'industry-experts': '通用',
  'life-services': '通用',
}

/** 卡片配色/图标按分类轮转，和 1Panel 应用商店的卡片观感一致。 */
const CATEGORY_STYLE: Record<string, { icon: LucideIcon; tone: string }> = {
  'office-efficiency': { icon: FileText, tone: 'bg-accent-soft text-accent-strong' },
  'content-creation': { icon: PenLine, tone: 'bg-warning-soft text-warning' },
  development: { icon: Code2, tone: 'bg-success-soft text-success' },
  'dev-programming': { icon: Code2, tone: 'bg-success-soft text-success' },
  'data-analysis': { icon: BarChart3, tone: 'bg-accent-soft text-accent-strong' },
  'design-media': { icon: Palette, tone: 'bg-danger-soft text-danger' },
  'ai-agent': { icon: Bot, tone: 'bg-warning-soft text-warning' },
  'knowledge-management': { icon: BookOpen, tone: 'bg-success-soft text-success' },
  'business-operations': { icon: Briefcase, tone: 'bg-danger-soft text-danger' },
  education: { icon: GraduationCap, tone: 'bg-accent-soft text-accent-strong' },
  'industry-experts': { icon: Wrench, tone: 'bg-warning-soft text-warning' },
  'life-services': { icon: LifeBuoy, tone: 'bg-success-soft text-success' },
}

const FALLBACK_STYLES = [
  { icon: Sparkles, tone: 'bg-accent-soft text-accent-strong' },
  { icon: Box, tone: 'bg-warning-soft text-warning' },
  { icon: Wrench, tone: 'bg-success-soft text-success' },
]

function categoryStyle(key: string) {
  return CATEGORY_STYLE[key] ?? FALLBACK_STYLES[0]
}

/** SKILL.md 里出现这些字样就按高风险处理，交给管理员复核。 */
function guessRisk(text: string): Risk {
  if (/(shell|命令行|终端|执行命令|bash|exec\(|credential|api[_ -]?key|密钥|浏览器自动化)/i.test(text)) {
    return 'high'
  }
  if (/(写入|保存文件|数据库|sql|http|接口调用|上传|upload)/i.test(text)) return 'medium'
  return 'low'
}

export function AdminSkillsPage() {
  const { state, currentUser, notify, createSkill, deleteSkill, setSkillStatus, updateSkill } = useStore()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [tab, setTab] = useState('market')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [category, setCategory] = useState('all')
  const [source, setSource] = useState('all')

  const [market, setMarket] = useState<MarketIndex | null>(null)
  const [marketLoading, setMarketLoading] = useState(true)
  const [marketError, setMarketError] = useState('')
  const [marketQuery, setMarketQuery] = useState('')
  const [marketCategory, setMarketCategory] = useState('all')
  const [adding, setAdding] = useState<string[]>([])
  const [installed, setInstalled] = useState<InstalledSkill[]>([])
  const [skillsRoot, setSkillsRoot] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceDraft, setSourceDraft] = useState('')
  const [savingSource, setSavingSource] = useState(false)

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

  const loadMarket = useCallback(
    async (force = false) => {
      setMarketLoading(true)
      setMarketError('')
      if (force) setRefreshing(true)
      try {
        const data = force ? await api.refreshMarket() : await api.getMarket()
        setMarket(data)
        setSourceDraft(data.source.url)
      } catch (reason) {
        setMarketError(reason instanceof Error ? reason.message : '读取技能源失败')
      } finally {
        setMarketLoading(false)
        setRefreshing(false)
      }
    },
    [],
  )

  useEffect(() => {
    void loadMarket(false)
  }, [loadMarket])

  const loadInstalled = useCallback(async () => {
    try {
      const data = await api.listSkills()
      setInstalled(data.installed)
      setSkillsRoot(data.root)
    } catch {
      // 技能目录还没建好时忽略，卡片按「未安装」显示
    }
  }, [])

  useEffect(() => {
    void loadMarket(false)
    void loadInstalled()
  }, [loadMarket, loadInstalled])

  const installedKeys = useMemo(() => new Set(installed.map((item) => item.slug)), [installed])

  const isInstalled = (item: MarketSkill) => installedKeys.has(item.slug)
  const recordFor = (item: MarketSkill) =>
    state.skills.find((skill) => (skill.slug ? skill.slug === item.slug : skill.name === item.name)) ?? null

  const marketSkills = market?.skills ?? []
  const visibleMarket = useMemo(() => {
    const needle = marketQuery.trim().toLowerCase()
    return marketSkills
      .filter((item) => marketCategory === 'all' || item.category === marketCategory)
      .filter((item) => {
        if (!needle) return true
        return `${item.name} ${item.description} ${item.categoryName}`.toLowerCase().includes(needle)
      })
  }, [marketCategory, marketQuery, marketSkills])

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

  const addFromMarket = async (item: MarketSkill) => {
    if (adding.includes(item.slug) || isInstalled(item)) return
    setAdding((prev) => [...prev, item.slug])
    try {
      // 1) 真安装：把技能目录写进 Hermes 的 skills/，脚本与 references 一起落盘
      const result = await api.installSkill(item.slug)
      // 2) 登记一条技能，才能被助理绑定、进审核队列
      const { content } = await api.marketSkill(item.slug).catch(() => ({ content: '' }))
      const id = createSkill({
        name: item.name,
        slug: item.slug,
        description: item.description,
        category: MARKET_CATEGORY_MAP[item.category] ?? '通用',
        source: 'imported',
        version: item.version || '1.0.0',
        risk: guessRisk(content),
        permissions: [],
        content,
        sourceUrl: result.installed?.sourceUrl,
        sourceLabel: 'TeamOS-Skills',
        author: 'TeamOS-Skills',
        license: '见源站',
      })
      setInstalled((prev) => [...prev.filter((s) => s.slug !== item.slug), { ...result.installed }])
      notify('已安装到 Hermes', {
        description: `${item.name} 已写入技能目录，并在技能中心登记为待审核。`,
        tone: 'success',
      })
      openSkill(id)
    } catch (reason) {
      notify('安装失败', {
        description: reason instanceof Error ? reason.message : '安装技能失败',
        tone: 'danger',
      })
    } finally {
      setAdding((prev) => prev.filter((slug) => slug !== item.slug))
    }
  }

  const removeSkill = async (skill: Skill) => {
    if (skill.slug) {
      try {
        await api.uninstallSkill(skill.slug)
        setInstalled((prev) => prev.filter((item) => item.slug !== skill.slug))
      } catch {
        // 磁盘目录已经不在也算卸载成功
      }
    }
    deleteSkill(skill.id)
    closeSkill()
  }

  const saveSource = async () => {
    setSavingSource(true)
    try {
      await api.setMarketSource(sourceDraft.trim())
      setSourceOpen(false)
      await loadMarket(true)
      notify('技能源已更新', { tone: 'success' })
    } catch (reason) {
      notify('技能源保存失败', {
        description: reason instanceof Error ? reason.message : '地址不合法',
        tone: 'danger',
      })
    } finally {
      setSavingSource(false)
    }
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow="管理后台 · 技能"
        title="技能中心"
        description="技能是可执行扩展。从技能源添加后先进入审核，确认权限、来源与风险后，才能绑定给助理。"
        actions={
          <>
            <Button variant="secondary" size="sm" disabled={refreshing} onClick={() => void loadMarket(true)}>
              {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} 刷新
            </Button>
            <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
              <Plus size={14} /> 自定义技能
            </Button>
          </>
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

      <Tabs value={tab} onValueChange={setTab}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <TabsList variant="pills">
            <TabsTrigger variant="pills" value="market">
              技能市场
              <span className="text-[10px] tabular text-faint">{market ? market.total : '—'}</span>
            </TabsTrigger>
            <TabsTrigger variant="pills" value="installed">
              已安装
              <span className="text-[10px] tabular text-faint">{installed.length}</span>
            </TabsTrigger>
          </TabsList>
          {tab === 'market' && (
            <span className="hidden items-center gap-1.5 text-[10.5px] text-faint sm:flex">
              <Globe size={11} />
              <span className="max-w-[280px] truncate font-mono" title={market?.source.url}>
                {market?.source.url ?? '—'}
              </span>
              <button
                type="button"
                onClick={() => setSourceOpen((prev) => !prev)}
                className="text-accent hover:underline"
              >
                更换
              </button>
            </span>
          )}
        </div>

        {tab === 'market' && (
          <div className="space-y-3">
            {sourceOpen && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent-line bg-accent-soft/40 px-3 py-2.5">
                <input
                  value={sourceDraft}
                  onChange={(event) => setSourceDraft(event.target.value)}
                  placeholder="https://raw.githubusercontent.com/<owner>/<repo>/main/catalog.json"
                  className="h-8 min-w-[260px] flex-1 rounded-lg border border-line bg-surface px-2.5 font-mono text-[11px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
                />
                <Button size="sm" variant="primary" disabled={savingSource} onClick={() => void saveSource()}>
                  {savingSource ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} 保存并重载
                </Button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full max-w-[240px]">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
                />
                <input
                  value={marketQuery}
                  onChange={(event) => setMarketQuery(event.target.value)}
                  placeholder="搜索技能名称或说明"
                  aria-label="搜索技能"
                  className="h-8 w-full rounded-lg border border-line bg-surface pl-7 pr-2.5 text-[12px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
                />
              </div>
              <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setMarketCategory('all')}
                  className={cn(
                    'shrink-0 rounded-md px-2 py-1 text-[11px] transition-colors',
                    marketCategory === 'all'
                      ? 'bg-accent-soft font-medium text-accent-strong'
                      : 'text-muted hover:bg-sunken hover:text-ink',
                  )}
                >
                  全部 {market?.total ?? 0}
                </button>
                {(market?.categories ?? []).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setMarketCategory(item.id)}
                    className={cn(
                      'shrink-0 rounded-md px-2 py-1 text-[11px] transition-colors',
                      marketCategory === item.id
                        ? 'bg-accent-soft font-medium text-accent-strong'
                        : 'text-muted hover:bg-sunken hover:text-ink',
                    )}
                  >
                    {item.name} {item.count}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-[10.5px] text-faint">
                {marketLoading ? '正在读取技能源…' : `${visibleMarket.length} 个技能`}
              </span>
            </div>

            {marketError && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-[11.5px] text-danger">{marketError}</p>
            )}
            {market?.stale && (
              <p className="rounded-lg bg-warning-soft px-3 py-2 text-[11.5px] text-warning">
                技能源暂时访问不了，正在使用缓存
                {market.warning ? `（${market.warning}）` : ''}。
              </p>
            )}

            {marketLoading && !market ? (
              <div className="flex items-center justify-center gap-2 py-16 text-[12px] text-muted">
                <Loader2 size={14} className="animate-spin" /> 正在加载技能…
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibleMarket.map((item) => (
                  <SkillCard
                    key={item.slug}
                    item={item}
                    installed={isInstalled(item)}
                    record={recordFor(item)}
                    busy={adding.includes(item.slug)}
                    onAdd={() => void addFromMarket(item)}
                  />
                ))}
              </div>
            )}

            {!marketLoading && visibleMarket.length === 0 && (
              <EmptyState
                icon={Box}
                title="没有匹配的技能"
                description="换个关键词或分类试试；也可以「更换」技能源地址。"
                compact
              />
            )}

            <p className="text-[10px] leading-4 text-faint">
              技能来自 {market?.name ?? 'TeamOS-Skills'} 仓库（更新于 {market?.updated || '—'}）。
              点「+」会把整个技能目录（SKILL.md + scripts + references）写进{' '}
              <code className="font-mono">{skillsRoot || 'Hermes 技能目录'}</code>，同时登记为待审核；
              审核通过后绑定到助理，助理才能用它。
            </p>
          </div>
        )}

        {tab === 'installed' && (
          <div>
            {reviewSkills.length > 0 && (
              <section className="mb-4 rounded-xl border border-warning/25 bg-warning-soft/60 p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-warning-soft text-warning">
                    <TriangleAlert size={13} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-ink">
                      {reviewSkills.length} 个技能等待审核
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
              </section>
            )}

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索已安装技能"
                  aria-label="搜索已安装技能"
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
                  <option value="imported">TeamOS-Skills</option>
                </Select>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
              <div className="hidden grid-cols-[minmax(0,1.7fr)_100px_90px_100px_minmax(0,1fr)_100px_24px] gap-3 border-b border-line bg-raised px-4 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-faint md:grid">
                <span>技能</span>
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
                    title="还没有安装技能"
                    description="去「技能市场」挑几个，或添加一个自定义技能。"
                    compact
                    action={
                      <Button size="sm" variant="secondary" onClick={() => setTab('market')}>
                        去技能市场
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
              技能的 SKILL.md 会作为助理的提示与工作流说明使用，不会执行文件里的代码。导入的技能保留原文与来源链接，方便审计与更新。
            </p>
          </div>
        )}
      </Tabs>

      <AddSkillDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        existing={state.skills}
        currentUserName={currentUser?.name ?? '管理员'}
        onCreate={(id) => {
          setTab('installed')
          openSkill(id)
        }}
        createSkill={createSkill}
        notify={notify}
      />

      <SkillDetailDialog
        skill={selectedSkill}
        onClose={closeSkill}
        onOpenAgent={(id) => navigate(`/admin/agents/${id}`)}
        onRequestAction={(type, skill) => setAction({ type, skill })}
        onUpdate={updateSkill}
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
            ? `这个技能会从 ${action.skill.agentIds.length} 个助理解除绑定并删除，无法撤销。`
            : action?.type === 'reject'
              ? '拒绝后状态变为已停用，不会绑定给任何助理。你之后仍可以重新审核启用。'
              : `停用后助理不能继续使用它；如果助理包含这个技能，发布检查会阻止发布。已绑定的 ${action?.skill.agentIds.length ?? 0} 个助理会受影响。`
        }
        confirmLabel={
          action?.type === 'delete' ? '删除技能' : action?.type === 'reject' ? '拒绝并停用' : '停用技能'
        }
        onConfirm={() => {
          if (!action) return
          if (action.type === 'delete') {
            void removeSkill(action.skill)
          } else {
            setSkillStatus(action.skill.id, 'disabled')
          }
          setAction(null)
        }}
      />
    </PageBody>
  )
}

function SkillCard({
  item,
  installed,
  record,
  busy,
  onAdd,
}: {
  item: MarketSkill
  installed: boolean
  record: Skill | null
  busy: boolean
  onAdd: () => void
}) {
  const style = categoryStyle(item.category)
  const Icon = style.icon
  return (
    <div className="group relative flex min-h-[104px] items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3.5 shadow-card transition-colors hover:border-accent-line">
      <span
        className={cn(
          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          style.tone,
        )}
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1 pr-7">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-ink">{item.name}</span>
          {item.version && <span className="text-[9.5px] tabular text-faint">v{item.version}</span>}
          {record && <StatusPill status={record.status} />}
        </div>
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted">{item.description}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[9.5px] text-faint">
          <span>{item.categoryName}</span>
          <span className="truncate font-mono opacity-70">{item.slug}</span>
        </p>
      </div>
      <button
        type="button"
        aria-label={installed ? `${item.name} 已安装` : `安装 ${item.name}`}
        title={installed ? '已安装到 Hermes 技能目录' : '安装到 Hermes 技能目录'}
        disabled={installed || busy}
        onClick={onAdd}
        className={cn(
          'absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
          installed
            ? 'border-success/30 bg-success-soft text-success'
            : 'border-line-strong bg-surface text-muted hover:border-accent hover:text-accent disabled:opacity-60',
        )}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : installed ? <Check size={13} /> : <Plus size={13} />}
      </button>
    </div>
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
  const [content, setContent] = useState('')
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)

  const reset = () => {
    setName('')
    setDescription('')
    setCategory('文档处理')
    setSource('custom')
    setVersion('0.1.0')
    setRisk('medium')
    setPermissions([])
    setContent('')
    setFileName('')
  }

  const readFile = async (file: File | null) => {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      notify('文件超过 2 MB', { description: 'SKILL.md 通常只有几 KB，请确认文件是否正确。', tone: 'warning' })
      return
    }
    setReading(true)
    try {
      const text = await file.text()
      setContent(text)
      setFileName(file.name)
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
      const pick = (key: string) => {
        const match = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(frontmatter?.[1] ?? '')
        return match?.[1]?.replace(/^["']|["']$/g, '').trim()
      }
      const metaName = pick('name')
      const metaDescription = pick('description')
      if (metaName && !name.trim()) setName(metaName)
      if (!metaName && !name.trim()) setName(file.name.replace(/\.md$/i, ''))
      if (metaDescription && !description.trim()) setDescription(metaDescription)
      if (!metaDescription && !description.trim()) {
        const paragraph = text
          .replace(/^---[\s\S]*?---/, '')
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line && !line.startsWith('#'))
        if (paragraph) setDescription(paragraph.slice(0, 300))
      }
      const metaVersion = pick('version')
      if (metaVersion) setVersion(metaVersion)
    } catch {
      notify('读取文件失败', { tone: 'danger' })
    } finally {
      setReading(false)
    }
  }

  const handleCreate = () => {
    if (!name.trim()) {
      notify('请填写技能名称。', { tone: 'warning' })
      return
    }
    if (!description.trim() && !content.trim()) {
      notify('请填写能力说明，或上传 / 粘贴 SKILL.md 正文。', { tone: 'warning' })
      return
    }
    if (existing.some((skill) => skill.name === name.trim())) {
      notify('已存在同名技能', { description: '换一个名字，避免助理与审计记录混淆。', tone: 'warning' })
      return
    }
    const id = createSkill({
      name,
      description: description.trim() || content.slice(0, 300),
      category,
      source,
      version,
      risk,
      permissions,
      content,
      sourceUrl: undefined,
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
          title="添加自定义技能"
          description="新建或导入的技能会先进入待审核队列，审核通过后才能绑定给助理。"
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

          <Field
            label="能力说明"
            required
            htmlFor="skill-desc"
            hint={`${description.length} 字 · 会显示在技能列表里`}
          >
            <Textarea
              id="skill-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="它能做什么、输入输出是什么、什么时候不该用。"
            />
          </Field>

          <Field
            label="SKILL.md 正文"
            hint={fileName ? `${fileName} · ${content.length} 字` : '可以上传 .md 文件，也可以直接粘贴'}
          >
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-strong bg-raised px-3 py-2 text-[11.5px] text-muted hover:border-accent">
                {reading ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />}
                <span className="truncate">
                  {fileName || (reading ? '正在读取…' : '选择 SKILL.md 文件（自动提取名称与说明）')}
                </span>
                <input
                  type="file"
                  accept=".md,.markdown,.txt"
                  className="hidden"
                  onChange={(event) => void readFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <Textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                className="min-h-[180px] font-mono text-[11.5px] leading-5"
                placeholder={'---\nname: meeting-notes\ndescription: 把会议记录整理成摘要、决议和行动项\n---\n\n# 会议纪要\n\n## 工作流\n1. …'}
              />
            </div>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="分类" htmlFor="skill-category">
              <Select id="skill-category" value={category} onChange={(event) => setCategory(event.target.value)}>
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
                <option value="imported">从技能源导入</option>
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
                    risk === key ? 'border-accent-line bg-accent-soft' : 'border-line bg-surface hover:bg-raised',
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
                        event.target.checked ? [...prev, permission] : prev.filter((item) => item !== permission),
                      )
                    }
                  />
                  {permission}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-raised px-3 py-2.5 text-[10.5px] leading-4 text-muted">
            当前版本不会加载技能代码。接入执行型技能时，需要签名校验、权限审查与资源配额，并在隔离运行域执行；来源与版本会写入审计记录。
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
  onUpdate,
}: {
  skill: Skill | null
  onClose: () => void
  onOpenAgent: (id: string) => void
  onRequestAction: (type: 'reject' | 'disable' | 'delete', skill: Skill) => void
  onUpdate: ReturnType<typeof useStore>['updateSkill']
}) {
  const { state, setSkillStatus } = useStore()
  const [ack, setAck] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

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
        <DialogHeader title={skill.name} description={`${skill.category} · ${skill.sourceLabel}`} />
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

          {skill.sourceUrl && (
            <p className="text-[10.5px] text-faint">
              来源：
              <a href={skill.sourceUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                {skill.sourceUrl}
              </a>
            </p>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                <FileText size={13} /> SKILL.md
              </h3>
              <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
                <Pencil size={12} /> 编辑
              </Button>
            </div>
            {skill.content ? (
              <pre className="max-h-[280px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-raised px-3 py-2.5 font-sans text-[11.5px] leading-5 text-ink-soft">
                {skill.content}
              </pre>
            ) : (
              <p className="rounded-lg bg-raised px-3 py-2.5 text-[11.5px] text-faint">
                还没有正文，点「编辑」上传或粘贴 SKILL.md。
              </p>
            )}
          </section>

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
      {editOpen && <EditSkillDialog skill={skill} onClose={() => setEditOpen(false)} onSave={onUpdate} />}
    </Dialog>
  )
}

function EditSkillDialog({
  skill,
  onClose,
  onSave,
}: {
  skill: Skill
  onClose: () => void
  onSave: ReturnType<typeof useStore>['updateSkill']
}) {
  const [name, setName] = useState(skill.name)
  const [description, setDescription] = useState(skill.description)
  const [category, setCategory] = useState(skill.category)
  const [version, setVersion] = useState(skill.version)
  const [risk, setRisk] = useState<Risk>(skill.risk)
  const [permissions, setPermissions] = useState<string[]>(skill.permissions)
  const [content, setContent] = useState(skill.content ?? '')

  const save = () => {
    if (!name.trim()) return
    onSave(skill.id, {
      name: name.trim(),
      description: description.trim(),
      category,
      version: version.trim() || skill.version,
      risk,
      permissions,
      content,
    })
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader title={`编辑 · ${skill.name}`} icon={Pencil} />
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
            <Field label="名称" required htmlFor="edit-skill-name">
              <Input id="edit-skill-name" value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="版本" htmlFor="edit-skill-version">
              <Input id="edit-skill-version" value={version} onChange={(event) => setVersion(event.target.value)} />
            </Field>
          </div>
          <Field label="能力说明" htmlFor="edit-skill-desc" hint={`${description.length} 字`}>
            <Textarea
              id="edit-skill-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-[80px]"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="分类" htmlFor="edit-skill-category">
              <Select id="edit-skill-category" value={category} onChange={(event) => setCategory(event.target.value)}>
                {SKILL_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="风险等级" htmlFor="edit-skill-risk">
              <Select
                id="edit-skill-risk"
                value={risk}
                onChange={(event) => setRisk(event.target.value as Risk)}
              >
                <option value="low">低风险</option>
                <option value="medium">需留意</option>
                <option value="high">高风险</option>
              </Select>
            </Field>
          </div>
          <Field label="SKILL.md 正文" hint={`${content.length} 字`}>
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-[220px] font-mono text-[11.5px] leading-5"
            />
          </Field>
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
                        event.target.checked ? [...prev, permission] : prev.filter((item) => item !== permission),
                      )
                    }
                  />
                  {permission}
                </label>
              ))}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={save} disabled={!name.trim()}>
            <Check size={13} /> 保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
