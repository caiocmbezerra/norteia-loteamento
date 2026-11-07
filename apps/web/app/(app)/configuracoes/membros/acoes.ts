'use server'

import { ErroAplicacao, traduzirErroBanco } from '@norteia/aplicacao'
import { ROTULO_PAPEL } from '@norteia/dominio'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

const PAPEIS = Object.keys(ROTULO_PAPEL) as [
  keyof typeof ROTULO_PAPEL,
  ...(keyof typeof ROTULO_PAPEL)[],
]

const esquemaConvite = z.object({
  email: z.email('Informe um e-mail válido.'),
  papel: z.enum(PAPEIS, { error: 'Escolha um papel.' }),
  empreendimento: z.string(),
})

export async function convidar(_: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = esquemaConvite.parse(valoresDoFormulario(form))
    const { data: token, error } = await ctx.db.rpc('criar_convite', {
      p_tenant: ctx.tenant.id,
      p_email: d.email,
      p_papel: d.papel,
      p_escopo_tipo: d.empreendimento ? 'empreendimento' : 'tenant',
      ...(d.empreendimento ? { p_escopo_id: d.empreendimento } : {}),
    })
    if (error) throw traduzirErroBanco(error)
    const h = await headers()
    const link = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}/convite/${token}`
    revalidatePath('/configuracoes/membros')
    return { ok: link }
  } catch (e) {
    return estadoDeErro(e, form)
  }
}

export async function alternarMembro(membroId: string, ativo: boolean) {
  const ctx = await exigirContexto()
  const { data, error } = await ctx.db
    .from('membros')
    .update({ ativo })
    .eq('id', membroId)
    .eq('tenant_id', ctx.tenant.id)
    .neq('usuario_id', ctx.usuario.id)
    .select('id')
  if (error) throw traduzirErroBanco(error)
  if (!data.length) throw new ErroAplicacao('Não foi possível alterar este membro.')
  revalidatePath('/configuracoes/membros')
}

export async function cancelarConvite(conviteId: string) {
  const ctx = await exigirContexto()
  const { error } = await ctx.db
    .from('convites')
    .update({ cancelado_em: new Date().toISOString() })
    .eq('id', conviteId)
    .eq('tenant_id', ctx.tenant.id)
  if (error) throw traduzirErroBanco(error)
  revalidatePath('/configuracoes/membros')
}
