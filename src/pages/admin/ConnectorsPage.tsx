import {
  Cable,
  CheckCircle2,
  Hash,
  KeyRound,
  MessageCircle,
  MessageSquare,
  Radio,
  Send,
  ShieldCheck,
  Webhook,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../../lib/store'
import type { Connector, ConnectorKind } from '../../lib/types'
import { formatRelative } from '../../lib/format'
import { cn } from '../../lib/utils'
import { PageBody, PageHeader } from '../../components/layout/PageHeader'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/ui/dialog'
import { Checkbox, Field, Input } from '../../components/ui/input'
import { Switch } from '../../components/ui/switch'

const KIND_META: Record<ConnectorKind, { label: string; icon: typeof MessageSquare }> = {
  wecom: { label: '企业微信', icon: MessageSquare },
  feishu: { label: '飞书', icon: Send },
  dingtalk: { label: '钉钉', icon: MessageCircle },
  slack: { label: 'Slack', icon: Hash },
  webhook: { label: '自定义', icon: Webhook },
}

const SCOPE_OPTIONS: Record<ConnectorKind, string[]> = {
  wecom: ['接收群消息', '发送卡片消息', '通讯录只读'],
  feishu: ['接收群消息', '发送卡片消息', '审批事件只读'],
  dingtalk: ['接收群消息', '发送卡片消息'],
  slack: ['接收频道消息', '发送消息', '频道列表只读'],
  webhook: ['接收事件', '发送消息'],
}

export function AdminConnectorsPage() {
  const { state, notify, testConnector } = useStore()
  const [editing, setEditing] = useState<Connector | null>(null)

  const connectors = state.connectors
  const connected = connectors.filter((item) => item.status === 'connected')
  const events = connectors.reduce((sum, item) => sum + item.events, 0)
  const signatureCoverage = connected.filter((item) => item.signature).length
  const pending = connectors.filter((item) => item.status !== 'connected')

  const runTest = async (connector: Connector) => {
    const result = await testConnector(connector.id)
    if (!result.ok) {
      notify(result.error ?? '测试事件投递失败', { tone: 'warning' })
    }
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow="管理后台 · 渠道接入"
        title="把外部消息带进公司大厅"
        description="企业微信、飞书、钉钉、Slack 与内部系统通过回调把消息转交 TeamOS。所有接入都必须开启签名校验，密钥只写不读。"
      />

      <div className="mb-5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {[
          { label: '已接入渠道', value: connected.length, hint: `共 ${connectors.length} 个渠道`, icon: Cable },
          { label: '累计事件', value: events.toLocaleString(), hint: '签名校验后写入', icon: Radio },
          { label: '签名校验', value: `${signatureCoverage}/${connected.length}`, hint: '已连接渠道全部启用', icon: ShieldCheck },
          { label: '待配置', value: pending.length, hint: '需要地址与密钥', icon: KeyRound },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-line bg-surface px-4 py-3.5 shadow-card"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-[0.07em] text-faint">
                {item.label}
              </span>
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-raised text-muted">
                <item.icon size={13} />
              </span>
            </div>
            <div className="mt-1.5 text-[24px] font-semibold leading-8 tabular text-ink">
              {item.value}
            </div>
            <div className="mt-0.5 truncate text-[10.5px] text-muted">{item.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {connectors.map((connector) => {
          const KindIcon = KIND_META[connector.kind].icon
          const isConnected = connector.status === 'connected'
          return (
            <section
              key={connector.id}
              className="flex flex-col rounded-xl border border-line bg-surface p-4 shadow-card"
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    isConnected
                      ? 'bg-accent-soft text-accent'
                      : 'bg-raised text-faint',
                  )}
                >
                  <KindIcon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h2 className="text-[13.5px] font-semibold text-ink">{connector.name}</h2>
                    <Badge tone={isConnected ? 'success' : 'neutral'} dot>
                      {isConnected ? '已连接' : '未连接'}
                    </Badge>
                    {connector.signature && (
                      <Badge tone="outline">
                        <ShieldCheck size={10} /> 签名校验
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[11.5px] leading-5 text-muted">{connector.description}</p>
                </div>
              </div>

              <dl className="mt-3 space-y-1.5 rounded-lg bg-raised px-3 py-2.5 text-[11px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="shrink-0 text-faint">回调地址</dt>
                  <dd className="min-w-0 truncate font-mono text-[10.5px] text-ink-soft">
                    {connector.endpointHint || '未配置'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="shrink-0 text-faint">签名密钥</dt>
                  <dd className="min-w-0 truncate font-mono text-[10.5px] text-ink-soft">
                    {connector.secretSet ? connector.secretHint : '未配置'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="shrink-0 text-faint">最近事件</dt>
                  <dd className="text-ink-soft">
                    {connector.lastEventAt ? formatRelative(connector.lastEventAt) : '尚无事件'}
                  </dd>
                </div>
              </dl>

              <div className="mt-2.5 flex flex-wrap gap-1">
                {connector.scopes.map((scope) => (
                  <span
                    key={scope}
                    className="rounded bg-sunken px-1.5 py-0.5 text-[10px] text-ink-soft"
                  >
                    {scope}
                  </span>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                <span className="text-[10.5px] text-faint">
                  <span className="tabular text-ink-soft">{connector.events.toLocaleString()}</span>{' '}
                  个事件
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(connector)}>
                    配置
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void runTest(connector)}
                    disabled={!isConnected || !connector.signature}
                    title={
                      !isConnected
                        ? '先启用渠道后才能发送测试事件'
                        : '发送一条经过签名校验的测试事件'
                    }
                  >
                    <Zap size={12} /> 发送测试事件
                  </Button>
                </div>
              </div>
            </section>
          )
        })}
      </div>

      <div className="mt-5 rounded-xl border border-line bg-surface p-4 shadow-card">
        <div className="flex items-start gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <ShieldCheck size={15} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[12.5px] font-medium text-ink">接入安全基线</h2>
            <div className="mt-1.5 grid gap-1.5 text-[11px] leading-5 text-muted sm:grid-cols-2">
              <p className="flex items-start gap-1.5">
                <CheckCircle2 size={12} className="mt-1 shrink-0 text-success" />
                请求必须带时间戳与 HMAC 签名，签名不通过直接拒绝。
              </p>
              <p className="flex items-start gap-1.5">
                <CheckCircle2 size={12} className="mt-1 shrink-0 text-success" />
                密钥只写不读：界面只显示末四位，日志与 URL 中都不会出现。
              </p>
              <p className="flex items-start gap-1.5">
                <CheckCircle2 size={12} className="mt-1 shrink-0 text-success" />
                按事件 ID 去重，避免重试造成重复回复。
              </p>
              <p className="flex items-start gap-1.5">
                <CheckCircle2 size={12} className="mt-1 shrink-0 text-success" />
                只申请需要的权限范围，高风险的发送与通讯录能力单独授权。
              </p>
            </div>
          </div>
        </div>
      </div>

      <ConnectorDialog
        key={editing?.id ?? 'none'}
        connector={editing}
        onClose={() => setEditing(null)}
      />
    </PageBody>
  )
}

function ConnectorDialog({
  connector,
  onClose,
}: {
  connector: Connector | null
  onClose: () => void
}) {
  const { updateConnector } = useStore()
  const [enabled, setEnabled] = useState(connector?.status === 'connected')
  const [endpoint, setEndpoint] = useState('')
  const [secret, setSecret] = useState('')
  const [signature, setSignature] = useState(connector?.signature ?? true)
  const [scopes, setScopes] = useState<string[]>(connector?.scopes ?? [])
  const [error, setError] = useState('')

  if (!connector) return null
  const options = Array.from(
    new Set([...SCOPE_OPTIONS[connector.kind], ...connector.scopes]),
  )

  const toggleScope = (scope: string) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((item) => item !== scope) : [...prev, scope],
    )
  }

  const save = async () => {
    setError('')
    if (endpoint) {
      let valid = false
      try {
        valid = new URL(endpoint).protocol === 'https:'
      } catch {
        valid = false
      }
      if (!valid) {
        setError('回调地址必须是完整的 https:// 地址。')
        return
      }
    }
    if (secret && secret.length < 8) {
      setError('签名密钥至少 8 位，建议使用随机生成的长密钥。')
      return
    }
    if (enabled && !connector.endpointHint && !endpoint) {
      setError('启用前需要填写回调地址。')
      return
    }
    if (enabled && !connector.secretSet && !secret) {
      setError('启用前需要配置签名密钥。')
      return
    }
    if (enabled && !signature) {
      setError('启用前必须开启签名校验。')
      return
    }
    if (enabled && scopes.length === 0) {
      setError('至少选择一个权限范围。')
      return
    }
    const result = await updateConnector(connector.id, {
      status: enabled ? 'connected' : 'disconnected',
      signature,
      scopes,
      ...(endpoint ? { endpoint } : {}),
      ...(secret ? { secret } : {}),
    })
    if (!result.ok) {
      setError(result.error ?? '保存失败，请稍后重试。')
      return
    }
    onClose()
  }

  return (
    <Dialog open={Boolean(connector)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader
          title={`配置 ${connector.name}`}
          description="地址与密钥不会回填显示；留空表示保持现有配置。密钥提交后只保留末四位用于核对。"
          icon={Cable}
        />
        <DialogBody className="space-y-4">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-raised px-3 py-2.5">
            <span>
              <span className="block text-[12px] font-medium text-ink">启用这个渠道</span>
              <span className="mt-0.5 block text-[10.5px] text-muted">
                停用后不再接收外部事件，历史记录保留。
              </span>
            </span>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="启用这个渠道"
            />
          </label>

          <Field
            label="回调地址"
            hint={connector.endpointHint ? '已配置，留空保持不变' : '必填'}
            htmlFor="connector-endpoint"
          >
            <Input
              id="connector-endpoint"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder={connector.endpointHint || 'https://…/api/hooks/teamos'}
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-[12px]"
            />
          </Field>

          <Field
            label="签名密钥"
            hint={connector.secretSet ? `当前 ${connector.secretHint}，留空不修改` : '至少 8 位'}
            htmlFor="connector-secret"
          >
            <Input
              id="connector-secret"
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder={connector.secretSet ? '输入新密钥以更换' : '输入签名密钥'}
              autoComplete="new-password"
              className="font-mono text-[12px]"
            />
          </Field>

          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line px-3 py-2.5">
            <Checkbox
              checked={signature}
              onChange={(event) => setSignature(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="flex items-center gap-1 text-[12px] font-medium text-ink">
                <ShieldCheck size={11} className="text-success" /> 校验请求签名
              </span>
              <span className="mt-0.5 block text-[10.5px] leading-4 text-muted">
                使用密钥校验时间戳与签名，拒绝重放与伪造请求。启用渠道时必须开启。
              </span>
            </span>
          </label>

          <div>
            <div className="mb-1.5 text-[13px] font-medium text-ink-soft">权限范围</div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {options.map((scope) => (
                <label
                  key={scope}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-[11.5px] text-ink-soft"
                >
                  <Checkbox
                    checked={scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                  />
                  {scope}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-faint">
              只申请需要的权限；发送消息与通讯录读取属于较高风险能力。
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-raised px-3 py-2 text-[10.5px] leading-4 text-faint">
            <KeyRound size={12} className="mt-0.5 shrink-0" />
            密钥只写不读，不会出现在前端状态、URL、审计详情或服务端日志里。正式部署时应由密钥管理服务托管。
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[11.5px] text-danger">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            保存配置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
