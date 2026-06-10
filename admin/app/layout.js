export const metadata = { title: 'GlowIQ Admin', description: 'GlowIQ Administration Portal' }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin:0, padding:0, background:'#E8EDF5', fontFamily:"'Georgia','Times New Roman',serif" }}>
        {children}
      </body>
    </html>
  )
}
