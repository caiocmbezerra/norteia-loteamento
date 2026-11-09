import type { MetadataRoute } from 'next'

/** App instalável (PWA): atalho na tela inicial do celular, abre direto no painel ou no portal. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NorteIA Loteamento',
    short_name: 'NorteIA',
    description: 'Gestão de loteamentos e portal do comprador, sócio e permutante.',
    lang: 'pt-BR',
    start_url: '/painel',
    scope: '/',
    display: 'standalone',
    background_color: '#fcfdf9',
    theme_color: '#1f6b46',
    icons: [
      { src: '/icones/icone-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icones/icone-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [{ name: 'Meu portal', url: '/portal' }],
  }
}
