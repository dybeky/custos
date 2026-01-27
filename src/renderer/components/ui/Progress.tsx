import { HTMLAttributes, forwardRef } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../utils/cn'

interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number
  max?: number
  variant?: 'default' | 'success' | 'warning' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

const variants = {
  default: 'theme-progress',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-error'
}

const sizes = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3'
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  (
    {
      className,
      value,
      max = 100,
      variant = 'default',
      size = 'md',
      showLabel = false,
      ...props
    },
    ref
  ) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        {showLabel && (
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-text-secondary">Progress</span>
            <span className="text-xs text-text-primary font-medium">
              {Math.round(percentage)}%
            </span>
          </div>
        )}
        <div
          className={cn(
            'w-full bg-background-elevated rounded-full overflow-hidden',
            sizes[size]
          )}
        >
          <motion.div
            className={cn('h-full rounded-full', variants[variant])}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
      </div>
    )
  }
)

Progress.displayName = 'Progress'

// Circular progress variant
interface CircularProgressProps {
  value: number
  size?: number
  strokeWidth?: number
  variant?: 'default' | 'success' | 'warning' | 'danger'
}

const circularVariants = {
  default: 'theme-stroke',
  success: 'stroke-success',
  warning: 'stroke-warning',
  danger: 'stroke-error'
}

export function CircularProgress({
  value,
  size = 48,
  strokeWidth = 4,
  variant = 'default'
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const percentage = Math.min(Math.max(value, 0), 100)
  const offset = circumference - (percentage / 100) * circumference

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background circle */}
      <circle
        className="stroke-background-elevated"
        fill="none"
        strokeWidth={strokeWidth}
        r={radius}
        cx={size / 2}
        cy={size / 2}
      />
      {/* Progress circle */}
      <motion.circle
        className={cn('transition-all duration-300', circularVariants[variant])}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        r={radius}
        cx={size / 2}
        cy={size / 2}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        style={{
          strokeDasharray: circumference
        }}
      />
    </svg>
  )
}
