import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  type DeclaracaoDimob,
  type LeiauteDimob,
  gerarArquivoDimob,
  pendenciasDimob,
  textoDimob,
} from './dimob'
// Cópia do leiaute gravado pela migration 20261109140000_dimob (PGD Dimob 2.8g).
import leiauteJson from './leiaute-dimob.teste.json'

const leiaute = leiauteJson as LeiauteDimob
/** Trecho da linha por posição 1-based inclusiva, como no leiaute oficial. */
const pos = (linha: string, de: number, ate: number) => linha.slice(de - 1, ate)

const declaracao: DeclaracaoDimob = {
  ano: 2025,
  retificadora: false,
  reciboAnterior: null,
  declarante: {
    cnpj: '11.222.333/0001-81',
    nome: 'Jardim das Flores SPE Ltda',
    endereco: 'Av. Goiás, 100, Centro, Goiânia',
    uf: 'GO',
    municipioRfb: '9373',
    cpfResponsavel: '529.982.247-25',
  },
  operacoes: [
    {
      ref: 'c1',
      numeroContrato: 12,
      documentoComprador: '529.982.247-25',
      comprador: 'Conceição Araújo',
      dataContrato: '2025-03-07',
      valorOperacaoCentavos: 9_000_000,
      pagoNoAnoCentavos: 3_654_000,
      tipoImovel: 'U',
      enderecoImovel: 'Quadra A Lote 1 - Jardim das Flores',
      cep: '74000000',
      municipioRfb: '9373',
      uf: 'GO',
    },
  ],
}

describe('arquivo DIMOB', () => {
  const linhas = gerarArquivoDimob(leiaute, declaracao).split('\r\n')

  it('tem cabeçalho, R01, um R03 por operação e T9, com os tamanhos do leiaute', () => {
    expect(linhas.at(-1)).toBe('')
    expect(linhas.slice(0, -1).map((l) => [l.slice(0, 3), l.length])).toEqual([
      ['DIM', 374],
      ['R01', 270],
      ['R03', 249],
      ['T9 ', 102],
    ])
    expect(linhas[0]!.trimEnd()).toBe('DIMOB')
  })

  it('R01 nas posições do leiaute', () => {
    const r = linhas[1]!
    expect(pos(r, 4, 17)).toBe('11222333000181')
    expect(pos(r, 18, 21)).toBe('2025')
    expect(pos(r, 22, 22)).toBe('0')
    expect(pos(r, 23, 32)).toBe('0000000000')
    expect(pos(r, 33, 43)).toBe('00000000000')
    expect(pos(r, 44, 103).trimEnd()).toBe('JARDIM DAS FLORES SPE LTDA')
    expect(pos(r, 104, 114)).toBe('52998224725')
    expect(pos(r, 115, 234).trimEnd()).toBe('AV. GOIAS, 100, CENTRO, GOIANIA')
    expect(pos(r, 235, 236)).toBe('GO')
    expect(pos(r, 237, 240)).toBe('9373')
    expect(pos(r, 241, 270)).toBe(' '.repeat(30))
  })

  it('R03 nas posições do leiaute (valores em centavos, data DDMMAAAA)', () => {
    const r = linhas[2]!
    expect(pos(r, 22, 28)).toBe('0000001')
    expect(pos(r, 29, 42)).toBe('52998224725   ')
    expect(pos(r, 43, 102).trimEnd()).toBe('CONCEICAO ARAUJO')
    expect(pos(r, 103, 108)).toBe('12    ')
    expect(pos(r, 109, 116)).toBe('07032025')
    expect(pos(r, 117, 130)).toBe('00000009000000')
    expect(pos(r, 131, 144)).toBe('00000003654000')
    expect(pos(r, 145, 145)).toBe('U')
    expect(pos(r, 146, 205).trimEnd()).toBe('QUADRA A LOTE 1 - JARDIM DAS FLORES')
    expect(pos(r, 206, 213)).toBe('74000000')
    expect(pos(r, 214, 217)).toBe('9373')
    expect(pos(r, 238, 239)).toBe('GO')
  })

  it('retificadora leva o recibo anterior', () => {
    const r = gerarArquivoDimob(leiaute, {
      ...declaracao,
      retificadora: true,
      reciboAnterior: '1234567890',
    })
    expect(pos(r.split('\r\n')[1]!, 22, 32)).toBe('11234567890')
  })

  it('aponta pendências e não gera o arquivo com elas', () => {
    const ruim: DeclaracaoDimob = {
      ...declaracao,
      retificadora: true,
      declarante: {
        ...declaracao.declarante,
        cnpj: null,
        endereco: null,
        uf: null,
        municipioRfb: null,
        cpfResponsavel: '1',
      },
      operacoes: [
        {
          ...declaracao.operacoes[0]!,
          documentoComprador: null,
          cep: null,
          municipioRfb: null,
          uf: null,
          numeroContrato: 1_000_000,
        },
      ],
    }
    expect(pendenciasDimob(ruim)).toHaveLength(11)
    expect(pendenciasDimob(declaracao)).toEqual([])
    expect(() => gerarArquivoDimob(leiaute, ruim)).toThrow(/11 pendência/)
  })

  it('recusa leiaute com campo desconhecido e valor numérico grande demais', () => {
    const novo = {
      ...leiaute,
      T9: [...leiaute.T9, { campo: 'novidade', tipo: 'C' as const, tamanho: 1 }],
    }
    expect(() => gerarArquivoDimob(novo, declaracao)).toThrow(/novidade/)
    const caro = {
      ...declaracao,
      operacoes: [{ ...declaracao.operacoes[0]!, valorOperacaoCentavos: 10 ** 15 }],
    }
    expect(() => gerarArquivoDimob(leiaute, caro)).toThrow(/valor_operacao/)
  })

  it('normaliza texto', () => {
    expect(textoDimob('  São   João\tdo Açaí — º ')).toBe('SAO JOAO DO ACAI')
  })
})

it('o leiaute de teste é o mesmo gravado na migration', () => {
  const sql = readFileSync(
    new URL('../../../supabase/migrations/20261109140000_dimob.sql', import.meta.url),
    'utf8',
  )
  const json = /'(\{"cabecalho".*?\})\s*'::jsonb/s.exec(sql)?.[1]
  expect(JSON.parse(json!)).toEqual(leiaute)
})
