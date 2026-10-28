import {
  BookOpen,
  Bot,
  Box,
  Cable,
  CalendarClock,
  History,
  LayoutDashboard,
  MessagesSquare,
  Search,
  Settings,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../lib/store'
import { cn } from '../../lib/utils'
import { Dialog, DialogContent } from '../ui/dialog'
import { AgentAvatar, Avatar } from '../ui/avatar'

interface CommandItem {
  id: string
  label: string
  hint: string
  group: string
  icon?: ReactNode
  run: () => void
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { state, currentUser } = useStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const isAdmin = currentUser?.role === 'admin'

  useEffect(() => {
    if (open) {
      setQuery('')
      window.setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const items = useMemo<CommandItem[]>(() => {
    const pages: CommandItem[] = [
      {
        id: 'p-chat',
        label: '消息',
        hint: '员工工作台',
        group: '页面',
        icon: <Search size={15} />,
        run: () => navigate('/workspace/chat'),
      },
      {
        id: 'p-agents',
        label: 'AI 助理目录',
        hint: '员工工作台',
        group: '页面',
        icon: <Bot size={15} />,
        run: () => navigate('/workspace/agents'),
      },
      {
        id: 'p-knowledge',
        label: '企业知识',
        hint: '员工工作台',
        group: '页面',
        icon: <BookOpen size={15} />,
        run: () => navigate('/workspace/knowledge'),
      },
      {
        id: 'p-meetings',
        label: '会议纪要',
        hint: '员工工作台',
        group: '页面',
        icon: <CalendarClock size={15} />,
        run: () => navigate('/workspace/meetings'),
      },
    ]
    if (isAdmin) {
      pages.push(
        {
          id: 'p-dashboard',
          label: '管理概览',
          hint: '管理后台',
          group: '页面',
          icon: <LayoutDashboard size={15} />,
          run: () => navigate('/admin'),
        },
        {
          id: 'p-admin-agents',
          label: 'AI 助理配置',
          hint: '管理后台',
          group: '页面',
          icon: <Bot size={15} />,
          run: () => navigate('/admin/agents'),
        },
        {
          id: 'p-skills',
          label: 'Skills 中心',
          hint: '管理后台',
          group: '页面',
          icon: <Box size={15} />,
          run: () => navigate('/admin/skills'),
        },
        {
          id: 'p-members',
          label: '成员与岗位',
          hint: '管理后台',
          group: '页面',
          icon: <UsersRound size={15} />,
          run: () => navigate('/admin/members'),
        },
        {
          id: 'p-admin-knowledge',
          label: '知识库管理',
          hint: '管理后台',
          group: '页面',
          icon: <BookOpen size={15} />,
          run: () => navigate('/admin/knowledge'),
        },
        {
          id: 'p-connectors',
          label: '渠道接入',
          hint: '管理后台',
          group: '页面',
          icon: <Cable size={15} />,
          run: () => navigate('/admin/connectors'),
        },
        {
          id: 'p-hall',
          label: '公司大厅',
          hint: '员工工作台',
          group: '页面',
          icon: <MessagesSquare size={15} />,
          run: () => navigate('/workspace/chat'),
        },
        {
          id: 'p-runs',
          label: '运行记录',
          hint: '管理后台',
          group: '页面',
          icon: <History size={15} />,
          run: () => navigate('/admin/runs'),
        },
        {
          id: 'p-settings',
          label: '公司设置',
          hint: '管理后台',
          group: '页面',
          icon: <Settings size={15} />,
          run: () => navigate('/admin/settings'),
        },
      )
    }

    const agentPool = isAdmin
      ? state.agents
      : state.agents.filter((agent) => agent.status === 'published')
    const agents: CommandItem[] = agentPool.map((agent) => ({
      id: `agent-${agent.id}`,
      label: agent.name,
      hint: `${agent.title} · ${agent.status === 'published' ? '已发布' : '草稿'}`,
      group: '助理',
      icon: <AgentAvatar icon={agent.icon} color={agent.color} size="xs" />,
      run: () =>
        navigate(
          isAdmin ? `/admin/agents/${agent.id}` : '/workspace/agents',
        ),
    }))

    const skills: CommandItem[] = isAdmin
      ? state.skills.map((skill) => ({
          id: `skill-${skill.id}`,
          label: skill.name,
          hint: `${skill.category} · v${skill.version}`,
          group: 'Skill',
          icon: <Box size={15} />,
          run: () => navigate(`/admin/skills?skill=${skill.id}`),
        }))
      : []

    const members: CommandItem[] = isAdmin
      ? state.members.map((member) => ({
          id: `member-${member.id}`,
          label: member.name,
          hint: `${member.jobTitle} · ${member.department}`,
          group: '成员',
          icon: <Avatar name={member.name} color={member.color} size="xs" />,
          run: () => navigate(`/admin/members?member=${member.id}`),
        }))
      : []

    return [...pages, ...agents, ...skills, ...members]
  }, [isAdmin, navigate, state.agents, state.members, state.skills])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items.filter((i) => i.group === '页面' || i.group === '助理').slice(0, 12)
    return items.filter((i) => `${i.label} ${i.hint} ${i.group}`.toLowerCase().includes(q)).slice(0, 18)
  }, [items, query])

  const groups = useMemo(() => {
    const map = new Map<string, CommandItem[]>()
    filtered.forEach((item) => {
      const list = map.get(item.group) ?? []
      list.push(item)
      map.set(item.group, list)
    })
    return Array.from(map.entries())
  }, [filtered])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" hideClose className="top-[18%] translate-y-0">
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search size={17} className="text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索页面、助理、Skill 或成员…"
            className="h-7 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 text-[10px] text-faint">
            ESC
          </kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {groups.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-muted">
              没有找到「{query}」相关的内容
            </div>
          ) : (
            groups.map(([group, groupItems]) => (
              <div key={group} className="mb-1.5">
                <div className="px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-faint">
                  {group}
                </div>
                {groupItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      item.run()
                      onOpenChange(false)
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                      'hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-none',
                    )}
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-raised text-muted">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {item.label}
                      </span>
                      <span className="block truncate text-[11px] text-muted">{item.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line bg-raised px-4 py-2 text-[11px] text-faint">
          <span>点击选择，Esc 关闭</span>
          <span>{filtered.length} 个结果</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
