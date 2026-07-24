'use client'

import { useEffect, useState } from 'react'
import { useEventListener } from '@/lib/liveblocks.config'

type AnimatedCardState = {
  text: string
  cardType: 'chance' | 'community'
  startX: number
  startY: number
  visible: boolean
  isAnimating: boolean
}

/**
 * The "drawn card flies out of the deck" moment. Listens for CARD_DRAWN room
 * events itself, so the board only has to mount it once.
 */
export default function FlyingCard() {
  const [card, setCard] = useState<AnimatedCardState | null>(null)

  useEventListener(({ event }) => {
    if (event.type !== 'CARD_DRAWN') return
    const deckId = event.cardType === 'chance' ? 'chance-deck-btn' : 'community-chest-deck-btn'
    const el = document.getElementById(deckId)
    let startX = window.innerWidth / 2
    let startY = window.innerHeight / 2
    if (el) {
      const rect = el.getBoundingClientRect()
      startX = rect.left + rect.width / 2
      startY = rect.top + rect.height / 2
    }
    setCard({ text: event.text, cardType: event.cardType, startX, startY, visible: true, isAnimating: false })
  })

  useEffect(() => {
    if (!card) return

    let animationTimeout: ReturnType<typeof setTimeout> | undefined
    if (!card.isAnimating && card.visible) {
      animationTimeout = setTimeout(() => {
        setCard((prev) => (prev ? { ...prev, isAnimating: true } : null))
      }, 50)
    }

    const dismissTimeout = setTimeout(() => {
      setCard((prev) => (prev ? { ...prev, visible: false } : null))
    }, 6000)

    return () => {
      if (animationTimeout) clearTimeout(animationTimeout)
      clearTimeout(dismissTimeout)
    }
  }, [card])

  if (!card || !card.visible) return null

  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
  const winHeight = typeof window !== 'undefined' ? window.innerHeight : 1000
  const isChance = card.cardType === 'chance'

  return (
    <div
      className={`fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
        card.isAnimating ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onClick={() => setCard((prev) => (prev ? { ...prev, visible: false } : null))}
    >
      <div
        role="dialog"
        aria-label={`${isChance ? 'Chance' : 'Community Chest'} card`}
        className="relative flex h-[360px] w-[260px] max-w-[85vw] select-none flex-col items-center justify-between rounded-[16px] border-[6px] bg-parchment-raised p-6 text-center shadow-overlay transition-all duration-[850ms] ease-[cubic-bezier(0.175,0.885,0.32,1.275)]"
        style={{
          borderColor: isChance ? '#F89E6C' : '#6CA5FC',
          left: card.isAnimating ? '0px' : `${card.startX - winWidth / 2}px`,
          top: card.isAnimating ? '0px' : `${card.startY - winHeight / 2}px`,
          transform: card.isAnimating ? 'scale(1) rotate(720deg)' : 'scale(0.08) rotate(0deg)',
          transformOrigin: 'center center',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={`flex w-full items-center justify-center gap-1.5 rounded-md border border-black/5 px-3 py-2 text-[11px] font-black uppercase tracking-widest ${
            isChance
              ? 'bg-gradient-to-r from-[#FEDEC9] to-[#FCB78F] text-[#7F3D17]'
              : 'bg-gradient-to-r from-[#CFE2FE] to-[#A2C8FD] text-[#204A87]'
          }`}
        >
          {isChance ? 'Chance' : 'Community Chest'}
        </div>

        <div className="relative flex flex-1 items-center justify-center px-2 py-4">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex select-none items-center justify-center text-[100px] font-black opacity-[0.05]"
            style={{ color: isChance ? '#F89E6C' : '#6CA5FC' }}
          >
            {isChance ? '?' : '$'}
          </div>
          <p className="relative z-10 text-[14px] font-extrabold leading-[1.4] text-zinc-800">{card.text}</p>
        </div>

        <button
          onClick={() => setCard((prev) => (prev ? { ...prev, visible: false } : null))}
          className={`w-full rounded-lg py-2 text-[12px] font-bold uppercase tracking-wider text-white shadow-md transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-pine ${
            isChance ? 'bg-[#FCB78F] hover:bg-[#F89E6C]' : 'bg-[#A2C8FD] hover:bg-[#6CA5FC]'
          }`}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
