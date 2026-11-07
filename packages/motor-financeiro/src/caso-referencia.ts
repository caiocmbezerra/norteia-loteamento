import { Decimal } from './decimal'
import { centavos } from './dinheiro'
import type { Taxa } from './taxa'
import type { PremissasViabilidade } from './viabilidade'

/**
 * Caso de referência da especificação (docs/dominio.md §3). Usado pelo teste obrigatório
 * do motor (RN-F17) e pelo empreendimento de demonstração.
 *
 * 120 lotes: 18 em permuta física (fora do fluxo de vendas) e 102 à venda.
 */
export const CASO_REFERENCIA: PremissasViabilidade = {
  base: 'real',
  lotesVendaveis: 102,
  precoLoteCentavos: centavos(9_000_000),
  vendas: { mesInicio: 13, lotesPorMes: 4 },
  pagamento: {
    entrada: new Decimal('0.10'),
    parcelas: 120,
    jurosMensal: new Decimal('0.005'),
    sistema: 'price',
    carenciaMeses: 1,
  },
  comissao: new Decimal('0.05'),
  inadimplencia: new Decimal('0.07'),
  inadimplenciaNaEntrada: false,
  aliquotaSobreRecebido: new Decimal('0.0593'),
  custos: [
    {
      descricao: 'Terreno',
      centroCusto: 'terreno',
      tipo: 'total',
      valorCentavos: centavos(40_000_000),
      mesInicio: 0,
      mesFim: 0,
    },
    {
      descricao: 'Aprovação e registro',
      centroCusto: 'aprovacao',
      tipo: 'total',
      valorCentavos: centavos(35_000_000),
      mesInicio: 1,
      mesFim: 12,
    },
    {
      descricao: 'Infraestrutura',
      centroCusto: 'infraestrutura',
      tipo: 'total',
      valorCentavos: centavos(300_000_000),
      mesInicio: 13,
      mesFim: 30,
    },
    {
      descricao: 'Marketing e stand',
      centroCusto: 'comercial.marketing',
      tipo: 'total',
      valorCentavos: centavos(30_000_000),
      mesInicio: 13,
      mesFim: 36,
    },
    {
      descricao: 'Administração',
      centroCusto: 'administracao',
      tipo: 'mensal',
      valorCentavos: centavos(800_000),
      mesInicio: 1,
      mesFim: 48,
    },
  ],
}

export const TMA_REFERENCIA: Taxa = { base: 'real', mensal: new Decimal('0.012') }
