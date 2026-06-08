import './globals.css'

export const metadata = {
  title: 'GlowIQ — Skin Roadmap',
  description: 'AI-powered aesthetic skin analysis and treatment roadmap',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'GlowIQ',
  },
}

export const viewport = {
  themeColor: '#2C4A72',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>{children}</body>
    </html>
  )
}