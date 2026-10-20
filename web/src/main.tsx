import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { JeeWeaveProvider } from './JeeWeaveContext'
import { AppearanceProvider } from './shell/AppearanceContext'
import { ModuleProvider } from './ModuleContext'

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 容器')

createRoot(container).render(
  <StrictMode>
    <JeeWeaveProvider>
      <AppearanceProvider>
        <ModuleProvider><App /></ModuleProvider>
      </AppearanceProvider>
    </JeeWeaveProvider>
  </StrictMode>,
)
