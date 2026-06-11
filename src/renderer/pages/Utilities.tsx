import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { InfoTip } from '../components/ui/InfoTip'
import { featureHelp } from '../utils/feature-i18n'

interface Utility {
  name: string
  /** Capability/feature id — keys the InfoTip explanation (features.<id>.help). */
  featureId: string
  descKey: string
  url: string
  icon: React.ReactNode
}

const iconProps = {
  className: 'w-6 h-6',
  fill: 'none',
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  strokeWidth: 1.5
} as const

const utilities: Utility[] = [
  {
    name: 'LastActivityView',
    featureId: 'tool-lastactivityview',
    descKey: 'utilities.lastActivityViewDesc',
    url: 'https://www.nirsoft.net/utils/computer_activity_view.html',
    icon: (
      <svg {...iconProps}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    )
  },
  {
    name: 'USBDeview',
    featureId: 'tool-usbdeview',
    descKey: 'utilities.usbDeviewDesc',
    url: 'https://www.nirsoft.net/utils/usb_devices_view.html',
    icon: (
      <svg {...iconProps}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    )
  },
  {
    name: 'Everything',
    featureId: 'tool-everything',
    descKey: 'utilities.everythingDesc',
    url: 'https://www.voidtools.com/',
    icon: (
      <svg {...iconProps}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    )
  },
  {
    name: 'System Informer',
    featureId: 'tool-systeminformer',
    descKey: 'utilities.systemInformerDesc',
    url: 'https://systeminformer.sourceforge.io/',
    icon: (
      <svg {...iconProps}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )
  },
  {
    name: 'ShellBag Analyzer & Cleaner',
    featureId: 'tool-shellbaganalyzer',
    descKey: 'utilities.shellbagAnalyzerDesc',
    url: 'https://privazer.com/en/download-shellbag-analyzer-shellbag-cleaner.php',
    icon: (
      <svg {...iconProps}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    )
  }
]

export function Utilities() {
  const { t } = useTranslation()

  const handleOpenUrl = (url: string) => {
    window.electronAPI.openExternal(url)
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ink font-display">{t('utilities.title')}</h1>
          <p className="text-ink-dim mt-1">{t('utilities.subtitle')}</p>
        </div>

        {/* Utilities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {utilities.map((utility, index) => (
            <div
              key={utility.name}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <Card className="h-full">
                <CardContent>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-scan/10 text-scan flex items-center justify-center shrink-0">
                      {utility.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-ink">
                          {utility.name}
                        </h3>
                        <InfoTip title={utility.name} text={featureHelp(t, utility.featureId)} />
                      </div>
                      <p className="text-sm text-ink-dim mb-4">
                        {t(utility.descKey)}
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenUrl(utility.url)}
                      >
                        {t('utilities.openWebsite')}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
