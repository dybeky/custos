import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'

interface QuickAccessItem {
  label: string
  path: string
}

interface RegistryItem {
  label: string
  path: string
}

interface TelegramBot {
  username: string
}

// Shimmering button component
function ShimmerButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <div className="relative group">
      {/* Animated gradient border */}
      <div
        className="absolute -inset-[1px] rounded-lg opacity-50 group-hover:opacity-100 transition-opacity animate-gradient-border"
        style={{
          background: 'linear-gradient(90deg, #c6a2e8, #515ef5, #c6a2e8)',
          backgroundSize: '200% auto',
        }}
      />
      <button
        onClick={onClick}
        className="relative w-full flex items-center gap-2 p-2 rounded-lg bg-background-surface hover:bg-background-elevated transition-colors text-left text-sm text-text-primary"
      >
        {children}
      </button>
    </div>
  )
}

export function Manual() {
  const { t } = useTranslation()

  // System Tools - matching original ManualView.xaml
  const systemTools: QuickAccessItem[] = [
    { label: 'Data Usage', path: 'ms-settings:datausage' },
    { label: 'Windows Defender', path: 'windowsdefender:' }
  ]

  // Folders - matching original ManualView.xaml
  const folders: QuickAccessItem[] = [
    { label: 'Videos', path: '%USERPROFILE%\\Videos' },
    { label: 'Downloads', path: '%USERPROFILE%\\Downloads' },
    { label: 'AppData', path: '%APPDATA%' },
    { label: 'LocalAppData', path: '%LOCALAPPDATA%' },
    { label: 'Prefetch', path: 'C:\\Windows\\Prefetch' },
    { label: 'OneDrive', path: '%USERPROFILE%\\OneDrive' }
  ]

  // Games - matching original ManualView.xaml
  const games: QuickAccessItem[] = [
    { label: 'Unturned', path: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Unturned' },
    { label: 'Steam', path: 'C:\\Program Files (x86)\\Steam' }
  ]

  // Registry - matching original ManualView.xaml
  const registryKeys: RegistryItem[] = [
    { label: 'MuiCache', path: 'HKCU\\SOFTWARE\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\MuiCache' },
    { label: 'AppSwitched', path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FeatureUsage\\AppSwitched' },
    { label: 'ShowJumpView', path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FeatureUsage\\ShowJumpView' },
    { label: 'AppBadgeUpdated', path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FeatureUsage\\AppBadgeUpdated' },
    { label: 'AppLaunch', path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FeatureUsage\\AppLaunch' },
    { label: 'RunMRU', path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RunMRU' },
    { label: 'UserAssist', path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\UserAssist' },
    { label: 'AppCompatFlags', path: 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers' },
    { label: 'Compatibility Assistant', path: 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Compatibility Assistant\\Store' }
  ]

  // Telegram Bots - matching original ManualView.xaml
  const telegramBots: TelegramBot[] = [
    { username: '@undeadsellerbot' },
    { username: '@MelonySolutionBot' }
  ]

  // Additional Resources - websites to check
  const additionalResources: { name: string; url: string }[] = [
    { name: 'Oplata.info', url: 'https://oplata.info' },
    { name: 'FunPay.com', url: 'https://funpay.com' }
  ]

  const handleOpenPath = (path: string) => {
    window.electronAPI.openPath(path)
  }

  const handleOpenExternal = (url: string) => {
    window.electronAPI.openExternal(url)
  }

  const handleOpenRegistry = async (path: string) => {
    const result = await window.electronAPI.openRegistry(path)
    if (!result.success && result.error) {
      console.error('Failed to open registry:', result.error)
    }
  }

  const folderIcon = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  )

  const toolIcon = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    </svg>
  )

  const gameIcon = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
    </svg>
  )

  const registryIcon = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  )

  const telegramIcon = (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
    </svg>
  )

  const globeIcon = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  )

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">{t('manual.title')}</h1>
          <p className="text-text-secondary mt-1">{t('manual.subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* System Tools */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="text-aurora-purple">{toolIcon}</span>
                {t('manual.systemTools')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {systemTools.map((item) => (
                  <ShimmerButton key={item.path} onClick={() => handleOpenPath(item.path)}>
                    {item.label}
                  </ShimmerButton>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Folders */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="text-aurora-blue">{folderIcon}</span>
                {t('manual.folders')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {folders.map((item) => (
                  <ShimmerButton key={item.path} onClick={() => handleOpenPath(item.path)}>
                    {item.label}
                  </ShimmerButton>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Games */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="text-success">{gameIcon}</span>
                {t('manual.games')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {games.map((item) => (
                  <ShimmerButton key={item.path} onClick={() => handleOpenPath(item.path)}>
                    {item.label}
                  </ShimmerButton>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Registry */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="text-aurora-purple">{registryIcon}</span>
                {t('manual.registry')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-2">
                {registryKeys.map((item) => (
                  <ShimmerButton key={item.path} onClick={() => handleOpenRegistry(item.path)}>
                    {item.label}
                  </ShimmerButton>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Telegram Bots */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="text-[#0088cc]">{telegramIcon}</span>
                {t('manual.telegramCheatBots')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {telegramBots.map((bot) => (
                  <ShimmerButton key={bot.username} onClick={() => handleOpenExternal(`https://t.me/${bot.username.replace('@', '')}`)}>
                    {bot.username}
                  </ShimmerButton>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Additional Resources */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="theme-text-primary">{globeIcon}</span>
                {t('manual.additionalResources')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {additionalResources.map((resource) => (
                  <ShimmerButton key={resource.url} onClick={() => handleOpenExternal(resource.url)}>
                    {resource.name}
                  </ShimmerButton>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
