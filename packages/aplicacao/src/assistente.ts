import type { ClienteBanco } from '@norteia/db'
import { formatarData, formatarMoeda, formatarPercentual } from '@norteia/dominio'
import type { FerramentaAssistente } from '@norteia/integracoes/assistente'
import { Decimal, arredondarCentavos, somarMeses } from '@norteia/motor-financeiro'
import { carregarAlertas } from './alertas'
import { carregarCarteira, paginar } from './carteira'
import { carregarPainelCustos } from './custos'
import { ErroAplicacao } from './erros'
import { type LinhaConsolidado, carregarConsolidado } from './paineis'

/**
 * Ferramentas de leitura do assistente (Fase 8b). Todas usam o cliente do banco do usuário (RLS):
 * o assistente só vê o que o usuário vê. Valores saem já formatados, do motor e da carteira, para
 * a resposta citar os mesmos números das telas.
 */
const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))
const moedaD = (d: Decimal) => formatarMoeda(arredondarCentavos(d.toString()))
const pct = (d: Decimal | null | undefined, casas = 1) =>
  d ? formatarPercentual(d, casas) : 'sem TIR'

const PARAM_EMPREENDIMENTO = {
  type: 'object' as const,
  properties: {
    empreendimento: { type: 'string', description: 'Nome (ou parte do nome) do empreendimento.' },
  },
  required: ['empreendimento'],
}

/** Mês n contado da data-base → "mm/aaaa". */
function mesCivil(dataBase: string, n: number) {
  const d = somarMeses(`${dataBase.slice(0, 7)}-01`, n)
  return `${d.slice(5, 7)}/${d.slice(0, 4)}`
}

