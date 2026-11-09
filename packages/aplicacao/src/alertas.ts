import type { ClienteBanco } from '@norteia/db'
import { formatarMoeda, formatarPercentual } from '@norteia/dominio'
import { arredondarCentavos, somarMeses } from '@norteia/motor-financeiro'
import { type Alerta, type LimitesAlertas, avaliarAlertas } from '@norteia/projecao'
import { carregarPainelCustos } from './custos'
import { traduzirErroBanco } from './erros'
import { carregarConsolidado } from './paineis'

type ErroBanco = { code?: string; message: string; hint?: string | null }
function falhar(error: ErroBanco | null) {
  if (error) throw traduzirErroBanco(error)
}

export interface AlertaEmpreendimento {
  empreendimentoId: string
  empreendimento: string
  alerta: Alerta
  /** Frase pronta para tela e assistente. */
  texto: string
}

const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))
const pct = (f: string) => formatarPercentual(f, 1)
const mesCivil = (dataBase: string, n: number) => {
  const d = somarMeses(`${dataBase.slice(0, 7)}-01`, n)
  return `${d.slice(5, 7)}/${d.slice(0, 4)}`
}
const diasAntes = (hoje: string, dias: number) =>
  new Date(Date.parse(`${hoje}T12:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10)

export function textoDoAlerta(a: Alerta, dataBase: string): string {
  switch (a.tipo) {
    case 'aporte':
      return `Aporte de ${moeda(a.valorCentavos)} necessário a partir de ${mesCivil(dataBase, a.mes)} (${a.meses} ${a.meses === 1 ? 'mês' : 'meses'} na janela).`
    case 'custo':
      return `Custos de ${moeda(a.valorCentavos)} estão ${pct(a.excesso)} acima do plano (${moeda(a.referenciaCentavos)}).`
    case 'exposicao':
      return `Exposição máxima de ${moeda(a.valorCentavos)} está ${pct(a.excesso)} acima do plano (${moeda(a.referenciaCentavos)}).`
    case 'inadimplencia':
      return `Inadimplência em ${pct(a.taxa)} da carteira (${moeda(a.vencidoCentavos)} vencidos)${a.crescente ? `, subindo desde ${pct(a.taxaAnterior)} há 60 dias` : ''}.`
  }
}

async function limites(
  db: ClienteBanco,
  tenantId: string,
  empreendimentoId: string,
  hoje: string,
): Promise<LimitesAlertas> {
  const ler = async (chave: string, padrao: string) => {
    const { data, error } = await db.rpc('parametro_vigente', {
      p_chave: chave,
      p_data: hoje,
      p_tenant: tenantId,
      p_escopo: 'empreendimento',
      p_escopo_id: empreendimentoId,
    })
    falhar(error)
    return data === null || data === undefined ? padrao : String(data).replace(/^"|"$/g, '')
  }
  const [horizonte, desvio, alta, crescimento] = await Promise.all([
    ler('alertas.horizonte_aporte_meses', '3'),
    ler('alertas.desvio_plano', '0.05'),
    ler('alertas.inadimplencia_alta', '0.05'),
    ler('alertas.crescimento_inadimplencia', '0.2'),
  ])
  return {
    horizonteAporteMeses: Number(horizonte),
    desvio,
    inadimplenciaAlta: alta,
    crescimentoInadimplencia: crescimento,
  }
}

/** Alertas de todos os empreendimentos que o usuário vê, os críticos primeiro. */
export async function carregarAlertas(
  db: ClienteBanco,
  tenantId: string,
  hoje: string,
): Promise<AlertaEmpreendimento[]> {
  const { linhas } = await carregarConsolidado(db, tenantId, hoje)
  const datas = [diasAntes(hoje, 60), diasAntes(hoje, 30), hoje]
  const porEmpreendimento = await Promise.all(
    linhas.map(async (l) => {
      const [painel, historico, lim] = await Promise.all([
        carregarPainelCustos(db, l.id, hoje),
        db.rpc('inadimplencia_historico', { p_empreendimento: l.id, p_datas: datas }),
        limites(db, tenantId, l.id, hoje),
      ])
      falhar(historico.error)
      const pontos = (historico.data ?? []) as unknown as {
        data: string
        vencido: number
        saldo: number
      }[]
      const alertas = avaliarAlertas(
        {
          hoje,
          dataBase: painel.dataBase,
          atual: painel.atual
            ? {
                necessidadeDeAporte: painel.atual.necessidadeDeAporte,
                custos: painel.atual.custos,
                exposicaoMaxima: painel.atual.exposicaoMaxima.valor,
              }
            : null,
          plano: painel.plano
            ? { custos: painel.plano.custos, exposicaoMaxima: painel.plano.exposicaoMaxima.valor }
            : null,
          inadimplencia: pontos.map((p) => ({
            data: p.data,
            vencidoCentavos: Number(p.vencido),
            saldoCentavos: Number(p.saldo),
          })),
        },
        lim,
      )
      return alertas.map((alerta) => ({
        empreendimentoId: l.id,
        empreendimento: l.nome,
        alerta,
        texto: textoDoAlerta(alerta, painel.dataBase),
      }))
    }),
  )
  const peso = (a: AlertaEmpreendimento) => (a.alerta.gravidade === 'critico' ? 0 : 1)
  return porEmpreendimento.flat().sort((a, b) => peso(a) - peso(b))
}
