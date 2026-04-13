import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

const MAX = 5

function clampRating(rating: number): number {
  const n = Math.round(Number(rating))
  return Math.min(MAX, Math.max(0, Number.isFinite(n) ? n : 0))
}

export function FeedbackRatingStars({
  rating,
  className,
  size = 'md',
}: {
  rating: number
  className?: string
  /** sm: cards/lists; md: tables */
  size?: 'sm' | 'md'
}) {
  const n = clampRating(rating)
  const sizeClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  return (
    <div
      className={cn('inline-flex items-center gap-0.5', className)}
      role="img"
      aria-label={`Rating ${n} out of ${MAX}`}
    >
      {Array.from({ length: MAX }, (_, i) => {
        const filled = i < n
        return (
          <Star
            key={i}
            className={cn(
              sizeClass,
              'shrink-0 transition-colors',
              filled
                ? 'fill-amber-400 text-amber-500'
                : 'fill-transparent text-amber-200',
            )}
            strokeWidth={1.6}
          />
        )
      })}
    </div>
  )
}
