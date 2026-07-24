import { NextResponse } from 'next/server'
import { AuthError } from './auth'

export function routeError(error: unknown, fallback: string): NextResponse {
  console.error(fallback, error)
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: 403 })
  }
  const message = error instanceof Error ? error.message : fallback
  const status = message.includes('active player') ? 403 : message.includes('phase') ? 400 : 500
  return NextResponse.json({ error: message }, { status })
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 })
}

export function rollDice(): [number, number] {
  return [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]
}
