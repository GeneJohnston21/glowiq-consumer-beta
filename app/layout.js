import './globals.css'
import RegisterSW from '../components/RegisterSW'

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
  themeColor: '#1A2B4A',
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
      <body>
        <RegisterSW />
        {children}
      </body>
    </html>
  )
}