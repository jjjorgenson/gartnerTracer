import { Link, useLocation } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/timeline', label: 'Timeline' },
  { to: '/agent-log', label: 'Agent Log' },
  { to: '/docs', label: 'Docs' },
  { to: '/settings', label: 'Settings' },
] as const

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation()

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-full w-56 border-r border-[var(--color-border)] bg-[var(--color-bg-elevated)] transition-transform duration-200 ease-out lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      aria-label="Sidebar"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4">
        <span
          className="font-display text-lg font-semibold tracking-tight text-[var(--color-text)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Tracer
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)] lg:hidden"
          aria-label="Close menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <nav aria-label="Main navigation" className="flex flex-col gap-0.5 p-3">
        {navItems.map(({ to, label }) => {
          const isActive =
            location.pathname === to || (to !== '/' && location.pathname.startsWith(to))
          return (
            <Link
              key={to}
              to={to}
              onClick={onClose}
              className={`min-h-[44px] flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'link-on-accent bg-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)]'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
