import {
  BookOpen,
  Bot,
  Box,
  Cable,
  CalendarClock,
  ChevronDown,
  ChevronsUpDown,
  History,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquare,
  Pencil,
  Settings,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../../lib/store'
import { cn, copyText } from '../../lib/utils'
import { DEPARTMENTS } from '../../lib/seed'
import { Logo } from '../brand/Logo'
import { Avatar } from '../ui/avatar'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown'
import { Field, Input, Select, Textarea } from '../ui/input'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  badge?: number
  danger?: boolean
  note?: string
}

function NavRow({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate: () => void
}) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors',
          collapsed && 'justify-center px-0',
          isActive
            ? 'border border-line bg-surface text-ink shadow-card'
            : 'border border-transparent text-ink-soft hover:bg-sunken hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon
            size={16}
            strokeWidth={1.9}
            className={cn('shrink-0', isActive ? 'text-accent' : 'text-faint group-hover:text-ink-soft')}
          />
          {!collapsed && <span className="truncate">{item.label}</span>}
          {!collapsed && item.badge != null && item.badge > 0 && (
            <span
              className={cn(
                'ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none',
                item.danger ? 'bg-danger text-white' : 'bg-accent text-white',
              )}
            >
              {item.badge}
            </span>
          )}
          {collapsed && item.badge != null && item.badge > 0 && (
            <span
              className={cn(
                'absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full',
                item.danger ? 'bg-danger' : 'bg-accent',
              )}
            />
          )}
          {!collapsed && item.note && (
            <span className="ml-auto rounded border border-line px-1 py-px text-[9px] font-medium tracking-wide text-faint">
              {item.note}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

export function Sidebar({
  collapsed,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean
  mobileOpen: boolean
  onCloseMobile: () => void
}) {
  const { state, currentUser, logout, updateMember, notify } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [profileOpen, setProfileOpen] = useState(false)
  const [jobTitle, setJobTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [bio, setBio] = useState('')

  if (!currentUser) return null
  const isAdmin = currentUser.role === 'admin'
  const isAdminView = location.pathname.startsWith('/admin')
  const unread = state.groups
    .filter((g) => g.memberIds.includes(currentUser.id))
    .reduce((sum, g) => sum + g.unread, 0)
  const pendingSkills = state.skills.filter((s) => s.status === 'review').length
  const invited = state.members.filter((m) => m.status === 'invited').length
  const failedRuns = state.runs.filter((r) => r.status === 'failed').length
  const pendingDocs = state.knowledgeDocs.filter((doc) => doc.status === 'review').length

  const workspaceNav: NavItem[] = [
    { to: '/workspace/chat', label: '公司大厅', icon: MessageSquare, badge: unread },
    { to: '/workspace/agents', label: 'AI 助理', icon: Bot },
    { to: '/workspace/knowledge', label: '企业知识', icon: BookOpen },
    { to: '/workspace/meetings', label: '会议纪要', icon: CalendarClock },
  ]
  const adminNav: NavItem[] = [
    { to: '/admin', label: '概览', icon: LayoutDashboard, end: true },
    { to: '/admin/agents', label: 'AI 助理', icon: Bot },
    { to: '/admin/skills', label: '技能中心', icon: Box, badge: pendingSkills },
    { to: '/admin/knowledge', label: '知识库', icon: BookOpen, badge: pendingDocs },
    { to: '/admin/connectors', label: '渠道接入', icon: Cable },
    { to: '/admin/members', label: '成员与岗位', icon: UsersRound, badge: invited },
    { to: '/admin/runs', label: '运行记录', icon: History, badge: failedRuns, danger: true },
    { to: '/admin/settings', label: '设置', icon: Settings },
  ]

  const openProfile = () => {
    setJobTitle(currentUser.jobTitle)
    setDepartment(currentUser.department)
    setBio(currentUser.bio ?? '')
    setProfileOpen(true)
  }

  const saveProfile = () => {
    if (!jobTitle.trim()) {
      notify('岗位名称不能为空', { tone: 'warning' })
      return
    }
    updateMember(currentUser.id, {
      jobTitle: jobTitle.trim(),
      department,
      bio: bio.trim(),
    })
    setProfileOpen(false)
    notify('资料已更新', { description: '同事们在公司大厅会看到你的新岗位。', tone: 'success' })
  }

  const renderSection = (label: string, items: NavItem[]) => (
    <div className="mb-4">
      {!collapsed && (
        <div className="mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
          {label}
        </div>
      )}
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavRow key={item.to + item.label} item={item} collapsed={collapsed} onNavigate={onCloseMobile} />
        ))}
      </div>
    </div>
  )

  return (
    <>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-dvh w-[236px] shrink-0 flex-col border-r border-line bg-[#fbfbfc] transition-[width,transform] duration-200 ease-out lg:static lg:translate-x-0',
          collapsed ? 'lg:w-[68px]' : 'lg:w-[236px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        aria-label="主导航"
      >
        <div
          className={cn(
            'flex h-14 shrink-0 items-center gap-2.5 px-3.5',
            collapsed && 'lg:justify-center lg:px-0',
          )}
        >
          <Logo size={29} />
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[15px] font-semibold leading-5 tracking-[-0.01em] text-ink">
                TeamOS
              </div>
              <div className="text-[10px] leading-3 tracking-wide text-faint">企业 AI 工作台</div>
            </div>
          )}
          <button
            type="button"
            onClick={onCloseMobile}
            className="ml-auto rounded-md p-1 text-muted hover:bg-sunken lg:hidden"
            aria-label="关闭导航"
          >
            <ChevronsUpDown size={16} className="rotate-45" />
          </button>
        </div>

        <div className={cn('px-3', collapsed && 'lg:px-2.5')}>
          {isAdmin ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title={collapsed ? state.company.name : undefined}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-left shadow-card transition-colors hover:bg-raised',
                    collapsed && 'lg:justify-center lg:px-0 lg:py-1.5',
                  )}
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-[11px] font-semibold text-accent-strong">
                    {state.company.shortName.slice(0, 1)}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium leading-4 text-ink">
                          {state.company.name}
                        </span>
                        <span className="block truncate text-[10px] leading-3 text-faint">
                          {state.company.plan} · 独立 VPS
                        </span>
                      </span>
                      <ChevronDown size={14} className="shrink-0 text-faint" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[224px]">
                <DropdownMenuLabel>当前公司</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => navigate('/admin/settings')}>
                  <Settings size={14} /> 公司设置
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate('/admin/members')}>
                  <UsersRound size={14} /> 成员与岗位
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate('/admin/settings#deployment')}>
                  <Cable size={14} /> 部署与数据
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 shadow-card',
                collapsed && 'lg:justify-center lg:px-0 lg:py-1.5',
              )}
            >
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-[11px] font-semibold text-accent-strong">
                {state.company.shortName.slice(0, 1)}
              </span>
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium leading-4 text-ink">
                    {state.company.name}
                  </span>
                  <span className="block truncate text-[10px] leading-3 text-faint">
                    {state.company.plan} · 独立 VPS
                  </span>
                </span>
              )}
            </div>
          )}

          {isAdmin && (
            <div
              className={cn(
                'mt-2.5 grid grid-cols-2 gap-0.5 rounded-lg bg-sunken p-0.5',
                collapsed && 'lg:grid-cols-1',
              )}
            >
              <button
                type="button"
                onClick={() => {
                  navigate('/workspace/chat')
                  onCloseMobile()
                }}
                title="员工工作台"
                className={cn(
                  'flex h-7 items-center justify-center gap-1.5 rounded-md text-[11px] font-medium transition-colors',
                  !isAdminView ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
                )}
              >
                <MessageSquare size={12} />
                {!collapsed && <span>员工工作台</span>}
              </button>
              <button
                type="button"
                onClick={() => {
                  navigate('/admin')
                  onCloseMobile()
                }}
                title="管理后台"
                className={cn(
                  'flex h-7 items-center justify-center gap-1.5 rounded-md text-[11px] font-medium transition-colors',
                  isAdminView ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
                )}
              >
                <LayoutDashboard size={12} />
                {!collapsed && <span>管理后台</span>}
              </button>
            </div>
          )}
        </div>

        <nav className="mt-4 min-h-0 flex-1 overflow-y-auto px-2.5 no-scrollbar">
          {isAdminView && isAdmin ? (
            renderSection('管理', adminNav)
          ) : (
            renderSection('工作区', workspaceNav)
          )}
        </nav>

        <div className={cn('border-t border-line p-2.5', collapsed && 'lg:px-2')}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-sunken',
                  collapsed && 'lg:justify-center lg:px-0',
                )}
              >
                <Avatar name={currentUser.name} color={currentUser.color} size="sm" />
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium leading-4 text-ink">
                        {currentUser.name}
                      </span>
                      <span className="block truncate text-[10px] leading-3 text-faint">
                        {currentUser.jobTitle}
                      </span>
                    </span>
                    <ChevronDown size={13} className="shrink-0 text-faint" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="mb-1 w-[220px]">
              <DropdownMenuLabel>
                <span className="block text-[12px] font-medium text-ink">{currentUser.name}</span>
                <span className="block text-[11px] text-muted">{currentUser.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={openProfile}>
                <Pencil size={14} /> 编辑我的岗位
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  copyText(currentUser.email)
                    .then(() => notify('邮箱已复制'))
                    .catch(() => notify('复制失败，请手动选择', { tone: 'warning' }))
                }}
              >
                <Mail size={14} /> 复制邮箱
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                danger
                onSelect={() => {
                  logout()
                  navigate('/login')
                }}
              >
                <LogOut size={14} /> 退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent size="sm">
          <DialogHeader
            title="编辑我的资料"
            description="岗位名称会显示在公司大厅的消息、成员列表和助理的上下文里。"
          />
          <DialogBody className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-line bg-raised p-3">
              <Avatar name={currentUser.name} color={currentUser.color} size="lg" />
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-ink">{currentUser.name}</div>
                <div className="text-xs text-muted">{currentUser.email}</div>
              </div>
              <Badge tone="outline" className="ml-auto">
                {currentUser.role === 'admin' ? '公司管理员' : '成员'}
              </Badge>
            </div>
            <Field label="岗位名称" required htmlFor="profile-job">
              <Input
                id="profile-job"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="例如：产品经理、销售经理"
                maxLength={20}
              />
            </Field>
            <Field label="所属部门" htmlFor="profile-dept">
              <Select id="profile-dept" value={department} onChange={(e) => setDepartment(e.target.value)}>
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="一句话介绍" hint="选填" htmlFor="profile-bio">
              <Textarea
                id="profile-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="你负责什么，同事可以找你做什么"
                className="min-h-[72px]"
                maxLength={120}
              />
            </Field>
            <p className="text-[11px] leading-5 text-faint">
              公司管理员也可以在「成员与岗位」里调整你的岗位与角色。
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setProfileOpen(false)}>
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={saveProfile}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
