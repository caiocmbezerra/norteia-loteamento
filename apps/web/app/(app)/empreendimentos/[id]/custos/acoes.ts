'use server'

import {
  ErroAplicacao,
  criarOrcamentoDoPlano,
  estornarPagamento,
  registrarConta,
  registrarContrato,
  registrarPagamento,
  type SugestaoConta,
  sugerirContaDeDocumento,
  traduzirErroBanco,
} from '@norteia/aplicacao'
import { clienteLeitura } from '@norteia/integracoes/leitura-documento'
import { lerMoeda } from '@norteia/dominio'
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
  try {
    const c = esquemaConta.parse(valoresDoFormulario(form))
    if (!c.contratoId && !c.centro) {
      throw new ErroAplicacao('Escolha o contrato ou o centro de custo.', 'centro', 'centro')
    }
    await registrarConta(ctx.db, ctx.tenant.id, empreendimentoId, {
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
  revalidatePath(caminho(empreendimentoId))
  return { ok: 'Conta a pagar registrada.' }
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
