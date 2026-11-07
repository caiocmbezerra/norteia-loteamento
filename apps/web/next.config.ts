import type { NextConfig } from 'next'

const config: NextConfig = {
  // Pacotes do monorepo são publicados como TypeScript-fonte.
  transpilePackages: ['@norteia/dominio', '@norteia/motor-financeiro', '@norteia/ui'],
  poweredByHeader: false,
}

export default config
