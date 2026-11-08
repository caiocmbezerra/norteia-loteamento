import { carregarContrato } from '@norteia/aplicacao'
import { formatarData, formatarMoeda } from '@norteia/dominio'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'
import { BotaoImprimir } from './imprimir'

export const metadata: Metadata = { title: 'Termo de quitação' }

const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))
const cpf = (v: string) => v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
const cnpj = (v: string) => v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')

/**
 * Termo de quitação (RN-K09): só com o contrato quitado (saldo zero). Texto-modelo provisório —
 * VALIDAR COM ADVOGADO (PL-17).
 */
export default async function PaginaQuitacao({
  params,
}: {
  params: Promise<{ id: string; contratoId: string }>
}) {
  const { id, contratoId } = await params
  const ctx = await exigirContexto()
  if (!temPapel(ctx, 'dono', 'financeiro', 'contador')) redirect(`/empreendimentos/${id}`)
  const c = await carregarContrato(ctx.db, contratoId, hojeSaoPaulo())
  if (!c || c.empreendimentoId !== id) notFound()
  if (c.situacao !== 'quitado') redirect(`/empreendimentos/${id}/carteira/${contratoId}`)

  const [{ data: emp }, { data: contrato }] = await Promise.all([
    ctx.db
      .from('empreendimentos')
      .select('nome, municipio, uf, spes(razao_social, cnpj)')
      .eq('id', id)
      .single(),
    ctx.db
      .from('contratos')
      .select('criado_em, vendas(data_venda, preco_centavos), compradores(nome, cpf)')
      .eq('id', contratoId)
      .single(),
  ])
  const recebido = c.parcelas
    .flatMap((p) => p.recebimentos)
    .filter((r) => !r.estornado)
    .reduce((t, r) => t + r.valorCentavos, 0)
  const credora = emp?.spes?.razao_social ?? 'A vendedora'
  const comprador = contrato?.compradores

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/empreendimentos/${id}/carteira/${contratoId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Contrato
        </Link>
        <BotaoImprimir />
      </div>
      <div className="print:hidden">
        <Alerta tipo="aviso">
          Texto-modelo provisório: revise com o advogado da empresa antes de usar (pendência PL-17).
        </Alerta>
      </div>

      <article className="flex flex-col gap-4 rounded-xl border bg-background p-8 text-sm leading-relaxed print:border-0 print:p-0">
        <h1 className="text-center text-lg font-semibold uppercase">Termo de quitação</h1>
        <p>
          <strong>{credora}</strong>
          {emp?.spes?.cnpj && `, inscrita no CNPJ sob o nº ${cnpj(emp.spes.cnpj)}`}, na qualidade de
          vendedora, declara para os devidos fins que{' '}
          <strong>{comprador?.nome ?? c.comprador}</strong>
          {comprador?.cpf && `, inscrito(a) no CPF sob o nº ${cpf(comprador.cpf)}`}, pagou
          integralmente o preço ajustado no compromisso de compra e venda do imóvel identificado
          como <strong>{c.lote}</strong> do empreendimento <strong>{emp?.nome}</strong>
          {emp?.municipio && `, em ${emp.municipio}${emp.uf ? `/${emp.uf}` : ''}`}, firmado em{' '}
          {contrato?.vendas?.data_venda ? formatarData(contrato.vendas.data_venda) : '—'}.
        </p>
        <p>
          O valor total recebido, incluídos entrada, parcelas, reajustes e encargos, foi de{' '}
          <strong>{moeda(recebido)}</strong>, com a última quitação em{' '}
          <strong>{c.quitadoEm ? formatarData(c.quitadoEm) : '—'}</strong>.
        </p>
        <p>
          Com o recebimento do preço, a vendedora dá ao comprador plena, geral e irrevogável
          quitação das obrigações de pagamento do referido contrato, nada mais tendo a reclamar a
          esse título, e se compromete a outorgar a escritura definitiva, na forma do contrato.
        </p>
        <p className="mt-6">
          {emp?.municipio ?? '________________'}, {formatarData(hojeSaoPaulo())}.
        </p>
        <div className="mt-12 flex flex-col items-center gap-1">
          <span className="w-72 border-t border-foreground" />
          <span>{credora}</span>
        </div>
      </article>
    </div>
  )
}
