import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { useScanStore } from '../../stores/scan-store'
import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'

interface NavItem {
  path: string
  icon: React.ReactNode
  labelKey: string
}

interface ExternalLink {
  url: string
  icon: React.ReactNode
  label: string
}

const externalLinks: ExternalLink[] = [
  {
    url: 'https://dybeky.github.io/cobraservers/',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
    label: 'WEB'
  },
  {
    url: 'https://dybeky.github.io/obzvon/',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
    label: 'OBZVON'
  }
]

const navItems: NavItem[] = [
  {
    path: '/',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    labelKey: 'nav.dashboard'
  },
  {
    path: '/scan',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    labelKey: 'nav.scan'
  },
  {
    path: '/results',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    labelKey: 'nav.results'
  },
  {
    path: '/manual',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
    labelKey: 'nav.manual'
  },
  {
    path: '/utilities',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    labelKey: 'nav.utilities'
  },
  {
    path: '/settings',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
    labelKey: 'nav.settings'
  }
]

// Tooltip component that renders via portal
function Tooltip({ label, targetRect }: { label: string; targetRect: DOMRect | null }) {
  if (!targetRect) return null

  return createPortal(
    <motion.div
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed px-3 py-1.5 bg-background-elevated text-text-primary text-xs font-medium rounded-lg whitespace-nowrap shadow-lg border border-border pointer-events-none"
      style={{
        zIndex: 99999,
        left: targetRect.right + 12,
        top: targetRect.top + targetRect.height / 2,
        transform: 'translateY(-50%)',
      }}
    >
      {label}
    </motion.div>,
    document.body
  )
}

export function Sidebar() {
  const { t } = useTranslation()
  const { status, results } = useScanStore()
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [hoveredExternal, setHoveredExternal] = useState<string | null>(null)
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null)
  const itemRefs = useRef<Map<string, HTMLAnchorElement>>(new Map())
  const externalRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0)

  const handleMouseEnter = (path: string, element: HTMLAnchorElement) => {
    setHoveredItem(path)
    setTooltipRect(element.getBoundingClientRect())
  }

  const handleMouseLeave = () => {
    setHoveredItem(null)
    setHoveredExternal(null)
    setTooltipRect(null)
  }

  const handleExternalMouseEnter = (url: string, element: HTMLButtonElement) => {
    setHoveredExternal(url)
    setTooltipRect(element.getBoundingClientRect())
  }

  const handleOpenExternal = (url: string) => {
    window.electronAPI.openExternal(url)
  }

  return (
    <>
      <nav className="w-16 min-w-16 bg-background-surface/50 backdrop-blur-sm border-r border-border flex flex-col py-4 relative">
        <div className="flex-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            ref={(el) => {
              if (el) itemRefs.current.set(item.path, el)
            }}
            className={({ isActive }) =>
              `group relative flex items-center justify-center py-3 mx-2 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-secondary hover:bg-white/10 hover:text-text-primary'
              }`
            }
            onMouseEnter={(e) => handleMouseEnter(item.path, e.currentTarget)}
            onMouseLeave={handleMouseLeave}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="sidebar-indicator"
                    className="absolute left-0 w-1 h-8 bg-primary rounded-r-full"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}

                {/* Icon with hover scale animation */}
                <motion.span
                  className="relative"
                  animate={{
                    scale: hoveredItem === item.path ? 1.15 : 1
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  {item.icon}
                  {/* Badge for results */}
                  {item.path === '/results' && totalFindings > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-error text-white text-2xs font-bold rounded-full flex items-center justify-center">
                      {totalFindings > 9 ? '9+' : totalFindings}
                    </span>
                  )}
                  {/* Scanning indicator */}
                  {item.path === '/scan' && status === 'scanning' && (
                    <span className="absolute -top-1 -right-1 w-3 h-3">
                      <span className="absolute w-full h-full bg-primary rounded-full animate-ping opacity-75" />
                      <span className="absolute w-full h-full bg-primary rounded-full" />
                    </span>
                  )}
                </motion.span>
              </>
            )}
          </NavLink>
        ))}
        </div>

        {/* External Links */}
        <div className="border-t border-border pt-4 mt-2">
          {externalLinks.map((link) => (
            <button
              key={link.url}
              ref={(el) => {
                if (el) externalRefs.current.set(link.url, el)
              }}
              onClick={() => handleOpenExternal(link.url)}
              onMouseEnter={(e) => handleExternalMouseEnter(link.url, e.currentTarget)}
              onMouseLeave={handleMouseLeave}
              className="group relative flex items-center justify-center py-3 mx-2 rounded-xl transition-all duration-200 text-text-secondary hover:bg-white/10 hover:text-text-primary w-12"
            >
              <motion.span
                className="relative"
                animate={{
                  scale: hoveredExternal === link.url ? 1.15 : 1
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                {link.icon}
              </motion.span>
            </button>
          ))}
        </div>
      </nav>

      {/* Tooltip rendered via portal to ensure it's on top */}
      {hoveredItem && (
        <Tooltip
          label={t(navItems.find(item => item.path === hoveredItem)?.labelKey || '')}
          targetRect={tooltipRect}
        />
      )}
      {hoveredExternal && (
        <Tooltip
          label={externalLinks.find(link => link.url === hoveredExternal)?.label || ''}
          targetRect={tooltipRect}
        />
      )}
    </>
  )
}
