import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { useScanStore } from '../stores/scan-store'

export function Results() {
  const { t } = useTranslation()
  const { results, status } = useScanStore()
  const [expandedScanner, setExpandedScanner] = useState<string | null>(null)

  const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0)
  const hasResults = results.length > 0

  const handleExport = () => {
    const content = results
      .map(r => {
        const header = `=== ${r.scannerName} ===`
        const findings = r.findings.length > 0
          ? r.findings.join('\n')
          : 'No findings'
        return `${header}\n${findings}`
      })
      .join('\n\n')

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `custos-scan-${new Date().toISOString().split('T')[0]}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Summary Card */}
        <Card className="mb-6">
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                  totalFindings > 0 ? 'bg-error/10' : 'bg-success/10'
                }`}>
                  {totalFindings > 0 ? (
                    <svg className="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-text-primary">
                    {t('results.scanResults')}
                  </h2>
                  <p className={`text-sm ${totalFindings > 0 ? 'text-error' : 'text-success'}`}>
                    {totalFindings > 0
                      ? `${totalFindings} ${t('results.threatsFound')}`
                      : t('results.noThreatsFound')}
                  </p>
                </div>
              </div>
              {hasResults && (
                <Button variant="secondary" onClick={handleExport}>
                  {t('results.exportResults')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results List */}
        {!hasResults ? (
          <Card>
            <CardContent className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-text-muted mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-text-secondary">
                {status === 'idle' ? 'Run a scan to see results' : 'No results yet'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {results.map((result, index) => (
              <motion.div
                key={result.scannerName}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card
                  className="cursor-pointer hover:border-border-hover transition-colors"
                  onClick={() => setExpandedScanner(
                    expandedScanner === result.scannerName ? null : result.scannerName
                  )}
                >
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          result.hasFindings ? 'bg-error/10 text-error' : 'bg-success/10 text-success'
                        }`}>
                          {result.hasFindings ? (
                            <span className="text-sm font-bold">{result.findings.length}</span>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-primary">{result.scannerName}</p>
                          <p className="text-xs text-text-muted">
                            {result.duration}ms
                          </p>
                        </div>
                      </div>
                      <motion.svg
                        animate={{ rotate: expandedScanner === result.scannerName ? 180 : 0 }}
                        className="w-5 h-5 text-text-muted"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </motion.svg>
                    </div>

                    <AnimatePresence>
                      {expandedScanner === result.scannerName && result.findings.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4 pt-4 border-t border-border"
                        >
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {result.findings.map((finding, i) => (
                              <div
                                key={i}
                                className="text-xs text-text-secondary bg-background/50 p-2 rounded-lg break-all font-mono"
                              >
                                {finding}
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}
