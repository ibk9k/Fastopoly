/* eslint-disable @next/next/no-img-element */
'use client'

import { useState, type CSSProperties } from 'react'
import type { Tile as BoardTile } from '@/lib/game-engine/board'
import type { PlayerView, PropertyView } from '@/components/game/helpers'
import { colorForGroup, formatMoney } from '@/components/game/helpers'
import { TileTooltip } from '@/components/game/PropertyDetailModal'

type GridPos = {
  row: number
  col: number
  rowSpan: number
  colSpan: number
}

type TileProps = {
  tile: BoardTile
  property?: PropertyView
  owner?: PlayerView
  gridPos: GridPos
  onClick?: () => void
}

const CORNER_INDICES = new Set([0, 10, 20, 30])

function colorStripStyle(tile: BoardTile): CSSProperties {
  const backgroundColor = colorForGroup(tile.colorGroup)
  if (!tile.colorGroup || tile.type === 'railroad' || tile.type === 'utility') return {}

  // Color strip on the edge closest to the outside of the board
  if (tile.index > 0 && tile.index < 10) return { backgroundColor, left: 0, right: 0, bottom: 0, height: 'var(--bar-size, 18px)' }       // bottom row → strip at bottom (outer edge)
  if (tile.index > 10 && tile.index < 20) return { backgroundColor, top: 0, bottom: 0, left: 0, width: 'var(--bar-size, 18px)' }         // left column → strip at left (outer edge)
  if (tile.index > 20 && tile.index < 30) return { backgroundColor, left: 0, right: 0, top: 0, height: 'var(--bar-size, 18px)' }         // top row → strip at top (outer edge)
  if (tile.index > 30 && tile.index < 40) return { backgroundColor, top: 0, bottom: 0, right: 0, width: 'var(--bar-size, 18px)' }        // right column → strip at right (outer edge)
  return {}
}

function tilePaddingStyle(tile: BoardTile): CSSProperties {
  if (!tile.colorGroup || tile.type === 'railroad' || tile.type === 'utility') return {}
  if (tile.index > 0 && tile.index < 10) return { paddingBottom: 'var(--bar-size, 18px)' }
  if (tile.index > 10 && tile.index < 20) return { paddingLeft: 'var(--bar-size, 18px)' }
  if (tile.index > 20 && tile.index < 30) return { paddingTop: 'var(--bar-size, 18px)' }
  if (tile.index > 30 && tile.index < 40) return { paddingRight: 'var(--bar-size, 18px)' }
  return {}
}

function getWatermarkSrc(tile: BoardTile): string | null {
  if (tile.type === 'go') return '/Go.png'
  if (tile.type === 'jail') return '/Jail.png'
  if (tile.type === 'go_to_jail') return '/GoToJail.png'
  if (tile.type === 'free_parking') return '/FreeParking.png'
  if (tile.type === 'railroad') return '/Railroad.png'
  if (tile.type === 'chance') return '/Chance.png'
  if (tile.type === 'community_chest') return '/Chest.png'

  if (tile.type === 'utility') {
    if (tile.id === 'electric-company') return '/Electric.png'
    if (tile.id === 'water-works') return '/Water.png'
  }

  if (tile.type === 'tax') {
    if (tile.id === 'income-tax') return '/Tax.png'
    if (tile.id === 'luxury-tax') return '/Ring.png'
  }

  return null
}

function getPastelTextColor(tile: BoardTile): string {
  if (tile.colorGroup) {
    switch (tile.colorGroup) {
      case 'brown': return '#60432F'         // Deep Pastel Brown
      case 'light-blue': return '#2A5A5C'    // Deep Pastel Ice Blue
      case 'pink': return '#8E3E60'          // Deep Pastel Rose Pink
      case 'orange': return '#9E5E22'        // Deep Pastel Orange
      case 'red': return '#8B3E41'           // Deep Pastel Salmon Red
      case 'yellow': return '#826A18'        // Deep Pastel Mustard
      case 'green': return '#2E4C33'         // Deep Pastel Sage Green
      case 'dark-blue': return '#2A4B7C'     // Deep Pastel Soft Blue
    }
  }

  switch (tile.type) {
    case 'go': return '#2E4C33'              // Deep Sage Green
    case 'jail':
    case 'go_to_jail':
      return '#4A7A96'                       // Deep Slate Blue
    case 'free_parking': return '#A05A5A'     // Deep Soft Red
    case 'chance': return '#B56576'          // Deep Rose
    case 'community_chest': return '#355C7D'  // Deep Teal Blue
    case 'railroad': return '#4A5759'        // Deep Charcoal
    case 'utility': return '#2A5A5C'         // Deep Teal
    case 'tax': return '#7B2C2D'             // Deep Red
    default: return '#3f3f46'
  }
}

