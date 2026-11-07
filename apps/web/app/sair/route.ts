import { type NextRequest, NextResponse } from 'next/server'
import { clienteServidor } from '@/lib/supabase/servidor'

export async function POST(requisicao: NextRequest) {
  const db = await clienteServidor()
  await db.auth.signOut()
  return NextResponse.redirect(new URL('/entrar', requisicao.nextUrl.origin), { status: 303 })
}
