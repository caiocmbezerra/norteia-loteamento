import { type SistemaAmortizacao, tabelaAmortizacao } from './amortizacao'
import { Decimal } from './decimal'
import { type Centavos, centavos } from './dinheiro'
import { somarMeses } from './encargos'
import { ErroMotor } from './fluxo'

export interface CondicoesContrato {
  precoCentavos: Centavos
  entradaCentavos: Centavos
  /** Data de vencimento da entrada (normalmente a data da venda). */
  dataEntrada: string
  parcelas: number
  jurosMensal: Decimal
  sistema: SistemaAmortizacao
  primeiraParcelaEm: string | null
}

export interface ParcelaContrato {
  /** 0 = entrada. */
  numero: number
  vencimento: string
  valor: Centavos
  amortizacao: Centavos
  juros: Centavos
}

/**
 * Parcelas do contrato em centavos inteiros (RN-K01, RN-K02): a diferença de arredondamento
 * vai para a última parcela, e entrada + amortizações = preço, exatamente.
 */
export function gerarParcelasContrato(c: CondicoesContrato): ParcelaContrato[] {
  if (c.entradaCentavos < 0 || c.entradaCentavos > c.precoCentavos) {
    throw new ErroMotor('A entrada deve estar entre zero e o preço.')
  }
  const financiado = c.precoCentavos - c.entradaCentavos
  if ((c.parcelas === 0) !== (financiado === 0)) {
    throw new ErroMotor('À vista: sem parcelas; parcelado: entrada menor que o preço.')
  }
  const lista: ParcelaContrato[] = []
  if (c.entradaCentavos > 0) {
    lista.push({
      numero: 0,
      vencimento: c.dataEntrada,
      valor: c.entradaCentavos,
      amortizacao: c.entradaCentavos,
      juros: centavos(0),
    })
  }
  if (c.parcelas > 0) {
    if (!c.primeiraParcelaEm) throw new ErroMotor('Informe a data da primeira parcela.')
    const tabela = tabelaAmortizacao(
      c.sistema,
      new Decimal(financiado),
      c.jurosMensal,
      c.parcelas,
      { arredondarCentavos: true },
    )
    for (const p of tabela) {
      const cent = (d: Decimal) => centavos(BigInt(d.toFixed(0)))
      lista.push({
        numero: p.numero,
        vencimento: somarMeses(c.primeiraParcelaEm, p.numero - 1),
        valor: cent(p.prestacao),
        amortizacao: cent(p.amortizacao),
        juros: cent(p.juros),
      })
    }
  }
  return lista
}