export default function Tile({ tile, property, owner, gridPos, onClick }: TileProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const hasBuildings = Boolean(property && (property.houses > 0 || property.hotels > 0))
  const stripStyle = colorStripStyle(tile)
  const paddingStyle = tilePaddingStyle(tile)
  const watermarkSrc = getWatermarkSrc(tile)
  const isCorner = CORNER_INDICES.has(tile.index)
  const isPurchasable = tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility'

  const gridStyle: CSSProperties = {
    gridColumn: `${gridPos.col} / span ${gridPos.colSpan}`,
    gridRow: `${gridPos.row} / span ${gridPos.rowSpan}`,
  }

  // Combine owner border with 3D card shadow using container query units (cqw) for proportional scaling
  // Since cqw is now relative to .board-wrapper, 0.45cqw is about 3.6px on an 800px board
  const shadowValue = owner
    ? `inset 0 0 0 0.45cqw ${owner.color}, 0 2px 4px rgba(0,0,0,0.08), inset 0 -2px 0 rgba(0,0,0,0.05)`
    : '0 2px 4px rgba(0,0,0,0.06), inset 0 -2px 0 rgba(0,0,0,0.05)'

  const showText = tile.type !== 'go' && tile.type !== 'go_to_jail' && tile.type !== 'free_parking'
  const isLeftColumn = tile.index > 10 && tile.index < 20
  const isRightColumn = tile.index > 30 && tile.index < 40
  const isHorizontal = isLeftColumn || isRightColumn

  // Image size classes based on board-relative container query units (cqw)
  let imgSizeClass = 'h-[6.2cqw] w-[6.2cqw]'
  if (isCorner) {
    imgSizeClass = !showText ? 'h-[8.5cqw] w-[8.5cqw]' : 'h-[5.5cqw] w-[5.5cqw]'
  } else if (isHorizontal) {
    imgSizeClass = 'h-[4.0cqw] w-[4.0cqw]'
  } else if (tile.id === 'income-tax') {
    imgSizeClass = 'h-[8.0cqw] w-full max-w-[96%]'
  }

  const nameColor = getPastelTextColor(tile)

  return (
    <div
      className={`tile-cell relative flex min-h-0 min-w-0 flex-col justify-between overflow-hidden rounded-md sm:rounded-[8px] border border-[#7ca661]/35 bg-[#f8fdf5] p-[0.35cqw] text-center uppercase leading-tight ${
        isCorner ? 'corner-tile' : ''
      } ${
        isPurchasable
          ? 'cursor-pointer transition-all duration-200 ease-out hover:-translate-y-1 sm:hover:-translate-y-1.5 hover:scale-[1.03] hover:shadow-[0_12px_24px_rgba(0,0,0,0.18)] hover:z-30'
          : 'transition-all duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-[0_6px_12px_rgba(0,0,0,0.1)] hover:z-30'
      }`}
      style={{ ...gridStyle, ...paddingStyle, boxShadow: shadowValue }}
      onClick={isPurchasable ? onClick : undefined}
      onKeyDown={
        isPurchasable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      role={isPurchasable ? 'button' : undefined}
      tabIndex={isPurchasable ? 0 : undefined}
      aria-label={isPurchasable ? `View ${tile.name}` : undefined}
      onMouseEnter={!isPurchasable ? () => setShowTooltip(true) : undefined}
      onMouseLeave={!isPurchasable ? () => setShowTooltip(false) : undefined}
    >
      {/* Tooltip for non-purchasable tiles */}
      {showTooltip && !isPurchasable ? <TileTooltip tile={tile} /> : null}

      {Object.keys(stripStyle).length > 0 ? <span className="absolute" style={stripStyle} /> : null}
      {property?.mortgaged ? (
        <span
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ backgroundImage: 'linear-gradient(135deg, transparent 42%, rgba(82,82,91,.6) 43%, rgba(82,82,91,.6) 57%, transparent 58%)' }}
        />
      ) : null}

      {/* Horizontal layout for left/right columns if they have a watermark */}
      {isHorizontal && watermarkSrc ? (
        <div
          className={`relative z-10 flex min-h-0 flex-1 items-center justify-between gap-[0.25cqw] px-[0.3cqw] py-[0.2cqw] overflow-hidden w-full h-full ${
            isLeftColumn ? 'flex-row' : 'flex-row-reverse'
          }`}
        >
          {/* Text area (Name & Price) */}
          <div className="flex flex-col items-center justify-center flex-1 min-w-0 text-center">
            {showText ? (
              <p
                className={`line-clamp-3 break-normal font-black leading-[1.0] w-full text-center ${
                  tile.name.length > 15
                    ? 'tracking-tighter text-[0.7cqw]'
                    : tile.name.length > 12
                    ? 'tracking-tighter text-[0.78cqw]'
                    : 'tracking-tight text-[0.9cqw]'
                }`}
                style={{ color: nameColor }}
              >
                {tile.name}
              </p>
            ) : null}

            {(tile.price || tile.tax) ? (
              <p
                className="text-[0.78cqw] font-bold opacity-85 mt-[0.1cqw]"
                style={{ color: nameColor }}
              >
                {formatMoney(tile.price ?? tile.tax ?? 0)}
              </p>
            ) : null}
          </div>

          {/* Watermark image */}
          <div className="pointer-events-none flex items-center justify-center select-none flex-shrink-0">
            <img
              src={watermarkSrc}
              alt=""
              className={`${imgSizeClass} object-contain filter brightness-105`}
            />
          </div>
        </div>
      ) : (
        /* Vertical layout for top/bottom rows and non-watermark horizontal tiles */
        <div className={`relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center w-full h-full ${
          tile.id === 'income-tax'
            ? 'gap-[0.2cqw] px-[0.4cqw] py-[0.15cqw]'
            : 'gap-[0.35cqw] px-[0.4cqw] py-[0.3cqw]'
        } overflow-hidden`}>
          {watermarkSrc ? (
            <div className="pointer-events-none flex items-center justify-center select-none flex-shrink-0">
              <img
                src={watermarkSrc}
                alt=""
                className={`${imgSizeClass} object-contain filter brightness-105`}
              />
            </div>
          ) : null}

          {showText ? (
            <p
              className={`line-clamp-3 break-normal font-black leading-[1.05] w-full text-center ${
                tile.name.length > 15
                  ? 'tracking-tighter text-[0.78cqw]'
                  : tile.name.length > 12
                  ? 'tracking-tighter text-[0.85cqw]'
                  : 'tracking-tight text-[1.0cqw]'
              }`}
              style={{ color: nameColor }}
            >
              {tile.name}
            </p>
          ) : null}

          {(tile.price || tile.tax) ? (
            <p
              className="text-[0.8cqw] font-bold opacity-85 mt-[0.1cqw]"
              style={{ color: nameColor }}
            >
              {formatMoney(tile.price ?? tile.tax ?? 0)}
            </p>
          ) : null}
        </div>
      )}

      {/* House/hotel indicators (Fix 7) */}
      {hasBuildings ? (
        <div className="relative z-10 flex h-[1.25cqw] items-center justify-center gap-[0.3cqw] w-full mt-[0.2cqw]">
          <span className="flex items-center gap-[0.3cqw]">
            {property?.hotels ? (
              <span className="flex items-center gap-[0.3cqw]">
                <span className="h-0 w-0 border-x-transparent border-b-red-500" style={{ borderLeftWidth: '0.3cqw', borderRightWidth: '0.3cqw', borderBottomWidth: '0.55cqw' }} />
                <span className="text-[0.65cqw] font-bold text-red-600 leading-none mt-[0.05cqw]">H</span>
              </span>
            ) : null}
            {!property?.hotels && property?.houses ? (
              <span className="flex items-center gap-[0.3cqw]">
                {Array.from({ length: property.houses }).map((_, index) => (
                  <span key={index} className="h-[0.65cqw] w-[0.65cqw] rounded-[0.1cqw] bg-emerald-600" />
                ))}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}

      {/* Pass Go Collect $200 on GO corner tile */}
      {tile.type === 'go' ? (
        <div className="absolute inset-x-0 bottom-[1.2cqw] z-10 flex flex-col items-center justify-center pointer-events-none text-center">
          <p className="text-[0.62cqw] font-black text-[#2e4c33] leading-[1.05] tracking-tight uppercase">
            Pass Go<br />Collect $200
          </p>
        </div>
      ) : null}
    </div>
  )
}
