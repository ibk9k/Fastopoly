'use client'

import { useEffect, useId, useRef } from 'react'

type ModalProps = {
  title: string
  onClose?: () => void
  children: React.ReactNode
  /** Max-width utility class for the dialog card. */
  width?: string
  /** Hide the built-in header when a bespoke one is rendered inside. */
  hideHeader?: boolean
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * The one dialog primitive: fixed z-modal layer, focus trap, Escape-to-close,
 * body scroll lock, and ARIA dialog semantics. Every overlay in the game
 * should sit on this instead of a bespoke fixed div.
 */
export default function Modal({ title, onClose, children, width = 'max-w-lg', hideHeader = false }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current

    // Initial focus goes to the first focusable control (or the dialog itself).
    const focusables = dialog?.querySelectorAll<HTMLElement>(FOCUSABLE)
    ;(focusables?.[0] ?? dialog)?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && onClose) {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    // Scroll lock while any modal is open.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown, true)
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/55 px-4 py-8"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hideHeader ? undefined : titleId}
        aria-label={hideHeader ? title : undefined}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className={`max-h-[90vh] w-full ${width} overflow-y-auto rounded-xl border-[3px] border-pine bg-parchment-raised p-5 shadow-overlay outline-none`}
      >
        {!hideHeader ? (
          <div className="mb-4 flex items-center justify-between gap-4 border-b border-salmon-line/30 pb-3">
            <h2 id={titleId} className="font-display text-xl uppercase tracking-wide text-pine">
              {title}
            </h2>
            {onClose ? (
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="rounded-md p-1.5 text-pine/60 transition-colors hover:bg-pine/5 hover:text-pine focus:outline-none focus-visible:ring-2 focus-visible:ring-pine"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  )
}
