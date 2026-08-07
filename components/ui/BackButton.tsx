'use client'

import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'

type BackButtonProps = {
  /**
   * Where to go. Defaults to the browser's history entry, falling back to home on a
   * fresh tab (a shared lobby link, for instance, has nothing to go back to).
   */
  href?: string
  label?: string
  className?: string
  /** Render as a round icon button; `label` becomes the accessible name only. */
  iconOnly?: boolean
  /** Return false to cancel the navigation (e.g. the player dismissed a confirm). */
  onBeforeNavigate?: () => boolean | void
}

/**
 * The one way out of a screen. Kept as a shared primitive because "how do I get
 * back" was answered differently on every page — profile and leaderboard had their
 * own inline links, the lobby screens had nothing at all.
 */
export default function BackButton({
  href,
  label = 'Back',
  className = '',
  iconOnly = false,
  onBeforeNavigate,
}: BackButtonProps) {
  const router = useRouter()

  const goBack = () => {
    if (onBeforeNavigate?.() === false) return
    if (href) {
      router.push(href)
      return
    }
    // history.length <= 1 means this tab opened straight onto the page — there is no
    // previous entry, and router.back() would strand the player on a blank screen.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/')
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={goBack}
      aria-label={label}
      title={iconOnly ? label : undefined}
      className={
        iconOnly ? `!rounded-full !px-2.5 !py-2 ${className}` : `gap-1.5 ${className}`
      }
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={iconOnly ? 'h-4 w-4' : 'h-3.5 w-3.5'}
      >
        {iconOnly ? (
          // Exit glyph: an arrow leaving a doorway. A back-chevron reads as "previous
          // screen", which is the wrong promise when the button drops a live game.
          <>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </>
        ) : (
          <path d="M15 18l-6-6 6-6" />
        )}
      </svg>
      {iconOnly ? null : label}
    </Button>
  )
}
