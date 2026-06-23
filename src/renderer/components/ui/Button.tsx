import { ButtonHTMLAttributes, forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../utils/cn'

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'oauth'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  loadingText?: string
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-scan text-on-accent font-display font-bold hover:-translate-y-0.5 hover:shadow-glow active:opacity-80',
  secondary: 'bg-panel text-ink border border-[color:var(--line)] hover:bg-panel-2 active:opacity-80',
  outline: 'border border-scan text-scan bg-transparent hover:bg-scan hover:text-on-accent active:opacity-80',
  danger: 'bg-alert/10 text-alert border border-alert/30 hover:bg-alert/20 active:opacity-80',
  ghost: 'text-ink-dim hover:text-ink hover:bg-panel-2 active:bg-panel',
  oauth: 'rounded-xl border border-[color:var(--line-strong)] bg-bg text-ink hover:border-scan hover:text-scan active:opacity-80'
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg',
  md: 'h-10 px-4 text-sm rounded-xl',
  lg: 'h-12 px-6 text-base rounded-xl'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      loadingText,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const { t } = useTranslation()
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-colors duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-scan/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant],
          sizes[size],
          className
        )}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        aria-disabled={disabled || isLoading}
        aria-label={ariaLabel}
        {...props}
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="sr-only">{t('general.loading')}</span>
            {loadingText || children}
          </>
        ) : leftIcon ? (
          <span className="mr-2" aria-hidden="true">{leftIcon}</span>
        ) : null}
        {!isLoading && children}
        {rightIcon && !isLoading && <span className="ml-2" aria-hidden="true">{rightIcon}</span>}
      </button>
    )
  }
)

Button.displayName = 'Button'
