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
    url: 'https://97437.dev',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
    label: 'WEB'
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
    path: '/live',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-1" />
      </svg>
    ),
    labelKey: 'nav.liveScan'
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
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.05 4.575a1.575 1.575 0 10-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 013.15 0v1.5m-3.15 0l.075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 013.15 0V15M6.9 7.575a1.575 1.575 0 10-3.15 0v8.175a6.75 6.75 0 006.75 6.75h2.018a5.25 5.25 0 003.712-1.538l1.732-1.732a5.25 5.25 0 001.538-3.712l.003-2.024a.668.668 0 01.198-.471 1.575 1.575 0 10-2.228-2.228 3.818 3.818 0 00-1.12 2.687M6.9 7.575V12m6.27 4.318A4.49 4.49 0 0116.35 15m.39 0a4.49 4.49 0 011.518.111" />
      </svg>
    ),
    labelKey: 'nav.manual'
  },
  {
    path: '/utilities',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
      </svg>
    ),
    labelKey: 'nav.utilities'
  },
  {
    path: '/settings',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
      className="fixed px-3 py-1.5 bg-panel-2 text-ink text-xs font-medium rounded-lg whitespace-nowrap shadow-lg border border-[color:var(--line-strong)] pointer-events-none"
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
      <nav className="w-16 min-w-16 bg-panel border-r border-[color:var(--line)] flex flex-col py-4 relative">
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
                  ? 'bg-scan/10 text-scan'
                  : 'text-ink-dim hover:text-ink hover:bg-panel-2'
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
                    className="absolute left-0 w-1 h-8 bg-scan rounded-r-full shadow-glow"
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
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-alert text-bg text-2xs font-bold rounded-full flex items-center justify-center">
                      {totalFindings > 9 ? '9+' : totalFindings}
                    </span>
                  )}
                  {/* Scanning indicator */}
                  {item.path === '/scan' && status === 'scanning' && (
                    <span className="absolute -top-1 -right-1 w-3 h-3">
                      <span className="absolute w-full h-full bg-scan rounded-full animate-ping opacity-75" />
                      <span className="absolute w-full h-full bg-scan rounded-full" />
                    </span>
                  )}
                </motion.span>
              </>
            )}
          </NavLink>
        ))}
        </div>

        {/* External Links */}
        <div className="border-t border-[color:var(--line)] pt-4 mt-2">
          {externalLinks.map((link) => (
            <button
              key={link.url}
              ref={(el) => {
                if (el) externalRefs.current.set(link.url, el)
              }}
              onClick={() => handleOpenExternal(link.url)}
              onMouseEnter={(e) => handleExternalMouseEnter(link.url, e.currentTarget)}
              onMouseLeave={handleMouseLeave}
              className="group relative flex items-center justify-center py-3 mx-2 rounded-xl transition-all duration-200 text-ink-dim hover:text-ink hover:bg-panel-2 w-12"
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
