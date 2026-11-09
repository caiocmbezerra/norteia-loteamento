import type { NextConfig } from 'next'

const config: NextConfig = {
  // Pacotes do monorepo são publicados como TypeScript-fonte.
  transpilePackages: [
    '@norteia/dominio',
    '@norteia/motor-financeiro',
    '@norteia/ui',
    '@norteia/integracoes',
  ],
  // Importação de carteira envia a planilha já interpretada (pode passar de 1 MB).
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
  poweredByHeader: false,
}

export default config
