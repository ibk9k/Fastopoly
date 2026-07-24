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
  title: 'Fastopoly',
  description: 'Play Fastopoly with friends, anywhere',
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
