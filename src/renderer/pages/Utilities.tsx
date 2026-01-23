import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'

interface Utility {
  name: string
  descKey: string
  url: string
  icon: string
}

const utilities: Utility[] = [
  {
    name: 'LastActivityView',
    descKey: 'utilities.lastActivityViewDesc',
    url: 'https://www.nirsoft.net/utils/computer_activity_view.html',
    icon: '📋'
  },
  {
    name: 'USBDeview',
    descKey: 'utilities.usbDeviewDesc',
    url: 'https://www.nirsoft.net/utils/usb_devices_view.html',
    icon: '🔌'
  },
  {
    name: 'Everything',
    descKey: 'utilities.everythingDesc',
    url: 'https://www.voidtools.com/',
    icon: '🔍'
  },
  {
    name: 'System Informer',
    descKey: 'utilities.systemInformerDesc',
    url: 'https://systeminformer.sourceforge.io/',
    icon: '⚙️'
  }
]

export function Utilities() {
  const { t } = useTranslation()

  const handleOpenUrl = (url: string) => {
    window.electronAPI.openExternal(url)
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">{t('utilities.title')}</h1>
          <p className="text-text-secondary mt-1">{t('utilities.subtitle')}</p>
        </div>

        {/* Utilities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {utilities.map((utility, index) => (
            <motion.div
              key={utility.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="h-full">
                <CardContent>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-background-elevated flex items-center justify-center text-2xl shrink-0">
                      {utility.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-text-primary mb-1">
                        {utility.name}
                      </h3>
                      <p className="text-sm text-text-secondary mb-4">
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
            </motion.div>
          ))}
        </div>

      </motion.div>
    </div>
  )
}
