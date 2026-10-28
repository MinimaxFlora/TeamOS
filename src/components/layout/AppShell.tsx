import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const isChat = location.pathname.startsWith('/workspace/chat')

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      {mobileOpen && (
        <button
          type="button"
          aria-label="关闭导航"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-[#171a21]/30 backdrop-blur-[1px] lg:hidden"
        />
      )}
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onOpenMobile={() => setMobileOpen(true)}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          collapsed={collapsed}
        />
        <main
          className={cn(
            'min-h-0 flex-1',
            isChat ? 'overflow-hidden' : 'overflow-y-auto',
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
