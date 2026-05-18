import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TSS Conversion Report',
  description: 'The Swim Starter sales conversion dashboard',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="flex min-h-full flex-col bg-slate-100">{children}</body>
    </html>
  )
}
