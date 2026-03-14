import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'
import { Sidebar } from '@/components/layout/Sidebar'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'CRM Scraping — Fase 1',
  description: 'Controle de campanhas e leads',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="flex h-screen overflow-hidden bg-background">
          <Sidebar />
          <main className="flex flex-1 flex-col overflow-y-auto">
            {children}
          </main>
        </div>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  )
}
