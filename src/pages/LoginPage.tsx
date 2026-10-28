import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  MailCheck,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Logo } from '../components/brand/Logo'
import { useStore } from '../lib/store'
import { cn } from '../lib/utils'

const inputClass =
  'h-11 rounded-lg border-[#dfe3ec] bg-white pl-9 text-[13.5px] shadow-none hover:border-[#c9cfdd] focus:border-[#4f46e5] focus:ring-[3px] focus:ring-[#4f46e5]/12'

type Tab = 'login' | 'register'

export function LoginPage() {
  const { currentUser, login, register, setupRequired } = useStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('login')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pendingMessage, setPendingMessage] = useState('')

  if (currentUser) return <Navigate to="/workspace/chat" replace />

  // 全新实例只有「创建管理员」一种表单，其余实例是登录 / 员工注册。
  const mode: Tab = setupRequired ? 'register' : tab
  const registering = mode === 'register'

  const switchTab = (next: Tab) => {
    setTab(next)
    setError('')
    setPassword('')
    setConfirmPassword('')
    setAgreed(false)
  }

  const handleLogin = async () => {
    setError('')
    if (!account.trim()) {
      setError('请输入账号。')
      return
    }
    if (!password) {
      setError('请输入密码。')
      return
    }
    setSubmitting(true)
    try {
      const result = await login(account.trim(), password)
      if (!result.ok) {
        setError(result.error ?? '登录失败，请检查账号和密码。')
        return
      }
      navigate('/workspace/chat', { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegister = async () => {
    setError('')
    const value = account.trim()
    if (!value) {
      setError('请输入账号。')
      return
    }
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/i.test(value) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError('账号需为 3-32 位字母、数字、点、下划线或横线，也可以直接填邮箱。')
      return
    }
    if (password.length < 8) {
      setError('密码至少 8 位。')
      return
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致。')
      return
    }
    if (!agreed) {
      setError('请先阅读并勾选同意服务条款。')
      return
    }
    setSubmitting(true)
    try {
      const result = await register({ account: value, password })
      if (result.pending) {
        setPendingMessage(result.message ?? '注册申请已提交，请等待管理员通过。')
        return
      }
      if (!result.ok) {
        setError(result.error ?? '注册失败，请检查填写内容。')
        return
      }
      navigate('/workspace/chat', { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  const submit = () => (registering ? handleRegister() : handleLogin())

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#f3f5f9] px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(58% 46% at 14% 6%, rgba(99,102,241,0.14) 0%, transparent 62%), radial-gradient(50% 42% at 88% 92%, rgba(56,189,248,0.12) 0%, transparent 62%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(15,23,42,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.045) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse at 50% 38%, black 0%, transparent 74%)',
        }}
      />

      <div className="relative w-full max-w-[404px]">
        <div className="mb-5 flex flex-col items-center gap-2.5">
          <Logo size={46} className="ring-1 ring-black/5" />
          <div className="text-center">
            <div className="text-[19px] font-semibold tracking-[-0.02em] text-ink">TeamOS</div>
            <div className="mt-0.5 text-[10.5px] tracking-[0.18em] text-faint">企业 AI 工作台</div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#e3e7ef] bg-white/95 p-7 shadow-[0_24px_70px_-36px_rgba(15,23,42,0.45)] backdrop-blur">
          {pendingMessage ? (
            <div className="py-3 text-center">
              <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
                <MailCheck size={22} />
              </span>
              <h1 className="text-[17px] font-semibold text-ink">注册申请已提交</h1>
              <p className="mt-2 text-[12.5px] leading-6 text-muted">{pendingMessage}</p>
              <p className="mt-1.5 text-[11px] leading-5 text-faint">
                管理员在「成员管理」通过后，你就可以用刚才设置的账号和密码登录。
              </p>
              <button
                type="button"
                onClick={() => {
                  setPendingMessage('')
                  setTab('login')
                  setPassword('')
                  setConfirmPassword('')
                }}
                className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#dfe3ec] text-[12.5px] font-medium text-ink transition-colors hover:bg-[#f6f7fb]"
              >
                返回登录
              </button>
            </div>
          ) : (
            <>
              {!setupRequired && (
                <div className="mb-6 grid grid-cols-2 border-b border-[#eceff5]">
                  {(
                    [
                      { key: 'login' as const, label: '登录' },
                      { key: 'register' as const, label: '员工注册' },
                    ]
                  ).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => switchTab(item.key)}
                      aria-pressed={tab === item.key}
                      className={cn(
                        'relative h-9 text-[13px] font-medium transition-colors',
                        tab === item.key ? 'text-ink' : 'text-muted hover:text-ink',
                      )}
                    >
                      {item.label}
                      {tab === item.key && (
                        <span className="absolute inset-x-6 -bottom-px h-0.5 rounded-full bg-[#4f46e5]" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="mb-5">
                <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
                  {setupRequired ? '创建管理员账号' : registering ? '加入公司' : '登录 TeamOS'}
                </h1>
                <p className="mt-1 text-[11.5px] leading-5 text-muted">
                  {setupRequired
                    ? '这是全新部署。设置好账号密码后即可进入后台配置大模型。'
                    : registering
                      ? '注册后需要管理员审批，通过后才能登录。'
                      : '使用公司管理员分配的账号登录。'}
                </p>
              </div>

              <form
                className="space-y-3.5"
                onSubmit={(event) => {
                  event.preventDefault()
                  void submit()
                }}
              >
                <label className="block">
                  <span className="mb-1.5 block text-[11.5px] font-medium text-ink">
                    {registering ? '账号' : '账号 / 邮箱'}
                  </span>
                  <div className="relative">
                    <UserRound
                      size={14}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa3b5]"
                    />
                    <input
                      type="text"
                      autoComplete="username"
                      spellCheck={false}
                      placeholder={registering ? '3-32 位字母数字，或公司邮箱' : '请输入账号'}
                      value={account}
                      onChange={(event) => setAccount(event.target.value)}
                      className={cn(
                        'w-full outline-none transition',
                        inputClass,
                        'border pr-3 text-ink placeholder:text-[#a9b1c1]',
                      )}
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[11.5px] font-medium text-ink">密码</span>
                  <div className="relative">
                    <Lock
                      size={14}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa3b5]"
                    />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={registering ? 'new-password' : 'current-password'}
                      placeholder={registering ? '至少 8 位' : '请输入密码'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className={cn(
                        'w-full border pr-10 outline-none transition',
                        inputClass,
                        'text-ink placeholder:text-[#a9b1c1]',
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                      className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#9aa3b5] transition-colors hover:bg-[#f1f3f8] hover:text-ink"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </label>

                {registering && (
                  <label className="block">
                    <span className="mb-1.5 block text-[11.5px] font-medium text-ink">
                      再次确认密码
                    </span>
                    <div className="relative">
                      <Lock
                        size={14}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa3b5]"
                      />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="再次输入密码"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        className={cn(
                          'w-full border pr-3 outline-none transition',
                          inputClass,
                          'text-ink placeholder:text-[#a9b1c1]',
                        )}
                      />
                    </div>
                  </label>
                )}

                {registering && (
                  <label className="flex cursor-pointer items-start gap-2 pt-0.5 text-[11px] leading-5 text-muted">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(event) => setAgreed(event.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-[#c9cfdd] text-[#4f46e5] accent-[#4f46e5]"
                    />
                    <span>
                      我已阅读并同意
                      <span className="mx-0.5 text-[#4f46e5]">《服务条款》</span>
                      和
                      <span className="mx-0.5 text-[#4f46e5]">《隐私政策》</span>
                      ，知晓公司管理员可以查看本实例的成员与知识数据。
                    </span>
                  </label>
                )}

                {error && (
                  <div
                    role="alert"
                    className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-[11.5px] leading-5 text-danger"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || (registering && !agreed)}
                  className="group mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#4f46e5] text-[13.5px] font-medium text-white shadow-[0_10px_24px_-12px_rgba(79,70,229,0.9)] transition-all hover:bg-[#4338ca] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      {registering ? '正在提交…' : '正在登录…'}
                    </>
                  ) : (
                    <>
                      {setupRequired ? '创建管理员账号' : registering ? '提交注册申请' : '登录'}
                      <ArrowRight
                        size={15}
                        className="transition-transform group-hover:translate-x-0.5"
                      />
                    </>
                  )}
                </button>
              </form>

              {!registering && (
                <p className="mt-4 text-center text-[10.5px] leading-5 text-faint">
                  忘记密码请联系公司管理员在「成员管理」中重置。
                </p>
              )}
              {setupRequired && (
                <div className="mt-4 flex items-start gap-2 rounded-lg bg-[#f6f7fb] px-3 py-2.5 text-[10.5px] leading-4 text-muted">
                  <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[#4f46e5]" />
                  首位注册者自动成为管理员。之后同事在登录页自助注册，需你在后台审批通过才能登录。
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-5 flex flex-col items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] text-faint">
            <ShieldCheck size={11} /> 私有部署 · 数据留在公司服务器
          </span>
          <span className="text-[10px] text-faint">© 2026 TeamOS</span>
        </div>
      </div>
    </div>
  )
}
