/**
 * The signature identity motif: a strip of the eight property-group pastels,
 * pinned to a screen edge. Shared by every page so the app reads as one game.
 */
const GROUP_PASTELS = [
  '#C2A691', // brown
  '#A8DADC', // light blue
  '#F1A7C4', // pink
  '#FBC490', // orange
  '#E5989B', // red
  '#F9E076', // yellow
  '#A3C9A8', // green
  '#90B0D9', // dark blue
]

export default function PropertyStrip({ position }: { position: 'top' | 'bottom' }) {
  return (
    <div
      aria-hidden
      className={`absolute left-0 right-0 z-panel flex h-3 ${
        position === 'top' ? 'top-0 shadow-sm' : 'bottom-0 shadow-inner'
      }`}
    >
      {GROUP_PASTELS.map((color, index) => (
        <div key={index} className="flex-1" style={{ backgroundColor: color }} />
      ))}
    </div>
  )
}
