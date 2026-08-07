import { getTile } from '@/lib/game-engine/board'
import { colorForGroup, propertyDisplayName } from '@/components/game/helpers'

/**
 * Human-readable names for the storage-level group keys. The keys are kebab-case
 * because they index `COLOR_GROUPS`; these are what a player actually calls them.
 */
const GROUP_LABELS: Record<string, string> = {
  brown: 'Brown',
  'light-blue': 'Light Blue',
  pink: 'Pink',
  orange: 'Orange',
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  'dark-blue': 'Dark Blue',
  railroad: 'Railroad',
  utility: 'Utility',
}

export function groupLabel(colorGroup: string | undefined): string {
  return colorGroup ? GROUP_LABELS[colorGroup] ?? colorGroup : 'Unowned'
}

/**
 * A deed named with its colour group shown.
 *
 * A bare name ("Atlantic Avenue") forces the reader to recall which group it
 * belongs to, which is the one thing that decides whether a trade is worth taking.
 * The band on the left answers that at a glance. The group name is not printed —
 * it repeated what the colour already said and crowded the row — but it stays in
 * the title and in screen-reader text, so the information is still reachable
 * without sight of the colour.
 */
export default function PropertyChip({
  propertyId,
  mortgaged = false,
  className = '',
}: {
  propertyId: string
  mortgaged?: boolean
  className?: string
}) {
  const tile = getTile(propertyId)
  const label = groupLabel(tile?.colorGroup)
  const name = propertyDisplayName(propertyId)

  return (
    <span
      title={`${name} — ${label}`}
      className={`inline-flex items-stretch overflow-hidden rounded-md border border-black/10 bg-white/80 shadow-sm ${className}`}
    >
      <span
        aria-hidden
        className="w-2.5 flex-none"
        style={{ backgroundColor: colorForGroup(tile?.colorGroup) }}
      />
      <span className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate font-semibold text-zinc-900">{name}</span>
        <span className="sr-only">{label} group</span>
        {mortgaged ? (
          <span className="flex-none rounded bg-danger-surface px-1.5 py-0.5 text-[9px] font-bold uppercase text-danger">
            Mortgaged
          </span>
        ) : null}
      </span>
    </span>
  )
}
