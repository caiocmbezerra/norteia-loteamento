import type { ClienteBanco } from '@norteia/db'
import type { ContratoImportado } from '@norteia/integracoes/importacao'
import {
  CASO_REFERENCIA,
  Decimal,
  centavos,
  gerarParcelasContrato,
  somarMeses,
} from '@norteia/motor-financeiro'
import { traduzirErroBanco } from './erros'
import { importarCarteira } from './importacao'

const COMPRADORES = [
  'Ana Beatriz Rocha',
  'Bruno Carvalho',
  'Carla Mendes',
  'Diego Nunes',
  'Elisa Prado',
  'Fábio Teixeira',
  'Gabriela Lima',
  'Heitor Souza',
  'Isabela Castro',
  'João Pedro Alves',
  'Karina Duarte',
  'Lucas Farias',
  'Mariana Gomes',
  'Nicolas Ribeiro',
  'Olívia Martins',
]

/**
 * Carteira fictícia da demonstração: vendas mensais desde jan/2026 até um mês antes de `hoje`, com
 * o plano do caso de referência (entrada de 10%, 120 parcelas Price a 0,5% a.m.). O que venceu
 * até hoje está pago no vencimento, menos dois contratos com as duas últimas parcelas em atraso.
 * Entra pela importação de carteira (tudo de uma vez, com o saldo conciliado).
 */
export async function popularCarteiraDemonstracao(
  db: ClienteBanco,
  empreendimentoId: string,
  hoje: string,
): Promise<number> {
  const { error } = await db
    .from('empreendimentos')
    .update({ situacao: 'em_vendas', data_registro: '2026-01-02' })
    .eq('id', empreendimentoId)
  if (error) throw traduzirErroBanco(error)

  const preco = CASO_REFERENCIA.precoLoteCentavos
  const entrada = centavos(new Decimal(preco).times('0.10').toNumber())
  const contratos: ContratoImportado[] = []
  for (let i = 0; i < COMPRADORES.length; i++) {
    const dataVenda = somarMeses('2026-01-15', i)
    if (somarMeses(dataVenda, 1) > hoje) break
    const parcelas = gerarParcelasContrato({
      precoCentavos: preco,
      entradaCentavos: entrada,
      dataEntrada: dataVenda,
      parcelas: 120,
      jurosMensal: new Decimal('0.005'),
      sistema: 'price',
      primeiraParcelaEm: somarMeses(dataVenda, 1),
    })
    const vencidas = parcelas.filter((p) => p.vencimento < hoje).map((p) => p.numero)
    const emAtraso = i === 2 || i === 6 ? new Set(vencidas.slice(-2)) : new Set<number>()
    contratos.push({
      ref: `DEMO-${String(i + 1).padStart(2, '0')}`,
      quadra: 'A',
      lote: String(i + 1),
      comprador: { nome: COMPRADORES[i]!, cpf: null, email: null, telefone: null },
      data_venda: dataVenda,
      preco,
      indice: i % 2 === 0 ? 'IPCA' : null,
      parcelas: parcelas.map((p) => {
        const paga = p.vencimento < hoje && !emAtraso.has(p.numero)
        return {
          numero: p.numero,
          vencimento: p.vencimento,
          valor: p.valor,
          pago: paga ? p.valor : 0,
          data_pagamento: paga ? p.vencimento : null,
        }
      }),
    })
  }
  if (contratos.length === 0) return 0
  const saldo = contratos.flatMap((c) => c.parcelas).reduce((t, p) => t + p.valor - p.pago, 0)
  await importarCarteira(db, empreendimentoId, {
    origem: 'Demonstração',
    arquivo: null,
    saldoOrigemCentavos: saldo,
    contratos,
  })
  return contratos.length
}
