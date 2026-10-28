import {
  Building2,
  CheckCircle2,
  Cpu,
  Download,
  HardDrive,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  Server,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, describeError, type GatewayStatus, type ModelConfig } from '../../lib/api'
import { useStore } from '../../lib/store'
import { formatDate, formatRelative } from '../../lib/format'
import { PageBody, PageHeader } from '../../components/layout/PageHeader'
import { Logo } from '../../components/brand/Logo'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Field, Input, Select } from '../../components/ui/input'

const TIMEZONES = [
  '(UTC+08:00) 中国标准时间',
  '(UTC+09:00) 日本标准时间',
  '(UTC+00:00) 协调世界时',
  '(UTC-08:00) 太平洋时间',
]

const SECURITY_ITEMS: {
  title: string
  detail: string
  status: 'prototype' | 'production' | 'planned'
}[] = [
  {
    title: '管理员后台守卫',
    detail: '服务端对每个 /api 请求校验会话 Cookie 与管理员权限，前端路由守卫只是第二道防线。',
    status: 'production',
  },
  {
    title: '租户隔离',
    detail: '每家公司独立 VPS、SQLite 数据库与数据卷；实例之间没有共享存储或跨租户读取。',
    status: 'production',
  },
  {
    title: '邀请与成员状态',
    detail: '创建账号时生成一次性临时密码；成员首次登录后自动加入公司大厅，并可随时修改自己的密码。',
    status: 'production',
  },
  {
    title: '凭据管理',
    detail: '模型 Key 与渠道密钥使用 AES-256-GCM 加密存储，接口只返回末四位提示，不进入前端状态或日志。',
    status: 'production',
  },
  {
    title: '高风险工具审批',
    detail: '执行服务器命令、主动外发消息等高风险工具默认关闭；上线前仍需补齐显式审批与运行域隔离。',
    status: 'planned',
  },
  {
    title: 'Webhook 签名校验',
    detail: '企业微信、飞书、钉钉、Slack 与通用回调校验签名与时间戳，事件按 ID 去重并加密留存。',
    status: 'production',
  },
]

