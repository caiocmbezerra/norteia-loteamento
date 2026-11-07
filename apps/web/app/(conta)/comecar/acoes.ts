'use server'

import { realizarCadastroInicial } from '@norteia/aplicacao'
import { esquemaCadastroInicial } from '@norteia/dominio'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { COOKIE_TENANT, exigirUsuario } from '@/lib/contexto'

export async function concluirCadastroInicial(
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const { db } = await exigirUsuario()
  let destino: string
  try {
    const dados = esquemaCadastroInicial.parse(valoresDoFormulario(form))
    const { tenantId, empreendimentoId } = await realizarCadastroInicial(db, dados)
    ;(await cookies()).set(COOKIE_TENANT, tenantId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
    destino = `/empreendimentos/${empreendimentoId}?novo=1`
  } catch (e) {
    return estadoDeErro(e, form)
  }
  redirect(destino)
}
