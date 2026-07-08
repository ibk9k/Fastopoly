/**
 * Maps a tile index (0-39) to a CSS grid position on an 11×11 grid.
 *
 * Grid template: 1.5fr repeat(9, 1fr) 1.5fr
 *   Column/Row 1:    corner (1.5fr — naturally 1.5× the size)
 *   Columns/Rows 2-10: regular tiles (1fr each)
 *   Column/Row 11:   corner (1.5fr — naturally 1.5× the size)
 *
 * Every tile spans exactly 1 column × 1 row. The 1.5fr track sizing
 * makes corners visually 1.5× larger without any spanning.
 *
 * Returns 1-indexed { row, col }.
 */
export function tileIndexToGridPosition(index: number): {
  row: number
  col: number
  rowSpan: number
  colSpan: number
} {
  if (index < 0 || index > 39) {
    throw new RangeError('Tile index must be between 0 and 39')
  }

  // Bottom row: index 0 (Go) at bottom-right → index 10 (Jail) at bottom-left
  if (index <= 10) {
    return { row: 11, col: 11 - index, rowSpan: 1, colSpan: 1 }
  }

  // Left column: index 11 → 19 going up, index 20 (Free Parking) at top-left
  if (index <= 20) {
    return { row: 11 - (index - 10), col: 1, rowSpan: 1, colSpan: 1 }
  }

  // Top row: index 21 → 29 going right, index 30 (Go To Jail) at top-right
  if (index <= 30) {
    return { row: 1, col: (index - 20) + 1, rowSpan: 1, colSpan: 1 }
  }

  // Right column: index 31 → 39 going down
  return { row: (index - 30) + 1, col: 11, rowSpan: 1, colSpan: 1 }
}

/**
 * Converts a tile index to a fractional center position for PlayerToken overlay.
 *
 * Track weights: [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5]  → total weight = 12
 *
 * The center of each track (as a fraction of total board size):
 *   Col/Row 1:    center at 0.75/12
 *   Col/Row k (2–10): center at k/12
 *   Col/Row 11:   center at 11.25/12
 */
export function tileIndexToFractionalCenter(index: number): { x: number; y: number } {
  const pos = tileIndexToGridPosition(index)

  function trackCenter(trackIndex: number): number {
    if (trackIndex === 1) return 0.75 / 12
    if (trackIndex === 11) return 11.25 / 12
    return trackIndex / 12
  }

  return { x: trackCenter(pos.col), y: trackCenter(pos.row) }
}
