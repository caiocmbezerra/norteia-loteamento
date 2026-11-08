'use server'

import {
  TIPOS_DOCUMENTO,
  type TipoDocumento,
  enviarModelo,
  usarModeloPadrao,
} from '@norteia/aplicacao'
import { revalidatePath } from 'next/cache'
import { type EstadoFormulario, estadoDeErro } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

function tipoValido(tipo: string): TipoDocumento {
  if (!(TIPOS_DOCUMENTO as readonly string[]).includes(tipo)) throw new Error('Tipo inválido')
  return tipo as TipoDocumento
}

export async function enviar(
  tipo: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const arquivo = form.get('arquivo')
    if (!(arquivo instanceof File) || arquivo.size === 0)
      return { erros: { arquivo: 'Escolha o arquivo do Word (.docx).' } }
    await enviarModelo(
      ctx.db,
      ctx.tenant.id,
      tipoValido(tipo),
      arquivo.name,
      new Uint8Array(await arquivo.arrayBuffer()),
    )
  } catch (e) {
    return estadoDeErro(e, new FormData())
  }
  revalidatePath('/configuracoes/modelos')
  return { ok: 'Modelo conferido e publicado. Os próximos documentos já saem com ele.' }
}

export async function voltarAoPadrao(
  tipo: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    await usarModeloPadrao(ctx.db, ctx.tenant.id, tipoValido(tipo))
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath('/configuracoes/modelos')
  return { ok: 'Voltou ao modelo padrão. Suas versões continuam no histórico.' }
}
