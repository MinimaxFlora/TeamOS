import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  MessagesSquare,
  Server,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Logo } from '../components/brand/Logo'
import { Field, Input, Select } from '../components/ui/input'
import { DEPARTMENTS } from '../lib/seed'
import { useStore } from '../lib/store'
import { cn } from '../lib/utils'

const inputClass =
  'h-11 rounded-xl border-[#dfe3ec] bg-white pl-10 text-[13.5px] shadow-none hover:border-[#c9cfdd] focus:border-[#5b5bd6] focus:ring-[3px] focus:ring-[#5b5bd6]/12'

export function LoginPage() {
  const { currentUser, login, register, setupRequired } = useStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [reg, setReg] = useState({
    name: '',
    email: '',
    jobTitle: '',
    department: '产品部',
    password: '',
    confirmPassword: '',
    companyName: '',
  })

  if (currentUser) return <Navigate to="/workspace/chat" replace />

  const mode = setupRequired ? 'register' : tab

  const switchTab = (next: 'login' | 'register') => {
    setTab(next)
    setError('')
  }

  const handleLogin = async () => {
    setError('')
    if (!email.trim()) {
      setError('请输入公司邮箱。')
      return
    }
    if (!password) {
      setError('请输入密码。')
      return
    }
    setSubmitting(true)
    try {
      const result = await login(email, password)
      if (!result.ok) {
        setError(result.error ?? '登录失败，请检查邮箱和密码。')
        return
      }
      navigate('/workspace/chat', { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegister = async () => {
    setError('')
    if (!reg.name.trim() || !reg.email.trim() || !reg.jobTitle.trim()) {
      setError('请填写姓名、邮箱和岗位名称。')
      return
    }
    if (setupRequired && !reg.companyName.trim()) {
      setError('请填写公司名称。')
      return
    }
    if (reg.password.length < 8) {
      setError('密码至少 8 位。')
      return
    }
    if (reg.password !== reg.confirmPassword) {
      setError('两次输入的密码不一致。')
      return
    }
    setSubmitting(true)
    try {
      const result = await register({
        name: reg.name,
        email: reg.email,
        password: reg.password,
        jobTitle: reg.jobTitle,
        department: reg.department,
        companyName: setupRequired ? reg.companyName : undefined,
      })
      if (!result.ok) {
        setError(result.error ?? '注册失败，请检查填写内容。')
        return
      }
      navigate('/workspace/chat', { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-dvh bg-[#f7f8fc] lg:grid-cols-[minmax(0,1.02fr)_minmax(520px,0.98fr)]">
      <aside className="relative hidden min-h-dvh flex-col overflow-hidden bg-[#0c1020] p-10 text-white lg:flex xl:p-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(70% 58% at 18% 8%, rgba(99,102,241,0.34) 0%, transparent 60%), radial-gradient(55% 45% at 88% 82%, rgba(139,92,246,0.26) 0%, transparent 60%), radial-gradient(45% 35% at 70% 18%, rgba(56,189,248,0.12) 0%, transparent 65%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.18) 1px, transparent 1px)',
            backgroundSize: '52px 52px',
            maskImage: 'radial-gradient(ellipse at 35% 25%, black 0%, transparent 72%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 top-[36%] h-72 w-72 rounded-full bg-[#4f46e5]/25 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <Logo size={40} className="ring-1 ring-white/20" />
          <div>
            <div className="text-[20px] font-semibold tracking-[-0.02em]">TeamOS</div>
            <div className="text-[11px] tracking-[0.14em] text-white/45">企业 AI 工作台</div>
          </div>
          <span className="ml-2 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[10.5px] text-white/70">
            私有部署
          </span>
        </div>

        <div className="relative my-auto max-w-[540px] py-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-[11px] text-white/70 backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300" />
            </span>
            每家公司一套，部署在自己的 VPS
          </div>

          <h1 className="mt-6 text-balance text-[38px] font-semibold leading-[1.18] tracking-[-0.03em] xl:text-[46px]">
            一家公司，
            <br />
            <span className="bg-gradient-to-r from-[#c7d2fe] via-white to-[#ddd6fe] bg-clip-text text-transparent">
              一个 AI 助理团队。
            </span>
          </h1>
          <p className="mt-4 max-w-[450px] text-[14px] leading-7 text-white/55">
            所有同事在同一个公司大厅里协作，@ 任意助理干活。对话变长时把上下文压缩成记忆、
            开启新会话，把 token 花在真正有用的上下文上。
          </p>

          <div className="mt-8 rounded-2xl border border-white/[0.12] bg-white/[0.055] p-3 shadow-[0_24px_80px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl">
            <div className="flex items-center gap-2 px-1.5 pb-2.5">
              <span className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-white/15" />
                <span className="h-2 w-2 rounded-full bg-white/15" />
                <span className="h-2 w-2 rounded-full bg-white/15" />
              </span>
              <span className="ml-1 text-[11.5px] font-medium text-white/80">公司大厅</span>
              <span className="rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[9px] text-emerald-200/90">
                全员
              </span>
              <span className="ml-auto text-[9.5px] text-white/35">上下文 68% · 记忆已同步</span>
            </div>

            <div className="rounded-xl bg-[#080b16]/60 p-3">
              <div className="flex justify-end">
                <div className="max-w-[86%] rounded-2xl rounded-br-md bg-gradient-to-br from-[#6366f1] to-[#7c3aed] px-3.5 py-2.5 text-[11.5px] leading-5 text-white shadow-lg shadow-indigo-950/40">
                  <span className="mb-0.5 block text-[9.5px] text-white/65">周舟 · 销售经理</span>
                  把本周客户反馈整理成周报，标出需要我跟进的三件事。
                </div>
              </div>

              <div className="mt-3 flex items-start gap-2.5">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#a78bfa] to-[#6366f1] text-[10px] font-semibold text-white">
                  川
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-white/85">小川</span>
                    <span className="text-[9.5px] text-white/35">产品助理 · v2.3</span>
                  </div>
                  <div className="mt-1 rounded-xl rounded-tl-md border border-white/[0.07] bg-white/[0.055] px-3 py-2 text-[11px] leading-5 text-white/70">
                    已汇总 12 条反馈，整理成 3 个优先级。报价审批与交付排期需要你确认，
                    文档已放进共享文件。
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {['读取 6 个文件', '生成周报.docx', '引用 2 条知识'].map((chip) => (
                      <span
                        key={chip}
                        className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-white/45"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1.5 border-t border-white/[0.07] pt-2.5 text-[9.5px] text-white/35">
                <Brain size={10} className="text-[#a5b4fc]" />
                归档时保留 4 条记忆，原始消息不再重复计费
                <span className="ml-auto inline-flex items-center gap-1 text-emerald-200/70">
                  <CheckCircle2 size={10} /> 可追踪
                </span>
              </div>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-white/45">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-white/60" /> 管理员不可见私有对话
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Server size={13} className="text-white/60" /> 数据不出公司服务器
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles size={13} className="text-white/60" /> 技能按岗授权
            </span>
          </div>
        </div>

        <div className="relative flex items-center justify-between text-[10.5px] text-white/30">
          <span>© 2026 TeamOS · 企业私有化 AI 工作台</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/80" />
            私有部署 · 数据加密存储
          </span>
        </div>
      </aside>

      <main className="relative flex min-h-dvh flex-col px-5 py-6 sm:px-10 lg:px-12 xl:px-16">
        <div className="flex items-center justify-between lg:justify-end">
          <div className="flex items-center gap-2.5 lg:hidden">
            <Logo size={34} />
            <div>
              <div className="text-[16px] font-semibold leading-5 text-ink">TeamOS</div>
              <div className="text-[9.5px] tracking-wide text-faint">企业 AI 工作台</div>
            </div>
          </div>
          <div className="hidden items-center gap-1.5 text-[11px] text-muted sm:flex">
            <ShieldCheck size={13} className="text-success" />
            安全登录 · 数据留在公司服务器
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-center py-8">
          <div className="mb-7 lg:hidden">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 text-[10.5px] text-accent-strong">
              <Sparkles size={11} /> 每家公司一套私有 AI 助理
            </div>
          </div>

          <div>
            <h2 className="text-[27px] font-semibold tracking-[-0.025em] text-ink">
              {setupRequired ? '初始化你的公司' : mode === 'login' ? '欢迎回来' : '加入你的公司'}
            </h2>
            <p className="mt-1.5 text-[13px] leading-5 text-muted">
              {setupRequired
                ? '这是全新实例。首位注册者将成为公司管理员，之后可在设置里配置大模型。'
                : mode === 'login'
                  ? '登录后进入公司大厅，和同事、AI 助理一起工作。'
                  : '注册后自动加入公司大厅，并可以设置自己的岗位名称。'}
            </p>
          </div>

          {!setupRequired && (
            <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-[#e6e9f0] bg-[#eef1f6] p-1">
              {[
                { key: 'login' as const, label: '登录' },
                { key: 'register' as const, label: '员工注册' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => switchTab(item.key)}
                  aria-pressed={tab === item.key}
                  className={cn(
                    'h-9 rounded-lg text-[12.5px] font-medium transition-all',
                    tab === item.key
                      ? 'bg-white text-ink shadow-[0_1px_3px_rgba(16,24,40,0.10)]'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {mode === 'login' ? (
            <div className="mt-6 space-y-4">
              <Field label="公司邮箱" htmlFor="login-email">
                <div className="relative">
                  <Mail
                    size={15}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9aa3b5]"
                  />
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleLogin()
                    }}
                    className={inputClass}
                  />
                </div>
              </Field>

              <Field label="密码" htmlFor="login-password">
                <div className="relative">
                  <KeyRound
                    size={15}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9aa3b5]"
                  />
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleLogin()
                    }}
                    className={cn(inputClass, 'pr-10')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    className="absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#9aa3b5] transition-colors hover:bg-[#f1f3f8] hover:text-ink"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </Field>

              <div className="flex items-center justify-between">
                <span className="text-[10.5px] text-faint">密码由公司管理员管理</span>
                <span className="text-[11px] text-muted">忘记密码请联系管理员重置</span>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-danger/20 bg-danger-soft px-3 py-2.5 text-[11.5px] leading-5 text-danger"
                >
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleLogin()}
                disabled={submitting}
                className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5b5bd6] to-[#7c3aed] text-[13.5px] font-medium text-white shadow-[0_8px_24px_-8px_rgba(79,70,229,0.7)] transition-all hover:brightness-105 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    正在登录…
                  </>
                ) : (
                  <>
                    登录并进入大厅
                    <ArrowRight
                      size={15}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {setupRequired && (
                <Field label="公司名称" required htmlFor="reg-company" hint="会显示在管理后台">
                  <Input
                    id="reg-company"
                    placeholder="例如：星野科技"
                    value={reg.companyName}
                    onChange={(event) => setReg({ ...reg, companyName: event.target.value })}
                    maxLength={40}
                    className="h-11 rounded-xl border-[#dfe3ec] bg-white text-[13.5px] shadow-none hover:border-[#c9cfdd] focus:border-[#5b5bd6] focus:ring-[3px] focus:ring-[#5b5bd6]/12"
                  />
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="姓名" required htmlFor="reg-name">
                  <Input
                    id="reg-name"
                    placeholder="你的姓名"
                    value={reg.name}
                    onChange={(event) => setReg({ ...reg, name: event.target.value })}
                    maxLength={20}
                    className="h-11 rounded-xl border-[#dfe3ec] bg-white text-[13.5px] shadow-none hover:border-[#c9cfdd] focus:border-[#5b5bd6] focus:ring-[3px] focus:ring-[#5b5bd6]/12"
                  />
                </Field>
                <Field label="岗位名称" required htmlFor="reg-job">
                  <Input
                    id="reg-job"
                    placeholder="例如：销售经理"
                    value={reg.jobTitle}
                    onChange={(event) => setReg({ ...reg, jobTitle: event.target.value })}
                    maxLength={20}
                    className="h-11 rounded-xl border-[#dfe3ec] bg-white text-[13.5px] shadow-none hover:border-[#c9cfdd] focus:border-[#5b5bd6] focus:ring-[3px] focus:ring-[#5b5bd6]/12"
                  />
                </Field>
              </div>

              <Field label="公司邮箱" required htmlFor="reg-email">
                <div className="relative">
                  <Mail
                    size={15}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9aa3b5]"
                  />
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="name@company.com"
                    value={reg.email}
                    onChange={(event) => setReg({ ...reg, email: event.target.value })}
                    className={inputClass}
                  />
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="所属部门" htmlFor="reg-dept">
                  <Select
                    id="reg-dept"
                    value={reg.department}
                    onChange={(event) => setReg({ ...reg, department: event.target.value })}
                    className="h-11 rounded-xl border-[#dfe3ec] bg-white text-[13px] shadow-none hover:border-[#c9cfdd] focus:border-[#5b5bd6] focus:ring-[3px] focus:ring-[#5b5bd6]/12"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="设置密码" required htmlFor="reg-password" hint="至少 8 位">
                  <Input
                    id="reg-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="至少 8 位"
                    value={reg.password}
                    onChange={(event) => setReg({ ...reg, password: event.target.value })}
                    className="h-11 rounded-xl border-[#dfe3ec] bg-white text-[13.5px] shadow-none hover:border-[#c9cfdd] focus:border-[#5b5bd6] focus:ring-[3px] focus:ring-[#5b5bd6]/12"
                  />
                </Field>
              </div>

              <Field label="确认密码" required htmlFor="reg-password-confirm">
                <Input
                  id="reg-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="再次输入密码"
                  value={reg.confirmPassword}
                  onChange={(event) => setReg({ ...reg, confirmPassword: event.target.value })}
                  className="h-11 rounded-xl border-[#dfe3ec] bg-white text-[13.5px] shadow-none hover:border-[#c9cfdd] focus:border-[#5b5bd6] focus:ring-[3px] focus:ring-[#5b5bd6]/12"
                />
              </Field>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-danger/20 bg-danger-soft px-3 py-2.5 text-[11.5px] leading-5 text-danger"
                >
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleRegister()}
                disabled={submitting}
                className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5b5bd6] to-[#7c3aed] text-[13.5px] font-medium text-white shadow-[0_8px_24px_-8px_rgba(79,70,229,0.7)] transition-all hover:brightness-105 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    正在创建账号…
                  </>
                ) : (
                  <>
                    {setupRequired ? '创建管理员并进入' : '注册并进入公司大厅'}
                    <ArrowRight
                      size={15}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  </>
                )}
              </button>

              <div className="flex items-start gap-2 rounded-xl border border-[#e4e8f0] bg-white/70 px-3 py-2.5 text-[10.5px] leading-4 text-muted">
                <MessagesSquare size={13} className="mt-0.5 shrink-0 text-[#5b5bd6]" />
                {setupRequired
                  ? '首位注册者拥有管理员权限，可配置大模型、成员与知识库。注册完成后，其他同事可在登录页自助注册。'
                  : '注册后自动加入公司大厅，不需要逐个拉群。岗位名称会展示给同事，也可以稍后在个人资料里修改。'}
              </div>
            </div>
          )}

          <p className="mt-7 text-center text-[10.5px] leading-5 text-faint">
            继续即表示你同意公司的数据与安全规范。TeamOS 不会把消息或文件发到公司之外。
          </p>
        </div>

        <div className="mx-auto flex w-full max-w-[430px] items-center justify-center gap-4 text-[10px] text-faint">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck size={11} /> 私有部署
          </span>
          <span className="inline-flex items-center gap-1">
            <Server size={11} /> 数据留在本机
          </span>
        </div>
      </main>
    </div>
  )
}
