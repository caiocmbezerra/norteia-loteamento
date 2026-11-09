'use server'

import {
  ErroAplicacao,
  INDICES_REAJUSTE,
  cancelarReserva,
  criarProposta,
  registrarVenda,
  reservarLote,
  solicitarAprovacaoDesconto,
} from '@norteia/aplicacao'
import { lerMoeda } from '@norteia/dominio'
import { Decimal } from '@norteia/motor-financeiro'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

function revalidar(empreendimentoId: string, loteId: string) {
  revalidatePath(`/empreendimentos/${empreendimentoId}`)
  revalidatePath(`/empreendimentos/${empreendimentoId}/lotes/${loteId}`)
  revalidatePath(`/empreendimentos/${empreendimentoId}/comercial`)
}

export async function reservar(
  empreendimentoId: string,
  loteId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const r = z
      .object({
        cliente: z.string().trim().min(2, 'Informe o nome do cliente.'),
        corretor: z.string(),
        horas: z.coerce
          .number()
          .int()
          .min(1, 'Prazo: mínimo 1 hora.')
          .max(720, 'Prazo: máximo 720 horas.'),
      })
      .parse(valoresDoFormulario(form))
    await reservarLote(ctx.db, loteId, r.cliente, r.corretor || null, r.horas)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, loteId)
  return { ok: 'Lote reservado.' }
}

export async function cancelar(
  empreendimentoId: string,
  loteId: string,
  reservaId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    await cancelarReserva(ctx.db, reservaId, String(form.get('motivo') ?? ''))
  } catch (e) {
    if (e instanceof ErroAplicacao && e.message.includes('motivo'))
      return { erros: { motivo: e.message } }
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, loteId)
  return { ok: 'Reserva cancelada.' }
}

const dinheiro = (rotulo: string, minimo = 0) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      try {
        const c = Number(lerMoeda(v))
        if (c < minimo) throw new Error()
        return c
      } catch {
        ctx.addIssue({ code: 'custom', message: `${rotulo}: use o formato 90.000,00.` })
        return z.NEVER
      }
    })

const opcional = (v: string) => (v.trim() === '' ? null : v.trim())

const camposCondicoes = {
  nome: z.string().trim().min(2, 'Nome do comprador: informe ao menos 2 caracteres.'),
  cpf: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v === '' || v.length === 11, 'CPF: informe os 11 dígitos.'),
  email: z.union([z.literal(''), z.email('E-mail inválido.')]),
  telefone: z.string().trim().max(30),
  corretor: z.string(),
  preco: dinheiro('Preço', 1),
  entrada: dinheiro('Entrada'),
  parcelas: z.coerce.number().int().min(0, 'Parcelas: mínimo 0.').max(480, 'Parcelas: máximo 480.'),
  juros: z
    .string()
    .trim()
    .regex(/^\d{1,2}(,\d{1,4})?$/, 'Juros: use um percentual como 0,5.')
    .transform((v) => new Decimal(v.replace(',', '.')).div(100).toString()),
  sistema: z.enum(['price', 'sac']),
  primeiraParcela: z.string(),
}

type Condicoes = { preco: number; entrada: number; parcelas: number; primeiraParcela: string }

/** Regras comuns à proposta e à venda (à vista × parcelado). */
function comRegras<T extends z.ZodType<Condicoes>>(esquema: T) {
  return esquema
    .refine((v) => v.entrada <= v.preco, {
      message: 'A entrada não pode passar do preço.',
      path: ['entrada'],
    })
    .refine((v) => (v.parcelas === 0) === (v.entrada === v.preco), {
      message:
        'À vista: entrada igual ao preço e 0 parcelas; parcelado: entrada menor que o preço.',
      path: ['parcelas'],
    })
    .refine((v) => v.parcelas === 0 || /^\d{4}-\d{2}-\d{2}$/.test(v.primeiraParcela), {
      message: 'Informe a data da 1ª parcela.',
      path: ['primeiraParcela'],
    })
}

const esquemaVenda = comRegras(
  z.object({
    ...camposCondicoes,
    dataVenda: z.iso.date({ error: 'Data da venda inválida.' }),
    indice: z.union([z.literal(''), z.enum(INDICES_REAJUSTE)]),
    justificativa: z.string().trim().max(500),
  }),
)

