import * as PopoverPrimitive from '@radix-ui/react-popover'
import {
  Bell,
  Box,
  ChevronRight,
  CircleCheck,
  History,
  LayoutDashboard,
  Menu,
  MessageSquare,
  PanelLeft,
  Search,
  Server,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../../lib/store'
import { cn } from '../../lib/utils'
import { CommandPalette } from './CommandPalette'

interface Notice {
  id: string
  title: string
  description: string
  to: string
  icon: LucideIcon
  tone: 'accent' | 'warning' | 'danger'
}

const toneClasses = {
  accent: 'bg-accent-soft text-accent',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
} as const

export function Topbar({
  onOpenMobile,
  onToggleCollapse,
  collapsed,
}: {
  onOpenMobile: () => void
  onToggleCollapse: () => void
  collapsed: boolean
}) {
  const { state, currentUser } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [noticeOpen, setNoticeOpen] = useState(false)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!currentUser) return null
  const isAdmin = currentUser.role === 'admin'
  const inAdmin = location.pathname.startsWith('/admin')

  const unread = state.groups
    .filter((g) => g.memberIds.includes(currentUser.id))
    .reduce((sum, g) => sum + g.unread, 0)
  const pendingSkills = state.skills.filter((s) => s.status === 'review').length
  const invited = state.members.filter((m) => m.status === 'invited').length
  const failed = state.runs.filter((r) => r.status === 'failed').length

  const notices: Notice[] = []
  if (isAdmin) {
    if (pendingSkills > 0) {
      notices.push({
        id: 'skills',
        title: 'Skill 等待审核',
        description: `${pendingSkills} 个 Skill 需要权限与风险审查`,
        to: '/admin/skills',
        icon: Box,
        tone: 'warning',
      })
    }
    if (invited > 0) {
      notices.push({
        id: 'invited',
        title: '成员待加入',
        description: `${invited} 位成员已邀请，尚未激活账号`,
        to: '/admin/members',
        icon: UsersRound,
        tone: 'accent',
      })
    }
    if (failed > 0) {
      notices.push({
        id: 'failed',
        title: '运行失败',
        description: `${failed} 个任务需要检查或重试`,
        to: '/admin/runs',
        icon: History,
        tone: 'danger',
      })
    }
  } else if (unread > 0) {
    notices.push({
      id: 'unread',
      title: '未读消息',
      description: `${unread} 条新消息在公司大厅等你`,
      to: '/workspace/chat',
      icon: MessageSquare,
      tone: 'accent',
    })
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 lg:px-5">
        <button
          type="button"
          onClick={onOpenMobile}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink lg:hidden"
          aria-label="打开导航"
        >
          <Menu size={18} />
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink lg:inline-flex"
          aria-label={collapsed ? '展开导航' : '收起导航'}
          title={collapsed ? '展开导航' : '收起导航'}
        >
          <PanelLeft size={16} />
        </button>

        <div className="hidden min-w-0 items-center gap-1.5 text-[12px] text-faint sm:flex">
          <span className="truncate">{state.company.name}</span>
          <ChevronRight size={12} className="shrink-0" />
          <span className={cn('truncate font-medium', inAdmin ? 'text-ink-soft' : 'text-ink-soft')}>
            {inAdmin ? '管理后台' : '员工工作台'}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden h-8 w-[248px] items-center gap-2 rounded-lg border border-line bg-raised px-2.5 text-left text-[12px] text-faint transition-colors hover:border-line-strong hover:bg-surface sm:flex xl:w-[288px]"
          >
            <Search size={14} className="shrink-0" />
            <span className="truncate">搜索助理、Skill、成员…</span>
            <kbd className="ml-auto rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-faint">
              Ctrl K
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink sm:hidden"
            aria-label="搜索"
          >
            <Search size={17} />
          </button>

          <span className="mx-1 hidden h-4 w-px bg-line md:block" />

          <span className="hidden items-center gap-1.5 rounded-md border border-line bg-raised px-2 py-1 text-[11px] text-muted md:inline-flex">
            <Server size={12} className="text-faint" />
            {state.company.plan}
          </span>

          <PopoverPrimitive.Root open={noticeOpen} onOpenChange={setNoticeOpen}>
            <PopoverPrimitive.Trigger asChild>
              <button
                type="button"
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink"
                aria-label={`通知${notices.length > 0 ? `，${notices.length} 条待处理` : ''}`}
              >
                <Bell size={17} />
                {notices.length > 0 && (
                  <span className="absolute right-[7px] top-[7px] h-1.5 w-1.5 rounded-full bg-danger ring-2 ring-surface" />
                )}
              </button>
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
              <PopoverPrimitive.Content
                align="end"
                sideOffset={8}
                className="z-[70] w-[min(344px,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-pop data-[state=open]:animate-scale-in"
              >
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <div className="text-[13px] font-semibold text-ink">通知</div>
                  <div className="text-[11px] text-faint">{notices.length} 条待处理</div>
                </div>
                {notices.length === 0 ? (
                  <div className="flex flex-col items-center px-5 py-9 text-center">
                    <span className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-success-soft text-success">
                      <CircleCheck size={18} />
                    </span>
                    <div className="text-[13px] font-medium text-ink">都处理好了</div>
                    <div className="mt-0.5 text-xs text-muted">没有待审核或失败的运行。</div>
                  </div>
                ) : (
                  <div className="p-1.5">
                    {notices.map((notice) => (
                      <button
                        key={notice.id}
                        type="button"
                        onClick={() => {
                          setNoticeOpen(false)
                          navigate(notice.to)
                        }}
                        className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-sunken"
                      >
                        <span
                          className={cn(
                            'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                            toneClasses[notice.tone],
                          )}
                        >
                          <notice.icon size={14} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium text-ink">{notice.title}</span>
                          <span className="block text-[11px] leading-5 text-muted">
                            {notice.description}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setNoticeOpen(false)
                      navigate('/admin/runs')
                    }}
                    className="flex w-full items-center justify-center gap-1 border-t border-line bg-raised py-2 text-[11px] font-medium text-muted transition-colors hover:text-ink"
                  >
                    <LayoutDashboard size={12} /> 查看运行记录
                  </button>
                )}
              </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
          </PopoverPrimitive.Root>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  )
}
