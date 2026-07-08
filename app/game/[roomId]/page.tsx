import Room from './Room'
import GameShell from './GameShell'

export default function GamePage({ params }: { params: { roomId: string } }) {
  return (
    <Room roomId={params.roomId}>
      <GameShell roomId={params.roomId} />
    </Room>
  )
}
