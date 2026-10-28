import {
  Building2,
  ChevronRight,
  Mail,
  MessagesSquare,
  Search,
  ShieldCheck,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../../lib/store'
import type { Member, Role } from '../../lib/types'
import { DEPARTMENTS } from '../../lib/seed'
import { formatDate, formatRelative } from '../../lib/format'
import { cn } from '../../lib/utils'
import { PageBody, PageHeader } from '../../components/layout/PageHeader'
import { Avatar } from '../../components/ui/avatar'
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

export function AdminMembersPage() {
  const { state, currentUser } = useStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('all')
  const [role, setRole] = useState<'all' | Role>('all')
  const [status, setStatus] = useState<'all' | Member['status']>('all')

  const selected = state.members.find((member) => member.id === searchParams.get('member')) ?? null
  const inviteOpen = searchParams.get('invite') === '1'
  const adminCount = state.members.filter((member) => member.role === 'admin').length
  const activeMembers = state.members.filter((member) => member.status === 'active')
  const invited = state.members.filter((member) => member.status === 'invited')
  const departments = new Set(activeMembers.map((member) => member.department))

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return state.members
      .filter((member) => (department === 'all' ? true : member.department === department))
      .filter((member) => (role === 'all' ? true : member.role === role))
      .filter((member) => (status === 'all' ? true : member.status === status))
      .filter(
        (member) =>
          !needle ||
          member.name.toLowerCase().includes(needle) ||
          member.email.toLowerCase().includes(needle) ||
          member.jobTitle.toLowerCase().includes(needle),
      )
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === 'admin' ? -1 : 1
        return a.name.localeCompare(b.name, 'zh-CN')
      })
  }, [department, query, role, state.members, status])

  const openMember = (id: string) => {
    const next = new URLSearchParams(searchParams)
    next.delete('invite')
    next.set('member', id)
    setSearchParams(next)
  }

  const closeMember = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('member')
    setSearchParams(next, { replace: true })
  }

  const setInviteOpen = (open: boolean) => {
    const next = new URLSearchParams(searchParams)
    next.delete('member')
    if (open) next.set('invite', '1')
    else next.delete('invite')
    setSearchParams(next, { replace: true })
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow="管理后台 · 成员"
        title="成员与岗位"
        description="每位员工都能注册并维护自己的岗位。管理员可以调整岗位、部门与角色；岗位会显示在公司大厅和成员目录里。"
        actions={
          <Button size="sm" variant="primary" onClick={() => setInviteOpen(true)}>
            <UserPlus size={14} /> 邀请成员
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { label: '在职成员', value: activeMembers.length, icon: UsersRound, hint: `${state.members.length} 条成员记录` },
          { label: '待加入', value: invited.length, icon: UserPlus, hint: '接受邀请后进入工作区' },
          { label: '管理员', value: adminCount, icon: ShieldCheck, hint: '可进入管理后台' },
          { label: '覆盖部门', value: departments.size, icon: Building2, hint: '按部门组织岗位' },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-line bg-surface px-3.5 py-3 shadow-card">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
                {item.label}
              </span>
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-raised text-muted">
                <item.icon size={12} />
              </span>
            </div>
            <div className="mt-1 text-[22px] font-semibold tabular text-ink">{item.value}</div>
            <div className="mt-0.5 text-[10px] text-faint">{item.hint}</div>
          </div>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索姓名、邮箱或岗位"
            aria-label="搜索成员"
            className="h-8 w-[210px] rounded-lg border border-line bg-surface pl-7 pr-2.5 text-[12px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
          />
        </div>
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
          {(
            [
              ['all', `全部 ${state.members.length}`],
              ['active', `在职 ${activeMembers.length}`],
              ['invited', `待加入 ${invited.length}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatus(key)}
              className={cn(
                'shrink-0 rounded-md px-2 py-1 text-[11px] transition-colors',
                status === key
                  ? 'bg-accent-soft font-medium text-accent-strong'
                  : 'text-muted hover:bg-sunken hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Select
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            className="h-8 w-[120px] text-[11.5px]"
            aria-label="按部门筛选"
          >
            <option value="all">全部部门</option>
            {DEPARTMENTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
          <Select
            value={role}
            onChange={(event) => setRole(event.target.value as 'all' | Role)}
            className="h-8 w-[110px] text-[11.5px]"
            aria-label="按角色筛选"
          >
            <option value="all">全部角色</option>
            <option value="admin">管理员</option>
            <option value="member">成员</option>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_110px_100px_90px_90px_90px_24px] gap-3 border-b border-line bg-raised px-4 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-faint lg:grid">
          <span>成员</span>
          <span>岗位</span>
          <span>部门</span>
          <span>角色</span>
          <span>状态</span>
          <span>公司大厅</span>
          <span>加入时间</span>
          <span />
        </div>
        {visible.length === 0 ? (
          <div className="p-3">
            <EmptyState
              icon={UsersRound}
              title="没有匹配的成员"
              description="调整筛选条件，或邀请新成员加入。"
              compact
              action={
                <Button size="sm" variant="secondary" onClick={() => setInviteOpen(true)}>
                  <UserPlus size={13} /> 邀请成员
                </Button>
              }
            />
          </div>
        ) : (
          visible.map((member) => {
            const isSelf = member.id === currentUser?.id
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => openMember(member.id)}
                className="flex w-full flex-col gap-2 border-b border-line px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-raised lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_110px_100px_90px_90px_90px_24px] lg:items-center lg:gap-3 lg:px-4"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={member.name} color={member.color} size="md" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium text-ink">{member.name}</span>
                      {isSelf && <Badge tone="outline">我</Badge>}
                    </div>
                    <div className="truncate text-[10.5px] text-faint">{member.email}</div>
                  </div>
                </div>
                <div className="text-[11.5px] text-ink-soft lg:text-[11px]">{member.jobTitle}</div>
                <div className="hidden text-[11px] text-muted lg:block">{member.department}</div>
                <div className="hidden lg:block">
                  <Badge tone={member.role === 'admin' ? 'accent' : 'neutral'}>
                    {member.role === 'admin' ? '管理员' : '成员'}
                  </Badge>
                </div>
                <div>
                  <StatusPill status={member.status} />
                </div>
                <div className="hidden text-[11px] text-muted lg:block">
                  {member.status === 'active' ? '已加入' : '—'}
                </div>
                <div className="hidden text-[10.5px] text-faint lg:block">{formatDate(member.joinedAt)}</div>
                <div className="ml-auto flex items-center gap-2 text-faint lg:ml-0 lg:justify-end">
                  <span className="text-[10px] lg:hidden">
                    {member.department} · {member.role === 'admin' ? '管理员' : '成员'} ·{' '}
                    {member.status === 'active' ? '公司大厅已加入' : '待加入'}
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
        岗位名称会显示在公司大厅的消息作者、成员列表与助理上下文中。管理员操作会写入审计记录；成员状态由邀请与账号流程控制，这里只读。
      </p>

      {selected && (
        <MemberDetailDialog
          key={selected.id}
          member={selected}
          isSelf={selected.id === currentUser?.id}
          onClose={closeMember}
        />
      )}

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        existing={state.members}
      />
    </PageBody>
  )
}

function MemberDetailDialog({
  member,
  isSelf,
  onClose,
}: {
  member: Member
  isSelf: boolean
  onClose: () => void
}) {
  const { updateMember, notify } = useStore()
  const [jobTitle, setJobTitle] = useState(member.jobTitle)
  const [department, setDepartment] = useState(member.department)
  const [role, setRole] = useState<Role>(member.role)
  const roleChanged = role !== member.role

  const save = async () => {
    if (!jobTitle.trim()) {
      notify('岗位名称不能为空', { tone: 'warning' })
      return
    }
    if (isSelf && roleChanged) {
      notify('不能修改自己的管理员角色', {
        description: '请让另一位管理员调整，避免把最后一个管理员锁在后台之外。',
        tone: 'warning',
      })
      return
    }
    const result = await updateMember(member.id, {
      jobTitle: jobTitle.trim(),
      department,
      role,
    })
    if (!result.ok) {
      notify('保存失败', { description: result.error, tone: 'danger' })
      return
    }
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader title="成员资料" description="岗位与部门对所有成员可见；角色决定是否能进入管理后台。" />
        <DialogBody className="space-y-5">
          <div className="flex items-center gap-3 rounded-lg border border-line bg-raised p-3">
            <Avatar name={member.name} color={member.color} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-medium text-ink">{member.name}</span>
                {isSelf && <Badge tone="outline">我</Badge>}
                <StatusPill status={member.status} />
              </div>
              <div className="mt-0.5 truncate text-[11px] text-faint">{member.email}</div>
            </div>
            <Badge tone={member.role === 'admin' ? 'accent' : 'neutral'}>
              {member.role === 'admin' ? '管理员' : '成员'}
            </Badge>
          </div>

          {member.status === 'invited' && (
            <div className="rounded-lg border border-warning/20 bg-warning-soft px-3 py-2.5 text-[11px] leading-5 text-warning">
              该成员尚未首次登录。登录并设置新密码后会自动加入公司大厅，在此之前不能 @ 助理。
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="岗位名称" required htmlFor="member-job">
              <Input
                id="member-job"
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                maxLength={20}
                placeholder="例如：销售经理"
              />
            </Field>
            <Field label="所属部门" htmlFor="member-dept">
              <Select
                id="member-dept"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
              >
                {DEPARTMENTS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="角色"
            htmlFor="member-role"
            hint={isSelf ? '不能修改自己的角色' : undefined}
          >
            <Select
              id="member-role"
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
              disabled={isSelf}
            >
              <option value="member">成员 · 使用员工工作台</option>
              <option value="admin">管理员 · 可进入管理后台</option>
            </Select>
          </Field>
          {isSelf && (
            <p className="-mt-3 flex items-start gap-1.5 text-[10.5px] leading-4 text-faint">
              <ShieldCheck size={11} className="mt-0.5 shrink-0" />
              为避免把最后一个管理员移出后台，自己不能降级。需要两位管理员互相调整。
            </p>
          )}

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink">
              <MessagesSquare size={13} /> 公司大厅
            </h3>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
                <MessagesSquare size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] font-medium text-ink">全公司共用同一个聊天页</div>
                <p className="mt-0.5 text-[10.5px] leading-4 text-muted">
                  {member.status === 'active'
                    ? '已加入，可查看公司大厅的会话并 @ 已发布助理。'
                    : '接受邀请后自动加入，无需管理员逐个拉群。'}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-surface px-3 py-2.5">
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <div className="text-faint">邮箱</div>
                <div className="mt-0.5 flex items-center gap-1 text-ink-soft">
                  <Mail size={11} /> {member.email}
                </div>
              </div>
              <div>
                <div className="text-faint">加入时间</div>
                <div className="mt-0.5 text-ink-soft">
                  {formatDate(member.joinedAt)} · {formatRelative(member.joinedAt)}
                </div>
              </div>
            </div>
            {member.bio && <p className="mt-2 border-t border-line pt-2 text-[11px] leading-5 text-muted">{member.bio}</p>}
          </section>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            保存修改
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InviteDialog({
  open,
  onClose,
  existing,
}: {
  open: boolean
  onClose: () => void
  existing: Member[]
}) {
  const { inviteMember } = useStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [department, setDepartment] = useState('产品部')
  const [role, setRole] = useState<Role>('member')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(
    null,
  )

  const reset = () => {
    setName('')
    setEmail('')
    setJobTitle('')
    setDepartment('产品部')
    setRole('member')
    setError('')
    setCreated(null)
    setSubmitting(false)
  }

  const cancel = () => {
    reset()
    onClose()
  }

  const submit = async () => {
    setError('')
    if (!name.trim() || !email.trim() || !jobTitle.trim()) {
      setError('请填写姓名、邮箱和岗位名称。')
      return
    }
    if (existing.some((member) => member.email.toLowerCase() === email.trim().toLowerCase())) {
      setError('该邮箱已在成员列表中。')
      return
    }
    setSubmitting(true)
    try {
      const result = await inviteMember({ name, email, jobTitle, department, role })
      if (!result.ok) {
        setError(result.error ?? '邀请失败，请检查填写内容。')
        return
      }
      setCreated({
        name: name.trim(),
        email: email.trim(),
        password: result.temporaryPassword ?? '',
      })
      setName('')
      setEmail('')
      setJobTitle('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset()
          onClose()
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader
          title="邀请成员"
          description="填入对方的公司邮箱与岗位。账号创建后，成员首次登录即自动加入公司大厅。"
        />
        <DialogBody className="space-y-4">
          {created ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-success/25 bg-success-soft px-3 py-2.5 text-[11.5px] leading-5 text-success">
                {created.name} 的账号已创建。请把下面的邮箱和临时密码通过安全渠道转交给对方。
              </div>
              <div className="rounded-lg border border-line bg-surface p-3">
                <div className="text-[10.5px] text-faint">登录邮箱</div>
                <div className="mt-0.5 font-mono text-[12.5px] text-ink">{created.email}</div>
                <div className="mt-3 text-[10.5px] text-faint">临时密码（只显示这一次）</div>
                <div className="mt-0.5 select-all font-mono text-[14px] font-medium tracking-wide text-ink">
                  {created.password || '未生成'}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (created.password) void navigator.clipboard?.writeText(created.password)
                  }}
                  className="mt-2 text-[11px] font-medium text-[#5b5bd6] hover:text-[#4338ca]"
                >
                  复制临时密码
                </button>
              </div>
              <p className="text-[10.5px] leading-5 text-muted">
                对方首次登录后会自动加入公司大厅；请提醒其登录后在设置中修改密码。
              </p>
            </div>
          ) : (
            <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="姓名" required htmlFor="invite-name">
              <Input
                id="invite-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="对方姓名"
                maxLength={20}
              />
            </Field>
            <Field label="岗位名称" required htmlFor="invite-job">
              <Input
                id="invite-job"
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                placeholder="例如：客户成功经理"
                maxLength={20}
              />
            </Field>
          </div>
          <Field label="公司邮箱" required htmlFor="invite-email">
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="所属部门" htmlFor="invite-dept">
              <Select
                id="invite-dept"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
              >
                {DEPARTMENTS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="角色" htmlFor="invite-role">
              <Select
                id="invite-role"
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                <option value="member">成员 · 员工工作台</option>
                <option value="admin">管理员 · 可进入后台</option>
              </Select>
            </Field>
          </div>
          {error && (
            <div className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-xs leading-5 text-danger">
              {error}
            </div>
          )}
          <div className="rounded-lg border border-line bg-raised px-3 py-2.5 text-[10.5px] leading-5 text-muted">
            系统会创建账号并生成一次性展示的临时密码，不会自动发送邮件；请通过公司内部的安全渠道转交。
          </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {created ? (
            <>
              <Button variant="secondary" onClick={() => reset()}>
                再邀请一位
              </Button>
              <Button variant="primary" onClick={cancel}>
                完成
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={cancel}>
                取消
              </Button>
              <Button variant="primary" onClick={() => void submit()} disabled={submitting}>
                <UserPlus size={14} /> {submitting ? '正在创建…' : '创建邀请'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
