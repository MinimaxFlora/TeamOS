import { Compass, Loader2, MessagesSquare } from 'lucide-react'
import {
  HashRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import { useStore } from './lib/store'
import { AppShell } from './components/layout/AppShell'
import { PageBody } from './components/layout/PageHeader'
import { Button } from './components/ui/button'
import { LoginPage } from './pages/LoginPage'
import { ChatPage } from './pages/workspace/ChatPage'
import { WorkspaceAgentsPage } from './pages/workspace/AgentsPage'
import { WorkspaceKnowledgePage } from './pages/workspace/KnowledgePage'
import { WorkspaceMeetingsPage } from './pages/workspace/MeetingsPage'
import { AdminDashboardPage } from './pages/admin/DashboardPage'
import { AdminAgentsPage } from './pages/admin/AgentsPage'
import { AgentEditorPage } from './pages/admin/AgentEditorPage'
import { AdminSkillsPage } from './pages/admin/SkillsPage'
import { AdminMembersPage } from './pages/admin/MembersPage'
import { AdminRunsPage } from './pages/admin/RunsPage'
import { AdminKnowledgePage } from './pages/admin/KnowledgePage'
import { AdminConnectorsPage } from './pages/admin/ConnectorsPage'
import { AdminSettingsPage } from './pages/admin/SettingsPage'

function RequireAuth() {
  const { currentUser } = useStore()
  if (!currentUser) return <Navigate to="/login" replace />
  return <Outlet />
}

function AdminGuard() {
  const { currentUser } = useStore()
  if (!currentUser) return <Navigate to="/login" replace />
  if (currentUser.role !== 'admin') return <Navigate to="/workspace/chat" replace />
  return <Outlet />
}

function NotFoundPage() {
  const navigate = useNavigate()
  const { currentUser } = useStore()
  return (
    <PageBody className="flex min-h-[60vh] max-w-[560px] flex-col items-center justify-center text-center">
      <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface text-muted shadow-card">
        <Compass size={22} strokeWidth={1.8} />
      </span>
      <h1 className="text-[20px] font-semibold text-ink">这个页面不存在</h1>
      <p className="mt-1 text-[13px] leading-5 text-muted">
        链接可能已经失效，或你的账号没有这个页面的访问入口。
      </p>
      <Button
        variant="primary"
        className="mt-5"
        onClick={() => navigate(currentUser ? '/workspace/chat' : '/login')}
      >
        <MessagesSquare size={14} /> 回到工作台
      </Button>
    </PageBody>
  )
}

export function App() {
  const { authReady } = useStore()
  if (!authReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f7f8fc]">
        <div className="flex flex-col items-center gap-3 text-muted">
          <Loader2 size={22} className="animate-spin text-[#5b5bd6]" />
          <span className="text-[12px]">正在连接 TeamOS…</span>
        </div>
      </div>
    )
  }
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/workspace/chat" replace />} />
            <Route path="/workspace" element={<Navigate to="/workspace/chat" replace />} />
            <Route path="/workspace/chat" element={<ChatPage />} />
            <Route path="/workspace/agents" element={<WorkspaceAgentsPage />} />
            <Route path="/workspace/knowledge" element={<WorkspaceKnowledgePage />} />
            <Route path="/workspace/meetings" element={<WorkspaceMeetingsPage />} />

            <Route path="/admin" element={<AdminGuard />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="agents" element={<AdminAgentsPage />} />
              <Route path="agents/:agentId" element={<AgentEditorPage />} />
              <Route path="skills" element={<AdminSkillsPage />} />
              <Route path="members" element={<AdminMembersPage />} />
              <Route path="runs" element={<AdminRunsPage />} />
              <Route path="knowledge" element={<AdminKnowledgePage />} />
              <Route path="connectors" element={<AdminConnectorsPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </HashRouter>
  )
}