function normalizar(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function ferramentasDoAssistente(
  db: ClienteBanco,
  tenantId: string,
  hoje: string,
): FerramentaAssistente[] {
  let consolidado: ReturnType<typeof carregarConsolidado> | null = null
  const painel = () => (consolidado ??= carregarConsolidado(db, tenantId, hoje))

  async function achar(nome: unknown): Promise<LinhaConsolidado> {
    const alvo = normalizar(String(nome ?? ''))
    const { linhas } = await painel()
    const exato = linhas.find((l) => normalizar(l.nome) === alvo)
    const parciais = linhas.filter((l) => normalizar(l.nome).includes(alvo))
    const l = exato ?? (parciais.length === 1 ? parciais[0] : undefined)
    if (!l)
      throw new ErroAplicacao(
        parciais.length > 1
          ? `Mais de um empreendimento combina com "${String(nome)}": ${parciais.map((p) => p.nome).join(', ')}.`
          : `Empreendimento "${String(nome)}" não encontrado. Disponíveis: ${linhas.map((x) => x.nome).join(', ') || 'nenhum'}.`,
      )
    return l
  }

  return [
    {
      nome: 'resumo_loteadora',
      descricao:
        'Visão geral da loteadora hoje: por empreendimento e no total, lotes (vendidos, disponíveis), VGV vendido, recebido, recebido no mês, saldo da carteira, vencido, inadimplentes, custos pagos e a pagar, e indicadores do plano aprovado (TIR, VPL, lucro, exposição).',
      esquema: { type: 'object', properties: {} },
      async executar() {
        const p = await painel()
        const linha = (
          nome: string,
          x: Omit<LinhaConsolidado, 'id' | 'nome' | 'situacao' | 'speId' | 'spe' | 'plano'>,
        ) =>
          `${nome}: ${x.lotes} lotes (${x.vendidos} vendidos, ${x.disponiveis} disponíveis, ${x.reservados} reservados, ${x.permuta} em permuta); VGV vendido ${moeda(x.vgvVendido)}; recebido ${moeda(x.recebido)} (no mês ${moeda(x.recebidoMes)}); saldo da carteira ${moeda(x.saldoCarteira)}; vencido ${moeda(x.vencido)} (${x.inadimplentes} contratos inadimplentes); custos pagos ${moeda(x.custosPagos)}; a pagar ${moeda(x.aPagar)}; devoluções a pagar ${moeda(x.aDevolver)}`
        return [
          `Data de referência: ${formatarData(hoje)}.`,
          ...p.linhas.map(
            (l) =>
              `${linha(l.nome, l)}${l.plano ? `; plano aprovado v${l.plano.versao}: TIR ${l.plano.tirAnual ? formatarPercentual(l.plano.tirAnual, 1) : 'sem TIR'} a.a., VPL ${formatarMoeda(arredondarCentavos(l.plano.vpl))}, lucro ${formatarMoeda(arredondarCentavos(l.plano.lucro))}, exposição máxima ${formatarMoeda(arredondarCentavos(l.plano.exposicao))}` : '; sem plano aprovado'}.`,
          ),
          `${linha('Total da loteadora', p.totais)}.`,
        ].join('\n')
      },
    },
    {
      nome: 'carteira_empreendimento',
      descricao:
        'Carteira de recebíveis de um empreendimento: saldo a receber, vencido, recebido no mês, contratos inadimplentes por faixa de atraso, os maiores atrasos e o previsto para receber em cada um dos próximos 12 meses.',
      esquema: PARAM_EMPREENDIMENTO,
      async executar(e) {
        const l = await achar(e.empreendimento)
        const [c, abertas] = await Promise.all([
          carregarCarteira(db, l.id, hoje),
          paginar((de, ate) =>
            db
              .from('parcelas')
              .select(
                'vencimento, valor_centavos, pago_centavos, contratos!inner(empreendimento_id)',
              )
              .eq('contratos.empreendimento_id', l.id)
              .eq('situacao', 'aberta')
              .order('id')
              .range(de, ate),
          ),
        ])
        const porMes = new Map<string, number>()
        for (const p of abertas) {
          const mes = p.vencimento < hoje ? 'vencido' : p.vencimento.slice(0, 7)
          porMes.set(mes, (porMes.get(mes) ?? 0) + p.valor_centavos - p.pago_centavos)
        }
        const meses = [...porMes]
          .filter(([m]) => m !== 'vencido')
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(0, 12)
        const atrasados = c.contratos
          .filter((x) => x.vencidoCentavos > 0)
          .sort((a, b) => b.maiorAtraso - a.maiorAtraso)
          .slice(0, 5)
        const t = c.totais
        return [
          `Carteira de ${l.nome} em ${formatarData(hoje)}: ${c.contratos.length} contratos; saldo a receber ${moeda(t.saldoCentavos)}; vencido ${moeda(t.vencidoCentavos)}; recebido no mês ${moeda(t.recebidoNoMesCentavos)}; ${t.contratosInadimplentes} contratos inadimplentes (até 30 dias: ${t.faixas.ate30}; 31 a 90: ${t.faixas.ate90}; acima de 90: ${t.faixas.acima90}).`,
          meses.length
            ? `Previsto a receber por mês (parcelas em aberto): ${meses.map(([m, v]) => `${m.slice(5)}/${m.slice(0, 4)} ${moeda(v)}`).join('; ')}.`
            : 'Sem parcelas a vencer.',
          atrasados.length
            ? `Maiores atrasos: ${atrasados.map((x) => `${x.lote} (${x.comprador ?? 'sem comprador'}): ${x.maiorAtraso} dias, vencido ${moeda(x.vencidoCentavos)}`).join('; ')}.`
            : 'Nenhum contrato em atraso.',
        ].join('\n')
      },
    },
    {
      nome: 'viabilidade_empreendimento',
      descricao:
        'Indicadores do empreendimento pelo motor financeiro, no plano aprovado e no fluxo atual (realizado + projetado): TIR, VPL, lucro, margem, exposição máxima, payback e necessidade de aporte, mais o custo por lote.',
      esquema: PARAM_EMPREENDIMENTO,
      async executar(e) {
        const l = await achar(e.empreendimento)
        const p = await carregarPainelCustos(db, l.id, hoje)
        const resumo = (nome: string, r: typeof p.atual) => {
          if (!r) return `${nome}: não disponível.`
          const aporte = r.necessidadeDeAporte.reduce((t, v) => t.plus(v), new Decimal(0))
          return `${nome}: TIR ${pct(r.tir.anual)} ao ano${r.tir.possivelTirMultipla ? ' (fluxo com mais de uma troca de sinal: TIR pode não ser única)' : ''}; VPL ${moedaD(r.vpl)}; lucro ${moedaD(r.lucroNominal)}; margem sobre VGV ${pct(r.margemSobreVgv)}; recebido total ${moedaD(r.recebido)}; custos ${moedaD(r.custos)}; tributos ${moedaD(r.tributos)}; exposição máxima ${moedaD(r.exposicaoMaxima.valor)} em ${mesCivil(p.dataBase, r.exposicaoMaxima.mes)}; payback simples ${r.paybackSimples ?? 'não atingido'} meses; necessidade de aporte total ${moedaD(aporte)}.`
        }
        return [
          `${l.nome} (data-base ${formatarData(p.dataBase)}):`,
          resumo('Plano aprovado', p.plano),
          resumo('Fluxo atual', p.atual),
          p.custoPorLote ? `Custo por lote: ${moedaD(p.custoPorLote)}.` : '',
        ]
          .filter(Boolean)
          .join('\n')
      },
    },
    {
      nome: 'alertas_risco',
      descricao:
        'Alertas de risco da loteadora hoje: aporte necessário nos próximos meses, custos e exposição acima do plano, inadimplência alta ou crescendo, por empreendimento, com a gravidade (crítico ou atenção).',
      esquema: { type: 'object', properties: {} },
      async executar() {
        const alertas = await carregarAlertas(db, tenantId, hoje)
        if (alertas.length === 0) return `Nenhum alerta de risco em ${formatarData(hoje)}.`
        return [
          `Alertas em ${formatarData(hoje)}:`,
          ...alertas.map(
            (a) =>
              `- ${a.empreendimento} (${a.alerta.gravidade === 'critico' ? 'crítico' : 'atenção'}): ${a.texto}`,
          ),
        ].join('\n')
      },
    },
  ]
}