export function AdminSettingsPage() {
  const { state, updateCompany, notify } = useStore()
  const [form, setForm] = useState({
    name: state.company.name,
    shortName: state.company.shortName,
    adminEmail: state.company.adminEmail,
    timezone: state.company.timezone,
  })
  const [error, setError] = useState('')

  useEffect(() => {
    setForm({
      name: state.company.name,
      shortName: state.company.shortName,
      adminEmail: state.company.adminEmail,
      timezone: state.company.timezone,
    })
  }, [state.company.name, state.company.shortName, state.company.adminEmail, state.company.timezone])

  const dirty =
    form.name !== state.company.name ||
    form.shortName !== state.company.shortName ||
    form.adminEmail !== state.company.adminEmail ||
    form.timezone !== state.company.timezone

  const attachmentCount = state.messages.reduce(
    (sum, message) => sum + (message.attachments?.length ?? 0),
    0,
  )

  const save = () => {
    setError('')
    if (!form.name.trim()) {
      setError('公司名称不能为空。')
      return
    }
    if (!form.shortName.trim() || form.shortName.trim().length > 4) {
      setError('公司简称需要 1–4 个字符。')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail.trim())) {
      setError('管理员邮箱格式不正确。')
      return
    }
    updateCompany({
      name: form.name.trim(),
      shortName: form.shortName.trim(),
      adminEmail: form.adminEmail.trim(),
      timezone: form.timezone,
    })
    setError('')
  }

  const exportData = () => {
    const payload = JSON.stringify(state, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `teamos-export-${formatDate(new Date().toISOString())}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    notify('当前数据已导出', {
      description: '导出内容来自你当前账号可见的服务器状态，不含模型或渠道密钥；正式备份请使用 make backup。',
      tone: 'success',
    })
  }

  return (
    <PageBody className="max-w-[1100px]">
      <PageHeader
        eyebrow="管理后台 · 设置"
        title="公司设置"
        description="公司资料、品牌与部署信息。TeamOS 按公司实例独立部署，这些内容不会与其他客户共享。"
        actions={
          <Button size="sm" variant="primary" onClick={save} disabled={!dirty}>
            保存公司资料
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <ModelSettingsCard />

          <section className="rounded-xl border border-line bg-surface shadow-card">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <Building2 size={14} className="text-muted" />
              <div>
                <h2 className="text-sm font-semibold text-ink">公司资料</h2>
                <p className="mt-0.5 text-[11px] text-muted">会出现在侧边栏、邀请与审计记录里。</p>
              </div>
            </div>
            <div className="space-y-4 px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="公司名称" required htmlFor="company-name">
                  <Input
                    id="company-name"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    maxLength={30}
                  />
                </Field>
                <Field label="公司简称" required htmlFor="company-short" hint="1–4 个字符">
                  <Input
                    id="company-short"
                    value={form.shortName}
                    onChange={(event) => setForm({ ...form, shortName: event.target.value })}
                    maxLength={4}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="管理员邮箱"
                  required
                  htmlFor="company-email"
                  hint="用于系统通知"
                >
                  <Input
                    id="company-email"
                    type="email"
                    value={form.adminEmail}
                    onChange={(event) => setForm({ ...form, adminEmail: event.target.value })}
                  />
                </Field>
                <Field label="公司时区" htmlFor="company-tz">
                  <Select
                    id="company-tz"
                    value={form.timezone}
                    onChange={(event) => setForm({ ...form, timezone: event.target.value })}
                  >
                    {TIMEZONES.map((timezone) => (
                      <option key={timezone} value={timezone}>
                        {timezone}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {error && (
                <div className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-xs leading-5 text-danger">
                  {error}
                </div>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                <p className="text-[10.5px] text-faint">
                  {dirty ? '有未保存的修改。' : '所有修改已保存。'}
                </p>
                <Button size="sm" variant="primary" onClick={save} disabled={!dirty}>
                  保存
                </Button>
              </div>
            </div>
          </section>

          <section
            id="deployment"
            className="scroll-mt-6 rounded-xl border border-line bg-surface shadow-card"
          >
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <Server size={14} className="text-muted" />
              <div>
                <h2 className="text-sm font-semibold text-ink">部署与数据</h2>
                <p className="mt-0.5 text-[11px] text-muted">TeamOS 与 Hermes 运行在同一个私有实例中，数据只写入本机数据卷。</p>
              </div>
            </div>
            <div className="space-y-4 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-success/20 bg-success-soft px-3 py-2.5">
                <ShieldCheck size={13} className="shrink-0 text-success" />
                <div className="min-w-0 flex-1 text-[11px] leading-5 text-success">
                  <span className="font-medium">私有部署运行中。</span>
                  会话、成员、知识与审计写入 SQLite；模型调用经服务端转发，浏览器不持有模型 Key。
                </div>
                <Badge tone="success">Production</Badge>
              </div>

              <dl className="grid gap-3 sm:grid-cols-2">
                {[
                  ['部署规格', state.company.deployment],
                  ['版本计划', state.company.plan],
                  ['公司创建', `${formatDate(state.company.createdAt)}（${formatRelative(state.company.createdAt)}）`],
                  ['数据位置', '服务端 SQLite · Docker 数据卷'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-line bg-raised px-3 py-2.5">
                    <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
                      {label}
                    </dt>
                    <dd className="mt-1 text-[11.5px] leading-4 text-ink-soft">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="rounded-lg border border-line px-3 py-2.5">
                <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
                  <HardDrive size={13} /> 当前实例数据
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10.5px] text-muted sm:grid-cols-4">
                  {[
                    ['成员', state.members.length],
                    ['助理', state.agents.length],
                    ['会话', state.sessions.length],
                    ['消息', state.messages.length],
                    ['附件占位', attachmentCount],
                    ['技能', state.skills.length],
                    ['运行', state.runs.length],
                    ['审计', state.audit.length],
                    ['知识文档', state.knowledgeDocs.length],
                    ['会议纪要', state.meetings.length],
                    ['渠道接入', state.connectors.length],
                    ['知识空间', state.knowledge.length],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-2 rounded-md bg-raised px-2 py-1.5">
                      <span>{label}</span>
                      <span className="tabular font-medium text-ink-soft">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="max-w-[420px] text-[10.5px] leading-4 text-faint">
                  导出的 JSON 包含你可见的消息文本与成员资料，不含密钥；整库备份请运行 <code className="rounded bg-raised px-1">make backup</code>。
                </p>
                <Button size="sm" variant="secondary" onClick={exportData}>
                  <Download size={13} /> 导出当前数据
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-surface shadow-card">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <ShieldCheck size={14} className="text-muted" />
              <div>
                <h2 className="text-sm font-semibold text-ink">安全基线</h2>
                <p className="mt-0.5 text-[11px] text-muted">当前实例已经生效的安全措施与仍需人工确认的边界。</p>
              </div>
            </div>
            <ul className="divide-y divide-line">
              {SECURITY_ITEMS.map((item) => {
                const tone =
                  item.status === 'prototype'
                    ? { label: '已生效', badge: 'success' as const, icon: CheckCircle2, color: 'text-success' }
                    : item.status === 'production'
                      ? { label: '已生效', badge: 'success' as const, icon: Lock, color: 'text-success' }
                      : { label: '待建设', badge: 'neutral' as const, icon: CheckCircle2, color: 'text-faint' }
                const Icon = tone.icon
                return (
                  <li key={item.title} className="flex items-start gap-2.5 px-4 py-3">
                    <Icon size={14} className={`mt-0.5 shrink-0 ${tone.color}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11.5px] font-medium text-ink">{item.title}</span>
                        <Badge tone={tone.badge}>{tone.label}</Badge>
                      </div>
                      <p className="mt-0.5 text-[10.5px] leading-4 text-muted">{item.detail}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>

        </div>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-xl border border-line bg-surface shadow-card">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">品牌标识</h2>
            </div>
            <div className="px-4 py-4">
              <div className="flex items-center gap-3 rounded-lg border border-line bg-raised px-3 py-3">
                <Logo size={44} />
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold tracking-[-0.01em] text-ink">TeamOS</div>
                  <div className="text-[10.5px] text-muted">企业 AI 工作台</div>
                </div>
              </div>
              <p className="mt-2.5 text-[10.5px] leading-5 text-faint">
                当前使用部署方提供的 TeamOS 图标与产品名。公司名称与简称会显示在侧边栏。
              </p>
              <div className="mt-2.5 rounded-md border border-line bg-surface px-2.5 py-2 text-[10px] leading-4 text-faint">
                自定义品牌图标需在构建时替换资源，避免通过前端上传脚本或 SVG 带来的安全风险。
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-surface shadow-card">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">实例信息</h2>
            </div>
            <dl className="space-y-2.5 px-4 py-3.5 text-[11px]">
              {[
                ['公司', state.company.name],
                ['简称', state.company.shortName],
                ['管理员邮箱', state.company.adminEmail],
                ['时区', state.company.timezone],
                ['数据位置', '服务器 SQLite'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 text-faint">{label}</dt>
                  <dd className="break-all text-right text-ink-soft">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border border-line bg-raised px-4 py-3.5">
            <div className="flex items-start gap-2">
              <Lock size={13} className="mt-0.5 shrink-0 text-muted" />
              <p className="text-[10.5px] leading-5 text-muted">
                正式部署时，每个客户实例使用独立密钥与数据库；TeamOS 不会跨实例读取成员、消息或知识。
              </p>
            </div>
          </section>
        </aside>
      </div>
    </PageBody>
  )
}

const PROVIDER_PRESETS = [
  { id: 'deepseek', label: 'DeepSeek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'openai', label: 'OpenAI', model: 'gpt-4.1-mini', baseUrl: 'https://api.openai.com/v1' },
  { id: 'anthropic', label: 'Anthropic', model: 'claude-sonnet-5-5', baseUrl: '' },
  { id: 'google', label: 'Google Gemini', model: 'gemini-2.5-flash', baseUrl: '' },
  { id: 'openrouter', label: 'OpenRouter', model: '', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'custom', label: '自定义（OpenAI 兼容）', model: '', baseUrl: '' },
]

function gatewayTone(status?: string): { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' } {
  // 服务端把健康检查通过记为 ready，早期 UI 只认 running，才出现了「Hermes 未启动」的误报。
  if (status === 'ready' || status === 'running') return { label: 'Hermes 已就绪', tone: 'success' }
  if (status === 'starting') return { label: 'Hermes 启动中', tone: 'warning' }
  if (status === 'error' || status === 'failed' || status === 'unavailable') {
    return { label: 'Hermes 异常', tone: 'danger' }
  }
  if (status === 'disabled') return { label: 'Hermes 未启用', tone: 'neutral' }
  return { label: 'Hermes 未启动', tone: 'neutral' }
}

function ModelSettingsCard() {
  const { notify } = useStore()
  const [config, setConfig] = useState<ModelConfig | null>(null)
  const [gateway, setGateway] = useState<GatewayStatus | null>(null)
  const [form, setForm] = useState({ provider: 'deepseek', model: '', baseUrl: '', apiKey: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [testResult, setTestResult] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [manualModel, setManualModel] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)

  const fetchModels = async (formOverride = form, forceManual = false) => {
    if (forceManual) {
      setManualModel(true)
      return
    }
    setError('')
    setLoadingModels(true)
    try {
      const result = await api.modelCatalog({
        provider: formOverride.provider,
        baseUrl: formOverride.baseUrl.trim(),
        apiKey: formOverride.apiKey.trim(),
      })
      setModels(result.models)
      setManualModel(false)
      if (result.models.length && !result.models.includes(formOverride.model)) {
        setForm((prev) => ({ ...prev, model: result.models[0] }))
      }
      if (!result.models.length) {
        setError('服务商没有返回可用模型，请手动填写模型名称。')
        setManualModel(true)
      }
    } catch (reason) {
      setError(describeError(reason))
      setManualModel(true)
    } finally {
      setLoadingModels(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    api
      .getModel()
      .then((model) => {
        if (cancelled) return
        setConfig(model)
        setGateway(model.hermes ?? null)
        const provider = model.provider || 'deepseek'
        const preset = PROVIDER_PRESETS.find((item) => item.id === provider)
        setForm({
          provider,
          model: model.model || preset?.model || '',
          baseUrl: model.baseUrl || '',
          apiKey: '',
        })
        // 已经存过密钥时，直接把服务商返回的模型列表准备好，管理员只需要下拉选择。
        if (model.keySet) {
          api
            .modelCatalog({ provider, baseUrl: model.baseUrl || '', apiKey: '' })
            .then((result) => {
              if (cancelled || !result.models.length) return
              setModels(result.models)
              setManualModel(false)
            })
            .catch(() => {
              // 拉取失败时保留手动填写，不影响保存已选模型。
            })
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(describeError(reason))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const chooseProvider = (provider: string) => {
    const preset = PROVIDER_PRESETS.find((item) => item.id === provider)
    setForm({
      provider,
      model: preset?.model ?? '',
      baseUrl: preset?.baseUrl ?? '',
      apiKey: form.apiKey,
    })
    setModels([])
    setManualModel(false)
    setTestResult('')
  }

  const save = async () => {
    setError('')
    setTestResult('')
    if (!form.model.trim()) {
      setError('请填写模型名称。')
      return
    }
    if (!config?.keySet && !form.apiKey.trim()) {
      setError('首次配置需要填写 API Key。')
      return
    }
    setSaving(true)
    try {
      const result = await api.saveModel({
        provider: form.provider,
        model: form.model.trim(),
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey.trim(),
      })
      setConfig(result.model)
      setGateway(result.hermes)
      setForm((prev) => ({ ...prev, apiKey: '' }))
      notify('大模型配置已保存', {
        description: 'Hermes 正在按新配置重启；稍后可点击「测试连接」验证。',
        tone: 'success',
      })
    } catch (reason) {
      setError(describeError(reason))
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setError('')
    setTestResult('')
    setTesting(true)
    try {
      const result = await api.testModel()
      setGateway(result.gateway)
      setTestResult(`${result.backend} · ${result.latencyMs}ms · ${result.reply.slice(0, 160)}`)
      notify('模型连接成功', { description: `${result.backend} 返回正常。`, tone: 'success' })
    } catch (reason) {
      setError(describeError(reason))
    } finally {
      setTesting(false)
    }
  }

  const status = gatewayTone(gateway?.status)

  return (
    <section id="model" className="scroll-mt-6 rounded-xl border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <Cpu size={14} className="text-muted" />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            大模型
            {config?.keySet && <Badge tone="success">已配置</Badge>}
          </h2>
          <p className="mt-0.5 text-[11px] text-muted">
            模型只由服务端调用。保存后 Hermes 会重启并接管助理运行。
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <div className="space-y-4 px-4 py-4">
        {loading ? (
          <div className="flex items-center gap-2 text-[11.5px] text-muted">
            <Loader2 size={13} className="animate-spin" /> 正在读取模型配置…
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="服务商" htmlFor="model-provider">
                <Select
                  id="model-provider"
                  value={form.provider}
                  onChange={(event) => chooseProvider(event.target.value)}
                >
                  {PROVIDER_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="模型"
                required
                htmlFor="model-name"
                hint={
                  models.length && !manualModel
                    ? `来自服务商，共 ${models.length} 个`
                    : '先填 API Key，再拉取模型列表'
                }
              >
                <div className="flex gap-2">
                  {models.length && !manualModel ? (
                    <Select
                      id="model-name"
                      value={form.model}
                      onChange={(event) => setForm({ ...form, model: event.target.value })}
                      className="flex-1"
                    >
                      {!models.includes(form.model) && form.model ? (
                        <option value={form.model}>{form.model}（当前）</option>
                      ) : null}
                      {models.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      id="model-name"
                      value={form.model}
                      onChange={(event) => setForm({ ...form, model: event.target.value })}
                      placeholder="deepseek-chat"
                      maxLength={120}
                      className="flex-1"
                    />
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    type="button"
                    onClick={() => void fetchModels(form, false)}
                    disabled={loadingModels}
                  >
                    {loadingModels ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <RefreshCw size={13} />
                    )}
                    {loadingModels ? '拉取中…' : '拉取列表'}
                  </Button>
                </div>
                {models.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setManualModel((value) => !value)}
                    className="mt-1 text-[10.5px] text-accent-strong hover:underline"
                  >
                    {manualModel ? '改回从列表选择' : '列表里没有？手动填写模型名称'}
                  </button>
                )}
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Base URL"
                htmlFor="model-base"
                hint={form.provider === 'custom' ? '必填' : '留空使用服务商默认地址'}
              >
                <Input
                  id="model-base"
                  value={form.baseUrl}
                  onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
                  placeholder="https://api.example.com/v1"
                />
              </Field>
              <Field
                label="API Key"
                required={!config?.keySet}
                htmlFor="model-key"
                hint={config?.keySet ? `已保存 ${config.keyHint}，留空保持不变` : '只写不读'}
              >
                <div className="relative">
                  <KeyRound
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                  />
                  <Input
                    id="model-key"
                    type="password"
                    autoComplete="off"
                    value={form.apiKey}
                    onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                    placeholder={config?.keySet ? config.keyHint : 'sk-…'}
                    className="pl-9"
                  />
                </div>
              </Field>
            </div>

            {error && (
              <div className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-xs leading-5 text-danger">
                {error}
              </div>
            )}
            {testResult && (
              <div className="rounded-lg border border-success/25 bg-success-soft px-3 py-2 text-[11px] leading-5 text-success">
                测试通过：{testResult}
              </div>
            )}
            {gateway?.lastError && (
              <div className="rounded-lg border border-warning/20 bg-warning-soft px-3 py-2 text-[11px] leading-5 text-warning">
                Hermes 最近错误：{gateway.lastError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <p className="max-w-[440px] text-[10.5px] leading-4 text-faint">
                配置加密保存在服务端，接口只返回末四位。切换模型会重启 Hermes 网关，约需数秒。
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void test()}
                  disabled={testing || !config?.keySet}
                >
                  {testing ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Zap size={13} />
                  )}
                  {testing ? '测试中…' : '测试连接'}
                </Button>
                <Button size="sm" variant="primary" onClick={() => void save()} disabled={saving}>
                  {saving ? <Loader2 size={13} className="animate-spin" /> : null}
                  {saving ? '保存中…' : '保存模型配置'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
