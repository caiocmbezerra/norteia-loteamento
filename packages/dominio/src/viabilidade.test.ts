import {
  CASO_REFERENCIA,
  TMA_REFERENCIA,
  projetarViabilidade,
  resumirViabilidade,
} from '@norteia/motor-financeiro'
import { describe, expect, it } from 'vitest'
import {
  errosPorCampo,
  esquemaFormularioViabilidade,
  formularioParaPremissas,
  lerFormularioViabilidade,
  premissasParaJson,
  premissasParaMotor,
  resumoParaJson,
} from './index'

describe('premissas ⇄ JSON', () => {
  it('ida e volta do caso de referência preserva o resultado do motor', () => {
    const json = JSON.parse(JSON.stringify(premissasParaJson(CASO_REFERENCIA)))
    const volta = premissasParaMotor(json)
    const a = resumirViabilidade(projetarViabilidade(CASO_REFERENCIA), TMA_REFERENCIA)
    const b = resumirViabilidade(projetarViabilidade(volta), TMA_REFERENCIA)
    expect(b.tir.mensal!.eq(a.tir.mensal!)).toBe(true)
    expect(b.vpl.eq(a.vpl)).toBe(true)
  })

  it('recusa JSON fora do formato', () => {
    expect(() => premissasParaMotor({ versao: 2 })).toThrow()
    expect(() =>
      premissasParaMotor({ ...premissasParaJson(CASO_REFERENCIA), comissao: '5%' }),
    ).toThrow()
  })

  it('resumo em JSON: centavos inteiros, taxas em texto e fluxo mensal', () => {
    const r = resumoParaJson(
      resumirViabilidade(projetarViabilidade(CASO_REFERENCIA), TMA_REFERENCIA),
    )
    expect(r.vgvVendido).toBe('918000000')
    expect(r.tirAnual!.slice(0, 5)).toBe('0.192')
    expect(r.exposicaoMaxima.mes).toBe(30)
    expect(r.paybackSimples).toBe(76)
    expect(r.fluxoMensal[0]).toBe('-40000000')
  })

  it('resumo sem TIR guarda nulo', () => {
    const r = resumoParaJson(
      resumirViabilidade(
        projetarViabilidade({ ...CASO_REFERENCIA, lotesVendaveis: 0 }),
        TMA_REFERENCIA,
      ),
    )
    expect(r.tirMensal).toBeNull()
    expect(r.tirAnual).toBeNull()
  })
})

describe('formulário de viabilidade', () => {
  const valores = {
    nome: 'Estudo base',
    lotesVendaveis: '102',
    precoLote: '90.000,00',
    vendasMesInicio: '13',
    lotesPorMes: '4',
    entrada: '10',
    parcelas: '120',
    jurosMensal: '0,5',
    sistema: 'price',
    carenciaMeses: '1',
    comissao: '5',
    inadimplencia: '7',
    aliquota: '5,93',
    tmaMensal: '1,2',
    'custos.0.descricao': 'Terreno',
    'custos.0.centroCusto': 'terreno',
    'custos.0.tipo': 'total',
    'custos.0.valor': '400.000,00',
    'custos.0.mesInicio': '0',
    'custos.0.mesFim': '0',
    'custos.1.descricao': '',
    'custos.1.valor': '',
    'custos.1.tipo': 'total',
  }

  it('converte os valores digitados nas premissas do motor', () => {
    const f = esquemaFormularioViabilidade.parse(lerFormularioViabilidade(valores))
    const { premissas, tmaMensal } = formularioParaPremissas(f)
    expect(tmaMensal).toBe('0.012')
    expect(premissas).toMatchObject({
      lotesVendaveis: 102,
      precoLoteCentavos: 9_000_000,
      pagamento: { entrada: '0.1', jurosMensal: '0.005', parcelas: 120 },
      comissao: '0.05',
      inadimplencia: '0.07',
      aliquotaSobreRecebido: '0.0593',
    })
    expect(premissas.custos).toEqual([
      {
        descricao: 'Terreno',
        centroCusto: 'terreno',
        tipo: 'total',
        valorCentavos: 40_000_000,
        mesInicio: 0,
        mesFim: 0,
      },
    ])
    expect(() => premissasParaMotor(premissas)).not.toThrow()
  })

  it('ordena as linhas de custo pelo índice', () => {
    const r = lerFormularioViabilidade({
      'custos.10.descricao': 'B',
      'custos.2.descricao': 'A',
    }) as {
      custos: { descricao: string }[]
    }
    expect(r.custos.map((c) => c.descricao)).toEqual(['A', 'B'])
  })

  it('aponta erros em português', () => {
    const r = esquemaFormularioViabilidade.safeParse(
      lerFormularioViabilidade({
        ...valores,
        entrada: '10%',
        jurosMensal: '12',
        precoLote: 'noventa',
        'custos.0.mesFim': '-1',
      }),
    )
    expect(r.success).toBe(false)
    const erros = errosPorCampo(r.error!)
    expect(erros.entrada).toContain('percentual')
    expect(erros.jurosMensal).toContain('no máximo 10%')
    expect(erros.precoLote).toContain('90.000,00')
    expect(erros.custos).toBeDefined()
  })

  it('custo com mês final antes do inicial', () => {
    const r = esquemaFormularioViabilidade.safeParse(
      lerFormularioViabilidade({ ...valores, 'custos.0.mesInicio': '5', 'custos.0.mesFim': '2' }),
    )
    expect(r.success).toBe(false)
    expect(r.error!.issues[0]!.message).toContain('mês final')
  })
})
