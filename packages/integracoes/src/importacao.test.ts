import { describe, expect, it } from 'vitest'
import { MODELO_CARTEIRA_CSV, interpretarCarteira, lerCsv, sugerirMapeamento } from './importacao'

describe('importação de carteira', () => {
  it('lê a planilha-modelo, sugere o mapeamento e agrupa por contrato', () => {
    const { cabecalho, linhas } = lerCsv(`\uFEFF${MODELO_CARTEIRA_CSV}\r\n`)
    expect(cabecalho).toHaveLength(15)
    const mapa = sugerirMapeamento(cabecalho)
    expect(mapa).toMatchObject({
      contrato: 0,
      quadra: 1,
      lote: 2,
      comprador_nome: 3,
      comprador_cpf: 4,
      valor_pago: 13,
      data_pagamento: 14,
    })
    const r = interpretarCarteira(linhas, mapa)
    expect(r.erros).toEqual([])
    expect(r.resumo).toEqual({
      contratos: 1,
      parcelas: 3,
      contratadoCentavos: 9_000_000,
      recebidoCentavos: 1_035_000,
      saldoAbertoCentavos: 135_000,
    })
    expect(r.contratos[0]).toMatchObject({
      ref: '1001',
      comprador: { nome: 'Maria da Silva', cpf: '52998224725' },
      data_venda: '2024-01-10',
      indice: 'IPCA',
      parcelas: [
        { numero: 0, valor: 900_000, pago: 900_000, data_pagamento: '2024-01-10' },
        { numero: 1, vencimento: '2024-02-10', pago: 135_000 },
        { numero: 2, pago: 0, data_pagamento: null },
      ],
    })
  })

  it('aceita outros nomes de coluna, vírgula, aspas e decimal com ponto', () => {
    const csv =
      'Cód. Contrato,QD,LT,Cliente,Data Contrato,Valor Total,Parcela,Data Vencimento,Valor Parcela,Valor Recebido,Data Recebimento\n' +
      'X9,B,7,"Souza, João",2023-05-02,50000.00,1,2023-06-02,1000.5,1100.50,2023-06-10\n'
    const { cabecalho, linhas } = lerCsv(csv)
    const mapa = sugerirMapeamento(cabecalho)
    const r = interpretarCarteira(linhas, mapa)
    expect(r.erros).toEqual([])
    expect(r.contratos[0]).toMatchObject({
      ref: 'X9',
      quadra: 'B',
      lote: '7',
      comprador: { nome: 'Souza, João', cpf: null },
      preco: 5_000_000,
    })
    // Pago acima da parcela (encargos da origem) não gera saldo negativo.
    expect(r.contratos[0]!.parcelas[0]).toMatchObject({ valor: 100_050, pago: 110_050 })
    expect(r.resumo.saldoAbertoCentavos).toBe(0)
  })

  it('aponta erros por linha e exige as colunas obrigatórias', () => {
    const cab =
      'contrato;quadra;lote;comprador;cpf;data_venda;preco;parcela;vencimento;valor;valor_pago;data_pagamento'
    const { cabecalho, linhas } = lerCsv(
      [
        cab,
        '1;A;1;Ana;111.111.111-11;01/01/2024;10.000,00;1;01/02/2024;100,00;;',
        '2;A;2;Bia;;01/01/2024;10.000,00;x;01/02/2024;100,00;;',
        '3;A;3;Caio;;01/01/2024;10.000,00;1;31/02/2024;100,00;;',
        '4;A;4;Davi;;01/01/2024;10.000,00;1;01/02/2024;100,00;50,00;',
        '5;A;5;Eva;;01/01/2024;10.000,00;1;01/02/2024;0,00;;',
        '6;A;6;;;01/01/2024;10.000,00;1;01/02/2024;100,00;;',
        '7;A;7;Fábio;;01/01/2024;10.000,00;1;01/02/2024;100,00;;',
        '7;A;7;Fábio;;01/01/2024;10.000,00;1;01/03/2024;100,00;;',
        '8;A;7;Gil;;01/01/2024;10.000,00;1;01/02/2024;100,00;;',
        '7;A;9;Fábio;;01/01/2024;10.000,00;2;01/02/2024;100,00;;',
      ].join('\n'),
    )
    const r = interpretarCarteira(linhas, sugerirMapeamento(cabecalho))
    expect(r.erros.map((e) => [e.linha, e.mensagem])).toEqual([
      [2, 'CPF/CNPJ inválido.'],
      [3, 'Número da parcela inválido.'],
      [4, 'Data inexistente: "31/02/2024"'],
      [5, 'Informe a data do pagamento.'],
      [6, 'Valor da parcela precisa ser positivo.'],
      [7, 'Nome do comprador em branco.'],
      [9, 'Parcela 1 repetida no contrato 7.'],
      [10, 'Quadra A lote 7 aparece em mais de um contrato (7 e 8).'],
      [11, 'Contrato 7 com lote ou comprador diferente das linhas anteriores.'],
    ])
    expect(r.resumo.contratos).toBe(1)
    const sem = interpretarCarteira(linhas, { ...sugerirMapeamento(cabecalho), valor: null })
    expect(sem.erros[0]!.mensagem).toBe('Associe as colunas: Valor da parcela.')
    expect(lerCsv('')).toEqual({ cabecalho: [], linhas: [] })
  })
})

it('aceita IGPM e INPC e recusa índice desconhecido', () => {
  const cab = 'contrato;quadra;lote;comprador;data_venda;preco;indice;parcela;vencimento;valor'
  const { cabecalho, linhas } = lerCsv(
    [
      cab,
      '1;A;1;Ana;01/01/2024;100,00;igpm;1;01/02/2024;100,00',
      '2;A;2;Bia;01/01/2024;100,00;TR;1;01/02/2024;100,00',
      '3;A;3;Caio;01/01/2024;100,00;inpc;1;01/02/2024;100,00',
    ].join('\n'),
  )
  const r = interpretarCarteira(linhas, sugerirMapeamento(cabecalho))
  expect(r.contratos[0]!.indice).toBe('IGP-M')
  expect(r.contratos.find((c) => c.ref === '3')!.indice).toBe('INPC')
  expect(r.erros).toEqual([
    { linha: 3, mensagem: 'Índice "TR" desconhecido (use IPCA, INPC, IGP-M ou INCC).' },
  ])
})
