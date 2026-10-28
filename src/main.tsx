import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { StoreProvider } from './lib/store'
import { ToastViewport } from './components/ui/toast'
import { TooltipProvider } from './components/ui/tooltip'
import './index.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('TeamOS 缺少根节点 #root')
}

createRoot(root).render(
  <StrictMode>
    <StoreProvider>
      <TooltipProvider delayDuration={300}>
        <App />
        <ToastViewport />
      </TooltipProvider>
    </StoreProvider>
  </StrictMode>,
)
