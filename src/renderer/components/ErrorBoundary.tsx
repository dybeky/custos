import { Component, ErrorInfo, ReactNode } from 'react'
import i18next from 'i18next'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReload = (): void => {
    window.location.reload()
  }

  handleContinue = (): void => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="h-screen w-screen bg-bg flex items-center justify-center p-4">
          <div className="bg-panel border border-[color:var(--line)] glow-scan rounded-2xl p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-alert/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-alert" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h2 className="text-xl font-bold font-display text-ink mb-2">
              {i18next.t('errorBoundary.title')}
            </h2>

            <p className="text-ink-dim text-sm mb-4">
              {i18next.t('errorBoundary.message')}
            </p>

            {this.state.error && (
              <div className="bg-panel-2 rounded-xl p-3 mb-4 text-left">
                <p className="text-xs text-ink-dim font-mono break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              {this.props.onReset && (
                <button
                  onClick={this.handleContinue}
                  className="flex-1 py-3 px-4 bg-panel-2 hover:bg-panel-2/70 text-ink-dim hover:text-ink rounded-xl transition-colors font-medium"
                >
                  {i18next.t('errorBoundary.continue')}
                </button>
              )}
              <button
                onClick={this.handleReload}
                className="flex-1 py-3 px-4 bg-scan text-bg hover:shadow-glow font-medium rounded-xl transition-colors"
              >
                {i18next.t('errorBoundary.reload')}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
