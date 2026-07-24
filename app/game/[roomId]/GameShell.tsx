'use client'

import { useStorage } from '@/lib/liveblocks.config'
import EndGameScreen from './EndGameScreen'
import GameBoard from './GameBoard'

export default function GameShell({ roomId }: { roomId: string }) {
  const gamePhase = useStorage((root) => root.gamePhase)

  if (gamePhase === 'ended') return <EndGameScreen />
  return <GameBoard />
}
