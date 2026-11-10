'use server'

import {
  ErroAplicacao,
  criarOrcamentoDoPlano,
  estornarPagamento,
  registrarConta,
  registrarContrato,
  registrarMedicao,
  registrarPagamento,
  type SugestaoConta,
  anexarDocumentoConta,
  sugerirContaDeDocumento,
  traduzirErroBanco,
} from '@norteia/aplicacao'
import { clienteLeitura } from '@norteia/integracoes/leitura-documento'
import { lerMoeda } from '@norteia/dominio'
import { Decimal } from '@norteia/motor-financeiro'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

const dinheiro = (rotulo: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      try {
        const c = Number(lerMoeda(v))
        if (c <= 0) throw new Error()
        return c
      } catch {
        ctx.addIssue({ code: 'custom', message: `${rotulo}: use o formato 12.500,00.` })
        return z.NEVER
      }
    })
const data = (rotulo: string) => z.iso.date({ error: `${rotulo}: informe uma data.` })
const texto = (rotulo: string) =>
  z.string().trim().min(2, `${rotulo}: informe ao menos 2 caracteres.`).max(200)

function caminho(id: string) {
  return `/empreendimentos/${id}/custos`
}

export async function revisarOrcamento(empreendimentoId: string) {
  const ctx = await exigirContexto()
  await criarOrcamentoDoPlano(ctx.db, ctx.tenant.id, empreendimentoId)
  revalidatePath(caminho(empreendimentoId))
}

const esquemaContrato = z
  .object({
    fornecedorId: z.uuid('Escolha o fornecedor.'),
    centro: z.string().min(1, 'Escolha o centro de custo.'),
    descricao: texto('Descrição'),
    valor: dinheiro('Valor do contrato'),
    dataInicio: data('Início'),
    dataFimPrevista: data('Término previsto'),
  })
  .refine((c) => c.dataFimPrevista >= c.dataInicio, {
    message: 'O término previsto deve ser depois do início.',
    path: ['dataFimPrevista'],
  })

export async function novoContrato(
  empreendimentoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const c = esquemaContrato.parse(valoresDoFormulario(form))
    await registrarContrato(ctx.db, ctx.tenant.id, empreendimentoId, {
      ...c,
      valorCentavos: c.valor,
    })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(caminho(empreendimentoId))
  return { ok: 'Contrato registrado.' }
}

const esquemaConta = z.object({
  contratoId: z.string(),
  centro: z.string(),
  fornecedorId: z.string(),
  descricao: texto('Descrição'),
  valor: dinheiro('Valor'),
  vencimento: data('Vencimento'),
  documentoNumero: z.string().trim().max(60),
})

