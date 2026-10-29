/**
 * 应用外壳。
 *
 * 职责被刻意压到最小：**只负责"当前模块是什么、渲染它、显示全局提示"**。
 * 具体页面管理业务控件，外壳统一管理功能导航和页面过渡。
 *
 * 布局约束：整页高度锁死；宽屏侧栏、窄屏底部导航，模块内部滚动。
 *
 * 主题：**跟随系统**，不提供手动切换入口（`useTheme` 仍会读取系统偏好并应用）。
 */
import { modules } from './modules'
import { useUiStore } from './store'
import { useTheme } from './lib/useTheme'
import { useModules } from './ModuleContext'
import type { ModuleId } from '@jeeweave/data'
import { BottomNav } from './shell/BottomNav'

export function App() {
  const { activeModuleId, toasts } = useUiStore()
  const { isEnabled } = useModules()
  // 只应用系统主题，不再渲染切换按钮
  useTheme()

  const active = modules.find((m) => m.id === activeModuleId && isEnabled(m.id as ModuleId))
    ?? modules.find((m) => isEnabled(m.id as ModuleId))
    ?? modules.find((m) => m.id === 'settings')
    ?? modules[0]
  if (!active) return null

  const ActivePage = active.render

  return (
    <div className="web-app-shell h-dvh overflow-hidden bg-canvas">
      {/* 模块占满剩余高度；模块内部自行决定哪里滚动 */}
      <main key={active.id} className="module-page web-main min-h-0">
        <ActivePage />
      </main>
      <BottomNav activeId={active.id as ModuleId} />

      {/* 全局提示：抬到底部页签之上，避免被遮住 */}
      <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              'pointer-events-auto rounded-lg px-3 py-2 text-xs text-white shadow-lg ' +
              (t.kind === 'error' ? 'bg-danger' : t.kind === 'success' ? 'bg-brand' : 'bg-ink')
            }
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
