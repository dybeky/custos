import { forwardRef } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../utils/cn'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  size?: 'sm' | 'md'
  label?: string
  description?: string
  className?: string
}

const sizes = {
  sm: {
    track: 'w-8 h-4',
    thumb: 'w-3 h-3',
    translate: 'translate-x-4'
  },
  md: {
    track: 'w-10 h-5',
    thumb: 'w-4 h-4',
    translate: 'translate-x-5'
  }
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  (
    {
      checked,
      onChange,
      disabled = false,
      size = 'md',
      label,
      description,
      className
    },
    ref
  ) => {
    const sizeStyles = sizes[size]

    return (
      <div className={cn('flex items-center justify-between', className)}>
        {(label || description) && (
          <div className="flex-1 mr-4">
            {label && (
              <span className="text-sm font-medium text-text-primary">{label}</span>
            )}
            {description && (
              <p className="text-xs text-text-secondary mt-0.5">{description}</p>
            )}
          </div>
        )}
        <button
          ref={ref}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={cn(
            'relative inline-flex shrink-0 cursor-pointer rounded-full transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            sizeStyles.track,
            checked ? 'bg-primary' : 'bg-background-elevated border border-border'
          )}
        >
          <motion.span
            className={cn(
              'pointer-events-none inline-block rounded-full bg-white shadow-lg',
              sizeStyles.thumb
            )}
            animate={{
              x: checked ? (size === 'md' ? 20 : 16) : 2,
              y: size === 'md' ? 2 : 2
            }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </button>
      </div>
    )
  }
)

Toggle.displayName = 'Toggle'
