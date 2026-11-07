import type { EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { destinoSeguro } from '@/lib/redirecionamento'
import { clienteServidor } from '@/lib/supabase/servidor'

/** Retorno dos e-mails do Supabase Auth (confirmação de conta e link de acesso). */
export async function GET(requisicao: NextRequest) {
  const { searchParams, origin } = requisicao.nextUrl
  const proximo = destinoSeguro(searchParams.get('proximo'))
  const db = await clienteServidor()

  const codigo = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const tipo = searchParams.get('type') as EmailOtpType | null

  const { error } = codigo
    ? await db.auth.exchangeCodeForSession(codigo)
    : tokenHash && tipo
      ? await db.auth.verifyOtp({ token_hash: tokenHash, type: tipo })
      : { error: new Error('sem código') }

  return NextResponse.redirect(new URL(error ? '/entrar?erro=link' : proximo, origin))
}
