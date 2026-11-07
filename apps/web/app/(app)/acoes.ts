'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { COOKIE_TENANT, clientesDoUsuario } from '@/lib/contexto'

export async function trocarCliente(form: FormData) {
  const id = String(form.get('tenant') ?? '')
  const clientes = await clientesDoUsuario()
  if (clientes.some((c) => c.id === id)) {
    ;(await cookies()).set(COOKIE_TENANT, id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  redirect('/painel')
}
