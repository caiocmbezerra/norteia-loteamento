import { describe, expect, it } from 'vitest'
import {
  FORMATO_PADRAO,
  type FatoContabil,
  arquivoContabil,
  caixaCompetencia,
  lancamentosContabeis,
} from './contabil'

const fatos: FatoContabil[] = [
  {
    data: '2026-03-07',
    evento: 'venda_contratada',
    valor: 9_000_000,
    documento: 'CT 1',
    empreendimento: 'Jardim',
    descricao: 'Venda QA L1 - Ana',
  },
  {
    data: '2026-03-07',
    evento: 'recebimento_parcela',
    valor: 900_000,
    documento: 'CT 1 P0',
    empreendimento: 'Jardim',
    descricao: 'Recebimento CT 1 parcela 0 - Ana',
  },
  {
    data: '2026-04-10',
    evento: 'recebimento_encargos',
    valor: 1_234,
    documento: 'CT 1 P1',
    empreendimento: 'Jardim',
    descricao: 'Multa; juros "mora"',
  },
  {
    data: '2026-04-15',
    evento: 'custo_lancado',
    valor: 50_000,
    documento: 'NF 9',
    empreendimento: 'Jardim',
    descricao: 'Topografia',
  },
  {
    data: '2026-05-02',
    evento: 'custo_pago',
    valor: 50_000,
    documento: 'NF 9',
    empreendimento: 'Jardim',
    descricao: 'Pagamento Topografia',
  },
  {
    data: '2026-05-20',
    evento: 'distrato',
    valor: 9_000_000,
    documento: 'CT 1',
    empreendimento: 'Jardim',
    descricao: 'Distrato',
  },
  {
    data: '2026-05-21',
    evento: 'devolucao_distrato',
    valor: 300_000,
    documento: 'CT 1 D1',
    empreendimento: 'Jardim',
    descricao: 'Devolução',
  },
  {
    data: '2026-05-22',
    evento: 'aporte_socio',
    valor: 100_000,
    documento: 'SO 1',
    empreendimento: null,
    descricao: 'Aporte - Pedro',
  },
]

describe('lançamentos contábeis', () => {
  const regras = [
    {
      evento: 'venda_contratada' as const,
      contaDebito: '1.1.2',
      contaCredito: '3.1.1',
      historico: '{descricao} ({documento})',
    },
    {
      evento: 'recebimento_parcela' as const,
      contaDebito: '1.1.1',
      contaCredito: '1.1.2',
      historico: '{evento}: {descricao}',
    },
    {
      evento: 'recebimento_encargos' as const,
      contaDebito: '1.1.1',
      contaCredito: '3.2.1',
      historico: '{descricao}',
    },
  ]

  it('aplica as regras e aponta eventos sem regra', () => {
    const r = lancamentosContabeis(fatos, regras)
    expect(r.lancamentos).toHaveLength(3)
    expect(r.lancamentos[0]).toEqual({
      data: '2026-03-07',
      debito: '1.1.2',
      credito: '3.1.1',
      valorCentavos: 9_000_000,
      historico: 'Venda QA L1 - Ana (CT 1)',
      documento: 'CT 1',
      empreendimento: 'Jardim',
    })
    expect(r.lancamentos[1]!.historico).toBe(
      'Recebimento de parcela: Recebimento CT 1 parcela 0 - Ana',
    )
    expect(r.semRegra.map((s) => s.evento).sort()).toEqual(
      ['aporte_socio', 'custo_lancado', 'custo_pago', 'devolucao_distrato', 'distrato'].sort(),
    )
  })

  it('gera o CSV no formato do cliente', () => {
    const { lancamentos } = lancamentosContabeis(fatos, regras)
    expect(arquivoContabil(lancamentos, FORMATO_PADRAO).split('\r\n')).toEqual([
      'Data;Debito;Credito;Valor;Historico;Documento',
      '07/03/2026;1.1.2;3.1.1;90000,00;Venda QA L1 - Ana (CT 1);CT 1',
      '07/03/2026;1.1.1;1.1.2;9000,00;Recebimento de parcela: Recebimento CT 1 parcela 0 - Ana;CT 1 P0',
      '10/04/2026;1.1.1;3.2.1;12,34;"Multa; juros ""mora""";CT 1 P1',
      '',
    ])
    const outro = arquivoContabil(lancamentos.slice(2), {
      separador: 'tab',
      decimal: '.',
      formatoData: 'DDMMAAAA',
      colunas: ['documento', 'valor', 'data'],
      cabecalho: false,
    })
    expect(outro).toBe('CT 1 P1\t12.34\t10042026\r\n')
    expect(
      arquivoContabil([{ ...lancamentos[0]!, valorCentavos: -5 }], {
        ...FORMATO_PADRAO,
        formatoData: 'AAAA-MM-DD',
        cabecalho: false,
        colunas: ['data', 'valor'],
      }),
    ).toBe('2026-03-07;-0,05\r\n')
  })
})

describe('caixa × competência', () => {
  it('separa receita e custo por regime, mês a mês', () => {
    expect(caixaCompetencia(fatos)).toEqual([
      {
        mes: '2026-03',
        receitaCompetenciaCentavos: 9_000_000,
        receitaCaixaCentavos: 900_000,
        custoCompetenciaCentavos: 0,
        custoCaixaCentavos: 0,
        resultadoCompetenciaCentavos: 9_000_000,
        resultadoCaixaCentavos: 900_000,
      },
      {
        mes: '2026-04',
        receitaCompetenciaCentavos: 0,
        receitaCaixaCentavos: 1_234,
        custoCompetenciaCentavos: 50_000,
        custoCaixaCentavos: 0,
        resultadoCompetenciaCentavos: -50_000,
        resultadoCaixaCentavos: 1_234,
      },
      {
        mes: '2026-05',
        receitaCompetenciaCentavos: -9_000_000,
        receitaCaixaCentavos: -300_000,
        custoCompetenciaCentavos: 0,
        custoCaixaCentavos: 50_000,
        resultadoCompetenciaCentavos: -9_000_000,
        resultadoCaixaCentavos: -350_000,
      },
    ])
  })
})
