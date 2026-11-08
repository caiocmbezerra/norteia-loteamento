import type { Database } from '@norteia/db'
import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { configSupabase } from '@/lib/env'

// /api/webhooks: avisos de serviços externos, autenticados pelo token de cada integração.
const PREFIXOS_PUBLICOS = ['/entrar', '/cadastrar', '/auth', '/convite', '/api/webhooks']

function ehPublica(caminho: string) {
  return (
    caminho === '/' || PREFIXOS_PUBLICOS.some((p) => caminho === p || caminho.startsWith(`${p}/`))
  )
}

/** Renova a sessão a cada requisição e manda para /entrar quem não está logado. */
export async function atualizarSessao(requisicao: NextRequest) {
  let resposta = NextResponse.next({ request: requisicao })
  const { url, chave } = configSupabase()
  const supabase = createServerClient<Database>(url, chave, {
    cookies: {
      getAll: () => requisicao.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value } of lista) requisicao.cookies.set(name, value)
        resposta = NextResponse.next({ request: requisicao })
        for (const { name, value, options } of lista) resposta.cookies.set(name, value, options)
      },
    },
  })

  // Valida o token (não confiar apenas no cookie).
  const { data } = await supabase.auth.getClaims()
  const caminho = requisicao.nextUrl.pathname

  if (!data?.claims && !ehPublica(caminho)) {
    const destino = requisicao.nextUrl.clone()
    destino.pathname = '/entrar'
    destino.search = `?proximo=${encodeURIComponent(caminho + requisicao.nextUrl.search)}`
    return NextResponse.redirect(destino)
  }
  return resposta
}
