import {
  ROTULO_SITUACAO_EMPREENDIMENTO,
  ROTULO_STATUS_LOTE,
  type StatusLote,
  formatarData,
  formatarMoeda,
  resumirLotes,
} from '@norteia/dominio'
import { centavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { COR_STATUS } from '@/components/status-lote'
import { Button } from '@/components/ui/button'
import { Cartao, Indicador, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Empreendimento' }

const STATUS: StatusLote[] = ['disponivel', 'reservado', 'vendido', 'bloqueado', 'permuta']

const area = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default async function PaginaEmpreendimento({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ status?: string; novo?: string }>
}) {
  const [{ id }, { status: filtro, novo }] = await Promise.all([params, searchParams])
  const ctx = await exigirContexto()
  const { data: e } = await ctx.db
    .from('empreendimentos')
    .select('id, nome, municipio, uf, situacao, data_base, data_registro, spes(razao_social)')
    .eq('id', id)
    .maybeSingle()
  if (!e) notFound()

  const { data: quadras, error } = await ctx.db
    .from('quadras')
    .select('id, codigo, lotes(id, numero, status, area_m2, preco_base_centavos)')
    .eq('empreendimento_id', id)
    .order('codigo')
  if (error) throw error

  const ordenarCodigo = (a: string, b: string) =>
    a.length - b.length || a.localeCompare(b, 'pt-BR', { numeric: true })
  const todas = (quadras ?? []).sort((a, b) => ordenarCodigo(a.codigo, b.codigo))
  const lotes = todas.flatMap((q) => q.lotes)
  const r = resumirLotes(lotes)
  const statusFiltro = STATUS.find((s) => s === filtro)
  const podeEditar = temPapel(ctx, 'dono', 'engenharia', 'comercial_gestor')

  return (
    <>
      <TituloPagina
        titulo={e.nome}
        subtitulo={
          <>
            {[e.municipio, e.uf].filter(Boolean).join(' · ')} ·{' '}
            {ROTULO_SITUACAO_EMPREENDIMENTO[e.situacao]} · SPE {e.spes?.razao_social}
          </>
        }
        acoes={
          <>
            <Button asChild variant="secondary">
              <Link href={`/empreendimentos/${id}/comercial`}>Comercial</Link>
            </Button>
            {temPapel(ctx, 'dono', 'financeiro', 'engenharia', 'contador', 'socio_leitura') && (
              <>
                <Button asChild>
                  <Link href={`/empreendimentos/${id}/viabilidade`}>Viabilidade</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href={`/empreendimentos/${id}/custos`}>Custos e obra</Link>
                </Button>
              </>
            )}
            {temPapel(
              ctx,
              'dono',
              'financeiro',
              'contador',
              'comercial_gestor',
              'engenharia',
              'socio_leitura',
            ) && (
              <Button asChild variant="secondary">
                <Link href={`/empreendimentos/${id}/carteira`}>Carteira</Link>
              </Button>
            )}
            {podeEditar && (
              <Button asChild variant="outline">
                <Link href={`/empreendimentos/${id}/editar`}>Editar dados</Link>
              </Button>
            )}
          </>
        }
      />

      {novo && (
        <Alerta tipo="sucesso">
          Empreendimento criado com {r.total} lotes. Ajuste área, preço e situação de cada lote
          tocando nele.
        </Alerta>
      )}
      {!e.data_registro && (
        <Alerta tipo="aviso">
          Vendas bloqueadas até o registro do loteamento em cartório (Lei 6.766/1979). Quando sair,
          informe a data em “Editar dados”.
        </Alerta>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador
          rotulo="Lotes"
          valor={String(r.total)}
          nota={`${r.porStatus.disponivel} disponíveis`}
        />
        <Indicador rotulo="Área dos lotes" valor={`${area.format(Number(r.areaM2))} m²`} />
        <Indicador
          rotulo="VGV de tabela (estoque)"
          valor={formatarMoeda(centavos(r.vgvTabelaCentavos))}
          nota={
            r.lotesSemPreco
              ? `${r.lotesSemPreco} lote(s) sem preço`
              : 'Valor comercial, não é caixa'
          }
        />
        <Indicador
          rotulo="Mês 0 / registro"
          valor={formatarData(e.data_base).slice(3)}
          nota={e.data_registro ? `Registrado em ${formatarData(e.data_registro)}` : 'Sem registro'}
        />
      </div>

      <Cartao className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold">Lotes por quadra</h2>
          <nav aria-label="Filtrar por situação" className="flex flex-wrap gap-1.5">
            <FiltroLink href={`/empreendimentos/${id}`} ativo={!statusFiltro}>
              Todos ({r.total})
            </FiltroLink>
            {STATUS.filter((s) => r.porStatus[s] > 0).map((s) => (
              <FiltroLink
                key={s}
                href={`/empreendimentos/${id}?status=${s}`}
                ativo={statusFiltro === s}
              >
                {ROTULO_STATUS_LOTE[s]} ({r.porStatus[s]})
              </FiltroLink>
            ))}
          </nav>
        </div>

        {todas.map((q) => {
          const visiveis = q.lotes
            .filter((l) => !statusFiltro || l.status === statusFiltro)
            .sort((a, b) => ordenarCodigo(a.numero, b.numero))
          if (visiveis.length === 0) return null
          return (
            <section key={q.id} aria-labelledby={`quadra-${q.id}`} className="flex flex-col gap-2">
              <h3 id={`quadra-${q.id}`} className="text-sm font-medium text-muted-foreground">
                Quadra {q.codigo}
              </h3>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5">
                {visiveis.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/empreendimentos/${id}/lotes/${l.id}`}
                      aria-label={`Quadra ${q.codigo}, lote ${l.numero}: ${ROTULO_STATUS_LOTE[l.status]}, ${area.format(l.area_m2)} m²`}
                      className={cn(
                        'flex min-h-14 flex-col items-center justify-center rounded-md border px-1 py-1.5 text-center transition-transform hover:scale-[1.03] focus-visible:ring-[3px] focus-visible:ring-ring/60',
                        COR_STATUS[l.status],
                      )}
                    >
                      <span className="text-sm font-semibold leading-none">{l.numero}</span>
                      <span className="mt-1 text-[0.65rem] leading-none opacity-80">
                        {area.format(l.area_m2)} m²
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </Cartao>
    </>
  )
}

function FiltroLink({
  href,
  ativo,
  children,
}: {
  href: string
  ativo: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={ativo ? 'page' : undefined}
      className={cn(
        'rounded-full border px-3 py-1 text-xs',
        ativo ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
      )}
    >
      {children}
    </Link>
  )
}
