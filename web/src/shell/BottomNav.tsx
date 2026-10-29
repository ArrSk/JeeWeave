import { useEffect, useId, useRef, useState } from 'react'
import { GridIcon } from '@jeeweave/ui'
import { useModules } from '../ModuleContext'
import { useUiStore } from '../store'
import { modules } from '../modules'
import type { ModuleId } from '@jeeweave/data'
import { CloseButton } from './CloseButton'

/** Same destinations on desktop and phone, with navigation appropriate to space. */
export function BottomNav({ activeId }: { activeId: ModuleId }) {
  const { isEnabled } = useModules()
  const { setActiveModuleId, setView } = useUiStore()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const dialogId = useId()
  const enabled = modules.filter(module => isEnabled(module.id as ModuleId))
  const current = modules.find(module => module.id === activeId)
  const select = (id: string) => {
    setOpen(false)
    if (id === activeId) return
    setActiveModuleId(id)
    if (id === 'today' || id === 'timetable') setView(id)
  }
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      dialog.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus()
    } else if (!open && dialog.open) dialog.close()
  }, [open])

  return <>
    <aside className={'web-sidebar' + (collapsed ? ' is-collapsed' : '')}>
      <div className="web-wordmark"><strong>JeeWeave <span>· 几微</span></strong></div>
      <button type="button" className="web-sidebar-toggle" aria-expanded={!collapsed} aria-label={collapsed ? '展开侧栏' : '收起侧栏'} onClick={() => setCollapsed(!collapsed)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></svg>
        <span>收起侧栏</span>
      </button>
      <nav aria-label="工作区导航" className="web-sidebar-links">
        {enabled.map(module => <button key={module.id} type="button" title={module.title} aria-label={module.title} aria-current={module.id === activeId ? 'page' : undefined} onClick={() => select(module.id)}><module.icon className="h-5 w-5" /><span>{module.title}</span></button>)}
      </nav>
      <p className="web-local-caption">保存在此设备<br />可从设置备份与导出</p>
    </aside>
    <nav aria-label="功能导航" className="web-mobile-nav">
      {enabled.filter(module => ['today', 'timetable', 'agenda'].includes(module.id)).map(module => <button key={module.id} type="button" aria-current={module.id === activeId ? 'page' : undefined} onClick={() => select(module.id)}><module.icon className="h-5 w-5" /><span>{module.title}</span></button>)}
      <button type="button" aria-label={`更多功能，当前${current?.title || ''}`} aria-haspopup="dialog" aria-controls={dialogId} aria-expanded={open} onClick={() => setOpen(true)}><GridIcon className="h-5 w-5" /><span>更多</span></button>
    </nav>
    <dialog ref={dialogRef} id={dialogId} aria-labelledby={`${dialogId}-title`} className="module-picker" onClose={() => setOpen(false)} onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <div className="module-picker-panel rounded-t-2xl bg-surface p-5 sm:rounded-2xl">
        <div className="sheet-scroll-header -mx-5 mb-4 flex items-center justify-between gap-3 px-5"><h2 id={`${dialogId}-title`} className="text-base font-semibold">所有功能</h2><CloseButton onClose={() => setOpen(false)} /></div>
        <div className="web-module-list">{enabled.map(module => <button key={module.id} type="button" aria-current={module.id === activeId ? 'page' : undefined} onClick={() => select(module.id)}><module.icon className="h-5 w-5" /><span>{module.title}</span></button>)}</div>
        <p className="mt-4 text-sm text-muted">在设置中管理功能。已关闭的功能保留原数据。</p>
      </div>
    </dialog>
  </>
}