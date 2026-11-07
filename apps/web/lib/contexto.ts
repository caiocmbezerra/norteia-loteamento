import 'server-only'
import type { ClienteBanco } from '@norteia/db'
import type { Papel } from '@norteia/dominio'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { clienteServidor } from '@/lib/supabase/servidor'

export const COOKIE_TENANT = 'norteia_tenant'

export interface ClienteDoUsuario {
  id: string
  nome: string
  plano: string
  papeis: Papel[]
}

export interface Contexto {
  db: ClienteBanco
  usuario: { id: string; email: string; nome: string }
  clientes: ClienteDoUsuario[]
  tenant: ClienteDoUsuario
}

/** Usuário logado ou redireciona para /entrar. */
export const exigirUsuario = cache(async () => {
  const db = await clienteServidor()
  const { data } = await db.auth.getUser()
  if (!data.user) redirect('/entrar')
  const { data: perfil } = await db
    .from('perfis')
    .select('nome')
    .eq('id', data.user.id)
    .maybeSingle()
  return {
    db,
    usuario: { id: data.user.id, email: data.user.email ?? '', nome: perfil?.nome ?? '' },
  }
})

/** Clientes (tenants) em que o usuário é membro ativo, com seus papéis. */
export const clientesDoUsuario = cache(async (): Promise<ClienteDoUsuario[]> => {
  const { db, usuario } = await exigirUsuario()
  const { data, error } = await db
    .from('membros')
    .select('tenant_id, tenants(nome, plano_id), atribuicoes_papel(papel)')
    .eq('usuario_id', usuario.id)
    .eq('ativo', true)
  if (error) throw error
  return (data ?? [])
    .filter((m) => m.tenants)
    .map((m) => ({
      id: m.tenant_id,
      nome: m.tenants!.nome,
      plano: m.tenants!.plano_id,
      papeis: [...new Set(m.atribuicoes_papel.map((a) => a.papel))],
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
})

/** Contexto completo das telas internas: usuário + cliente ativo. Sem cliente → /comecar. */
export const exigirContexto = cache(async (): Promise<Contexto> => {
  const { db, usuario } = await exigirUsuario()
  const clientes = await clientesDoUsuario()
  if (clientes.length === 0) redirect('/comecar')
  const escolhido = (await cookies()).get(COOKIE_TENANT)?.value
  const tenant = clientes.find((c) => c.id === escolhido) ?? clientes[0]!
  return { db, usuario, clientes, tenant }
})

export function temPapel(ctx: Contexto, ...papeis: Papel[]) {
  return ctx.tenant.papeis.some((p) => papeis.includes(p))
}
