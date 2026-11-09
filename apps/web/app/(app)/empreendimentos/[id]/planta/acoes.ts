'use server'

import { ErroAplicacao, traduzirErroBanco } from '@norteia/aplicacao'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

const TIPOS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
const LIMITE = 20 * 1024 * 1024

/** Envia a imagem da planta (D-008); um PDF chega aqui já convertido em imagem pelo navegador. */
export async function enviarPlanta(
  empreendimentoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const arquivo = form.get('planta')
    if (!(arquivo instanceof File) || arquivo.size === 0)
      throw new ErroAplicacao('Escolha a imagem ou o PDF da planta.', 'planta', 'planta')
    const ext = TIPOS[arquivo.type]
    if (!ext)
      throw new ErroAplicacao('Use uma imagem PNG, JPG ou WebP, ou um PDF.', 'planta', 'planta')
    if (arquivo.size > LIMITE)
      throw new ErroAplicacao('A planta pode ter até 20 MB.', 'planta', 'planta')
    const { largura, altura } = z
      .object({
        largura: z.coerce.number().int().min(1).max(20000),
        altura: z.coerce.number().int().min(1).max(20000),
      })
      .parse({ largura: form.get('largura'), altura: form.get('altura') })

    const { data: e, error } = await ctx.db
      .from('empreendimentos')
      .select('tenant_id, planta_arquivo')
      .eq('id', empreendimentoId)
      .single()
    if (error) throw traduzirErroBanco(error)
    const caminho = `${e.tenant_id}/${empreendimentoId}/planta-${Date.now()}.${ext}`
    const envio = await ctx.db.storage
      .from('plantas')
      .upload(caminho, arquivo, { contentType: arquivo.type })
    if (envio.error)
      throw new ErroAplicacao('Não foi possível enviar a planta. Tente novamente.', 'planta')
    const { data: atualizado, error: erroAtualizar } = await ctx.db
      .from('empreendimentos')
      .update({ planta_arquivo: caminho, planta_largura: largura, planta_altura: altura })
      .eq('id', empreendimentoId)
      .select('id')
    if (erroAtualizar || !atualizado?.length) {
      await ctx.db.storage.from('plantas').remove([caminho])
      throw erroAtualizar
        ? traduzirErroBanco(erroAtualizar)
        : new ErroAplicacao('Você não tem permissão para alterar a planta.')
    }
    if (e.planta_arquivo) await ctx.db.storage.from('plantas').remove([e.planta_arquivo])
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(`/empreendimentos/${empreendimentoId}`, 'layout')
  return { ok: 'Planta enviada. Agora desenhe o contorno dos lotes.' }
}

const esquemaPontos = z
  .array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]))
  .min(3, 'O contorno precisa de ao menos 3 pontos.')
  .max(200, 'O contorno pode ter até 200 pontos.')

/** Grava (ou apaga, com `pontos` nulo) o contorno de um lote na planta. */
export async function salvarContorno(
  empreendimentoId: string,
  loteId: string,
  pontos: [number, number][] | null,
): Promise<{ erro?: string }> {
  const ctx = await exigirContexto()
  const validos = pontos === null ? null : esquemaPontos.safeParse(pontos)
  if (validos && !validos.success)
    return { erro: validos.error.issues[0]?.message ?? 'Contorno inválido.' }
  const { data, error } = await ctx.db
    .from('lotes')
    .update({
      planta_poligono: validos
        ? validos.data.map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))])
        : null,
    })
    .eq('id', loteId)
    .eq('empreendimento_id', empreendimentoId)
    .select('id')
  if (error) return { erro: traduzirErroBanco(error).message }
  if (!data?.length) return { erro: 'Você não tem permissão para alterar este lote.' }
  revalidatePath(`/empreendimentos/${empreendimentoId}`, 'layout')
  return {}
}
