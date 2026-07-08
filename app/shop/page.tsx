import Link from 'next/link'

export default function ShopPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] px-6 py-16 text-white">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold">Shop</h1>
        <p className="mt-4 text-zinc-400">Coming soon - earn points by winning games to unlock skins and maps.</p>
        <Link href="/" className="mt-8 inline-flex rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:border-zinc-500">
          Back home
        </Link>
      </div>
    </main>
  )
}
