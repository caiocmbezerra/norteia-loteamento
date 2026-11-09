import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'NorteIA Loteamento',
    template: '%s · NorteIA Loteamento',
  },
  description:
    'Gestão de loteamentos com motor financeiro único: viabilidade, obra, vendas, carteira e retorno por sócio.',
  applicationName: 'NorteIA Loteamento',
  appleWebApp: { capable: true, title: 'NorteIA', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/icones/icone-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icones/apple-touch-icon.png', sizes: '180x180' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fcfdf9' },
    { media: '(prefers-color-scheme: dark)', color: '#121a16' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
