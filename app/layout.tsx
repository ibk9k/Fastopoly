import type { Metadata } from 'next'
import { Lilita_One, Nunito } from 'next/font/google'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { ToastProvider } from '@/components/ui/Toast'
import './globals.css'

// Display: chunky rounded board-game face for the wordmark and headings.
const display = Lilita_One({ weight: '400', subsets: ['latin'], variable: '--font-display' })
// Body: rounded, friendly, carries the heavy weights the UI leans on.
const body = Nunito({ subsets: ['latin'], variable: '--font-body' })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fastopoly.vercel.app'),
  title: 'Fastopoly',
  description: 'Play Fastopoly with friends, anywhere',
  // app/icon.png and app/apple-icon.png are picked up automatically for tab/home-screen
  // icons; this adds the wordmark to link previews (Discord/Slack/iMessage share cards).
  openGraph: {
    title: 'Fastopoly',
    description: 'Play Fastopoly with friends, anywhere',
    images: ['/Logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fastopoly',
    description: 'Play Fastopoly with friends, anywhere',
    images: ['/Logo.png'],
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-sans">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
