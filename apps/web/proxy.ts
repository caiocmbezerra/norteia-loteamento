import type { NextRequest } from 'next/server'
import { atualizarSessao } from '@/lib/supabase/proxy'

export async function proxy(requisicao: NextRequest) {
  return atualizarSessao(requisicao)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
