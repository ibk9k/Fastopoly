'use client'

import type { Card } from '@/lib/game-engine/cards'
import { formatMoney } from '@/components/game/helpers'

type CardsListModalProps = {
  type: 'chance' | 'community_chest'
  cards: Card[]
  onClose: () => void
}

function getActionBadge(card: Card) {
  const { action } = card
  switch (action.type) {
    case 'move_to':
    case 'move_by':
    case 'move_to_nearest':
    case 'go_back':
      return {
        label: 'Move',
        className: 'bg-amber-50 text-amber-800 border-amber-200',
      }
    case 'collect':
    case 'collect_from_players':
      return {
        label: 'Collect',
        className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      }
    case 'pay':
    case 'pay_per_building':
      return {
        label: 'Pay',
        className: 'bg-rose-50 text-rose-800 border-rose-200',
      }
    case 'go_to_jail':
      return {
        label: 'Jail',
        className: 'bg-red-50 text-red-800 border-red-200',
      }
    case 'get_out_of_jail':
      return {
        label: 'Jail Free',
        className: 'bg-sky-50 text-sky-900 border-sky-200',
      }
    default:
      return {
        label: 'Action',
        className: 'bg-zinc-50 text-zinc-800 border-zinc-200',
      }
  }
}

export default function CardsListModal({ type, cards, onClose }: CardsListModalProps) {
  const isChance = type === 'chance'
  const title = isChance ? 'Chance Cards' : 'Community Chest Cards'

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/75 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-[#d28b7a] bg-[#F7F0E4] shadow-2xl shadow-black/30 transition-all duration-300 text-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar with gradient */}
        <div
          className="flex items-center justify-between px-6 py-5 rounded-t-2xl border-b border-[#e58a74]/30"
          style={{
            background: isChance
              ? 'linear-gradient(90deg, rgba(224,120,32,0.1) 0%, rgba(0,0,0,0) 100%)'
              : 'linear-gradient(90deg, rgba(30,77,140,0.1) 0%, rgba(0,0,0,0) 100%)',
          }}
        >
          <div className="flex items-center gap-3">
            {isChance ? (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e07820] bg-white/70 text-lg font-black text-[#e07820] shadow-sm">
                ?
              </span>
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#2a5a9a] bg-white/70 text-[#2a5a9a] shadow-sm">
                <svg viewBox="0 0 24 24" className="h-4 w-4">
                  <path fill="currentColor" d="M4 8h16v11H4V8Zm2 2v7h12v-7H6Zm3-5h6l2 3H7l2-3Z" />
                </svg>
              </span>
            )}
            <div>
              <h2 className="text-xl font-black text-zinc-900 leading-none">{title}</h2>
              <p className="mt-1 text-xs text-zinc-700 font-bold uppercase tracking-wider">
                {cards.length} cards in play
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 border border-[#d28b7a] text-zinc-800 transition hover:bg-white/40 hover:text-zinc-950 shadow-sm"
          >
            ✕
          </button>
        </div>

        {/* Card grid */}
        <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cards.map((card, i) => {
              const badge = getActionBadge(card)
              return (
                <div
                  key={card.id}
                  className="group flex flex-col justify-between rounded-xl border border-[#e58a74]/20 bg-white/50 p-4 transition-all duration-200 hover:border-[#d28b7a] hover:bg-white/70 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xs font-bold text-zinc-700">#{i + 1}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold leading-relaxed text-zinc-900">
                    {card.text}
                  </p>
                  <div className="mt-4 flex items-center justify-between border-t border-[#e58a74]/10 pt-2 text-[10px] text-zinc-500">
                    <span className="font-mono text-zinc-700">{card.id}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#e58a74]/30 bg-white/20 flex justify-end rounded-b-2xl">
          <button
            onClick={onClose}
            className="rounded-md border border-[#d28b7a] bg-white/20 px-4 py-2 text-sm font-bold text-zinc-800 hover:border-[#b86e5e] hover:bg-white/40 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