const esquemaProposta = comRegras(
  z.object({
    ...camposCondicoes,
    validade: z.iso.date({ error: 'Informe até quando a proposta vale.' }),
    observacao: z.string().trim().max(1000),
  }),
)

/** Registra a proposta (corretor ou gestão); a gestão aceita ou recusa depois. */
export async function propor(
  empreendimentoId: string,
  loteId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const v = esquemaProposta.parse(valoresDoFormulario(form))
    await criarProposta(ctx.db, loteId, {
      cliente: {
        nome: v.nome,
        cpf: opcional(v.cpf),
        email: opcional(v.email),
        telefone: opcional(v.telefone),
      },
      corretorId: opcional(v.corretor),
      precoCentavos: v.preco,
      entradaCentavos: v.entrada,
      parcelas: v.parcelas,
      jurosMensal: v.juros,
      sistema: v.sistema,
      primeiraParcelaEm: v.parcelas > 0 ? v.primeiraParcela : null,
      validaAte: v.validade,
      observacao: opcional(v.observacao),
    })
  } catch (e) {
    if (e instanceof ErroAplicacao && e.codigo === 'valida_ate')
      return { erros: { validade: e.message }, valores: valoresDoFormulario(form) }
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, loteId)
  redirect(`/empreendimentos/${empreendimentoId}/lotes/${loteId}?proposta=1`)
}

export async function vender(
  empreendimentoId: string,
  loteId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  let resultado: { vendaId: string; contratoId: string | null }
  try {
    const v = esquemaVenda.parse(valoresDoFormulario(form))
    resultado = await registrarVenda(
      ctx.db,
      ctx.tenant.id,
      loteId,
      {
        comprador: {
          nome: v.nome,
          cpf: opcional(v.cpf),
          email: opcional(v.email),
          telefone: opcional(v.telefone),
        },
        corretorId: opcional(v.corretor),
        dataVenda: v.dataVenda,
        precoCentavos: v.preco,
        entradaCentavos: v.entrada,
        parcelas: v.parcelas,
        jurosMensal: v.juros,
        sistema: v.sistema,
        primeiraParcelaEm: v.parcelas > 0 ? v.primeiraParcela : null,
        indiceReajuste: v.indice || null,
      },
      v.justificativa || undefined,
    )
  } catch (e) {
    if (e instanceof ErroAplicacao && e.codigo === 'sem_registro') {
      return {
        erro: e.message,
        erros: { justificativa: e.message },
        valores: valoresDoFormulario(form),
      }
    }
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, loteId)
  revalidatePath(`/empreendimentos/${empreendimentoId}/carteira`)
  redirect(
    `/empreendimentos/${empreendimentoId}/lotes/${loteId}?vendido=1${resultado.contratoId ? '' : '&semContrato=1'}`,
  )
}

/** Pede ao dono a aprovação do preço com desconto acima do limite (RN-C05). */
export async function pedirAprovacaoDesconto(
  empreendimentoId: string,
  loteId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = z
      .object({
        preco: dinheiro('Preço', 1),
        dataVenda: z.iso.date({ error: 'Data da venda inválida.' }),
        motivoDesconto: z
          .string()
          .trim()
          .min(10, 'Explique o motivo do desconto (ao menos 10 caracteres).')
          .max(500),
      })
      .parse(valoresDoFormulario(form))
    await solicitarAprovacaoDesconto(ctx.db, loteId, d.preco, d.dataVenda, d.motivoDesconto)
  } catch (e) {
    if (e instanceof ErroAplicacao && e.codigo === 'justificativa_desconto')
      return { erros: { motivoDesconto: e.message }, valores: valoresDoFormulario(form) }
    return estadoDeErro(e, form)
  }
  revalidatePath(`/empreendimentos/${empreendimentoId}/lotes/${loteId}/vender`)
  revalidatePath(`/empreendimentos/${empreendimentoId}/comercial`)
  return {
    ok: 'Pedido enviado. Quando o dono aprovar, volte aqui e registre a venda.',
    valores: valoresDoFormulario(form),
  }
}