export async function novaConta(
  empreendimentoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  let contaId: string
  try {
    const c = esquemaConta.parse(valoresDoFormulario(form))
    if (!c.contratoId && !c.centro) {
      throw new ErroAplicacao('Escolha o contrato ou o centro de custo.', 'centro', 'centro')
    }
    contaId = await registrarConta(ctx.db, ctx.tenant.id, empreendimentoId, {
      centro: c.centro,
      contratoId: c.contratoId || null,
      fornecedorId: c.fornecedorId || null,
      descricao: c.descricao,
      valorCentavos: c.valor,
      vencimento: c.vencimento,
      documentoNumero: c.documentoNumero || null,
    })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  // O documento lido (ou escolhido) fica anexado à conta; se falhar, a conta continua registrada.
  const anexo = form.get('anexo')
  if (anexo instanceof File && anexo.size > 0) {
    try {
      await anexarDocumentoConta(ctx.db, ctx.tenant.id, empreendimentoId, contaId, {
        nome: anexo.name,
        tipo: anexo.type,
        bytes: anexo,
        tamanho: anexo.size,
      })
    } catch (e) {
      revalidatePath(caminho(empreendimentoId))
      return {
        ok: `Conta a pagar registrada, mas o anexo não foi guardado: ${e instanceof Error ? e.message : 'erro'}`,
      }
    }
  }
  revalidatePath(caminho(empreendimentoId))
  return { ok: 'Conta a pagar registrada.' }
}

/** Anexa uma nota, boleto ou recibo a uma conta já registrada. */
export async function anexarConta(
  empreendimentoId: string,
  contaId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const anexo = form.get('anexo')
    if (!(anexo instanceof File) || anexo.size === 0)
      throw new ErroAplicacao('Escolha o arquivo.', 'anexo', 'anexo')
    await anexarDocumentoConta(ctx.db, ctx.tenant.id, empreendimentoId, contaId, {
      nome: anexo.name,
      tipo: anexo.type,
      bytes: anexo,
      tamanho: anexo.size,
    })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(caminho(empreendimentoId))
  return { ok: 'Anexo guardado.' }
}

export async function pagar(
  empreendimentoId: string,
  contaId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const p = z
      .object({ data: data('Data do pagamento'), valor: dinheiro('Valor pago') })
      .parse(valoresDoFormulario(form))
    await registrarPagamento(ctx.db, ctx.tenant.id, contaId, p.data, p.valor)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(caminho(empreendimentoId))
  return { ok: 'Pagamento registrado.' }
}

export async function estornar(
  empreendimentoId: string,
  pagamentoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    await estornarPagamento(ctx.db, pagamentoId, String(form.get('motivo') ?? ''))
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(caminho(empreendimentoId))
  return { ok: 'Pagamento estornado.' }
}

const esquemaItem = z
  .object({
    centro: z.string().min(1, 'Escolha o centro de custo.'),
    descricao: texto('Descrição'),
    tipo: z.enum(['total', 'mensal']),
    valor: dinheiro('Valor'),
    mesInicio: z.coerce.number().int().min(0, 'Mês inicial: mínimo 0.'),
    mesFim: z.coerce.number().int().min(0, 'Mês final: mínimo 0.'),
  })
  .refine((i) => i.mesFim >= i.mesInicio, {
    message: 'O mês final deve ser ≥ ao inicial.',
    path: ['mesFim'],
  })

export async function salvarItemOrcamento(
  empreendimentoId: string,
  itemId: string | null,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const i = esquemaItem.parse(valoresDoFormulario(form))
    const linha = {
      centro_codigo: i.centro,
      descricao: i.descricao,
      tipo: i.tipo,
      valor_centavos: i.valor,
      mes_inicio: i.mesInicio,
      mes_fim: i.mesFim,
    }
    const { error } = itemId
      ? await ctx.db.from('orcamento_itens').update(linha).eq('id', itemId)
      : await ctx.db
          .from('orcamento_itens')
          .insert({ ...linha, tenant_id: ctx.tenant.id, empreendimento_id: empreendimentoId })
    if (error) throw traduzirErroBanco(error)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(caminho(empreendimentoId))
  revalidatePath(`${caminho(empreendimentoId)}/orcamento`)
  return { ok: itemId ? 'Item atualizado.' : 'Item incluído.' }
}

/** Lê nota, boleto ou recibo e devolve a sugestão para o formulário (nada é gravado). */
export async function lerDocumentoConta(arquivo: {
  base64: string
  tipo: string
}): Promise<{ sugestao?: SugestaoConta; erro?: string }> {
  const ctx = await exigirContexto()
  if (!process.env.ANTHROPIC_API_KEY)
    return { erro: 'A leitura automática ainda não foi ativada nesta instalação; preencha à mão.' }
  if (arquivo.base64.length > 14_000_000) return { erro: 'Arquivo grande demais (até 10 MB).' }
  try {
    return {
      sugestao: await sugerirContaDeDocumento(ctx.db, ctx.tenant.id, arquivo, clienteLeitura()),
    }
  } catch (e) {
    if (e instanceof ErroAplicacao) return { erro: e.message }
    console.error('leitura de documento', e)
    return { erro: 'Não foi possível ler o documento agora; preencha à mão.' }
  }
}

const esquemaMedicao = z.object({
  data: z.iso.date({ error: 'Data da medição inválida.' }),
  percentual: z
    .string()
    .trim()
    .regex(/^\d{1,3}(,\d{1,4})?$/, 'Percentual: use um número como 45 ou 45,5.')
    .transform((v) => new Decimal(v.replace(',', '.')).div(100))
    .refine((v) => v.gt(0) && v.lte(1), 'Percentual: de 0 a 100.')
    .transform((v) => v.toString()),
  vencimento: z.iso.date({ error: 'Vencimento inválido.' }),
  documento: z.string().trim().max(60),
  observacao: z.string().trim().max(500),
})

/** Medição pelo percentual acumulado executado; gera a conta a pagar da diferença. */
export async function medir(
  empreendimentoId: string,
  contratoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const m = esquemaMedicao.parse(valoresDoFormulario(form))
    await registrarMedicao(ctx.db, {
      contratoId,
      data: m.data,
      percentualAcumulado: m.percentual,
      vencimento: m.vencimento,
      documento: m.documento || null,
      observacao: m.observacao || null,
    })
  } catch (e) {
    if (e instanceof ErroAplicacao && e.codigo === 'percentual')
      return { erros: { percentual: e.message }, valores: valoresDoFormulario(form) }
    return estadoDeErro(e, form)
  }
  revalidatePath(caminho(empreendimentoId))
  return { ok: 'Medição registrada; a conta a pagar foi criada.' }
}

/** Encerra o contrato: o saldo não medido deixa de ser compromisso; contas abertas continuam. */
export async function encerrarContrato(
  empreendimentoId: string,
  contratoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const { data, error } = await ctx.db
      .from('contratos_fornecedor')
      .update({ situacao: 'encerrado' })
      .eq('id', contratoId)
      .eq('empreendimento_id', empreendimentoId)
      .eq('situacao', 'vigente')
      .select('id')
    if (error) throw traduzirErroBanco(error)
    if (!data?.length) throw new ErroAplicacao('Contrato não encontrado ou já encerrado.')
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(caminho(empreendimentoId))
  return { ok: 'Contrato encerrado.' }
}

/** Cancela uma conta sem pagamentos ativos (lançamento errado, nota substituída). */
export async function cancelarConta(
  empreendimentoId: string,
  contaId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const motivo = String(form.get('motivo') ?? '').trim()
    if (motivo.length < 3)
      throw new ErroAplicacao('Informe o motivo do cancelamento.', 'motivo', 'motivo')
    const { data, error } = await ctx.db
      .from('contas_pagar')
      .update({ cancelada_em: new Date().toISOString(), motivo_cancelamento: motivo })
      .eq('id', contaId)
      .eq('empreendimento_id', empreendimentoId)
      .is('cancelada_em', null)
      .select('id')
    if (error) throw traduzirErroBanco(error)
    if (!data?.length) throw new ErroAplicacao('Conta não encontrada ou já cancelada.')
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(caminho(empreendimentoId))
  return { ok: 'Conta cancelada.' }
}
