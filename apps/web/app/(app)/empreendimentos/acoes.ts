'use server'

import { ErroAplicacao, criarEmpreendimento, traduzirErroBanco } from '@norteia/aplicacao'
import {
  STATUS_LOTE_CADASTRO,
  UFS,
  areaBrasileira,
  esquemaNovoEmpreendimento,
  moedaOpcional,
} from '@norteia/dominio'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

export async function novoEmpreendimento(
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  let id: string
  try {
    const dados = esquemaNovoEmpreendimento.parse(valoresDoFormulario(form))
    id = await criarEmpreendimento(
      ctx.db,
      ctx.tenant.id,
      dados,
      String(form.get('spe') || '') || undefined,
    )
  } catch (e) {
    return estadoDeErro(e, form)
  }
  redirect(`/empreendimentos/${id}?novo=1`)
}

const opcional = <T extends z.ZodType>(s: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), s.optional())

const esquemaEdicaoEmpreendimento = z.object({
  nome: z.string().trim().min(2, 'Nome: informe ao menos 2 caracteres.'),
  municipio: z.string().trim().max(80),
  uf: z.enum(UFS, { error: 'UF: escolha um estado.' }),
  situacao: z.enum(['estudo', 'aprovacao', 'registrado', 'em_vendas', 'encerrado']),
  dataRegistro: opcional(z.iso.date({ error: 'Data de registro inválida.' })),
  registroMatricula: z.string().trim().max(60),
  areaTotal: opcional(areaBrasileira),
  areaVendavel: opcional(areaBrasileira),
})

export async function editarEmpreendimento(
  id: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = esquemaEdicaoEmpreendimento.parse(valoresDoFormulario(form))
    if (!['estudo', 'aprovacao'].includes(d.situacao) && !d.dataRegistro) {
      throw new ErroAplicacao(
        'Informe a data de registro do loteamento para esta situação (Lei 6.766).',
        'registro',
        'dataRegistro',
      )
    }
    const { error } = await ctx.db
      .from('empreendimentos')
      .update({
        nome: d.nome,
        municipio: d.municipio || null,
        uf: d.uf,
        situacao: d.situacao,
        data_registro: d.dataRegistro ?? null,
        registro_matricula: d.registroMatricula || null,
        area_total_m2: d.areaTotal ? Number(d.areaTotal) : null,
        area_vendavel_m2: d.areaVendavel ? Number(d.areaVendavel) : null,
      })
      .eq('id', id)
      .eq('tenant_id', ctx.tenant.id)
    if (error) throw traduzirErroBanco(error)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(`/empreendimentos/${id}`)
  redirect(`/empreendimentos/${id}`)
}

const esquemaLote = z.object({
  area: areaBrasileira,
  testada: opcional(areaBrasileira),
  preco: moedaOpcional,
  status: opcional(z.enum(STATUS_LOTE_CADASTRO)),
  observacao: z.string().trim().max(500),
})

export async function editarLote(
  empreendimentoId: string,
  loteId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = esquemaLote.parse(valoresDoFormulario(form))
    const { data, error } = await ctx.db
      .from('lotes')
      .update({
        area_m2: Number(d.area),
        testada_m: d.testada ? Number(d.testada) : null,
        preco_base_centavos: d.preco,
        observacao: d.observacao || null,
        ...(d.status ? { status: d.status } : {}),
      })
      .eq('id', loteId)
      .eq('empreendimento_id', empreendimentoId)
      .select('id')
    if (error) throw traduzirErroBanco(error)
    if (!data?.length) throw new ErroAplicacao('Você não tem permissão para alterar este lote.')
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(`/empreendimentos/${empreendimentoId}`)
  redirect(`/empreendimentos/${empreendimentoId}`)
}
