import Link from 'next/link'
import PropertyStrip from '@/components/ui/PropertyStrip'

export default function ShopPage() {
  return (
    <main className="relative min-h-screen bg-parchment px-6 py-16 text-pine">
      <PropertyStrip position="top" />
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-4xl uppercase tracking-wide">Shop</h1>
        <p className="mt-4 font-semibold text-pine/70">
          Coming soon — win games to earn points, then spend them on token skins and new maps.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-md border-2 border-salmon-line/50 bg-parchment-raised px-4 py-2 text-sm font-extrabold uppercase tracking-wide text-pine transition-colors hover:border-pine/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pine"
        >
          Back home
        </Link>
      </div>
      <PropertyStrip position="bottom" />
    </main>
  )
}
