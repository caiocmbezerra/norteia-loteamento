'use server'

import { criarDemonstracao } from '@norteia/aplicacao'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { COOKIE_TENANT, clientesDoUsuario, exigirContexto } from '@/lib/contexto'

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

/** Empreendimento de demonstração com o caso de referência (Fase 2). */
export async function criarEmpreendimentoDemonstracao() {
  const ctx = await exigirContexto()
  const id = await criarDemonstracao(ctx.db, ctx.tenant.id)
  redirect(`/empreendimentos/${id}`)
}
