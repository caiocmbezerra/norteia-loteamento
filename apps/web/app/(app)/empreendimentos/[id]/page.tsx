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
import { PlantaLotes } from '@/components/planta-lotes'
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
  searchParams: Promise<{ status?: string; novo?: string; vista?: string }>
}) {
  const [{ id }, { status: filtro, novo, vista }] = await Promise.all([params, searchParams])
  const ctx = await exigirContexto()
  const { data: e } = await ctx.db
    .from('empreendimentos')
    .select(
      'id, nome, municipio, uf, situacao, data_base, data_registro, planta_arquivo, planta_largura, planta_altura, spes(razao_social)',
    )
    .eq('id', id)
    .maybeSingle()
  if (!e) notFound()

  const { data: quadras, error } = await ctx.db
    .from('quadras')
    .select('id, codigo, lotes(id, numero, status, area_m2, preco_base_centavos, planta_poligono)')
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
  const comContorno = lotes.filter((l) => l.planta_poligono).length
  const planta =
    e.planta_arquivo && e.planta_largura && e.planta_altura && comContorno > 0
      ? {
          url: (await ctx.db.storage.from('plantas').createSignedUrl(e.planta_arquivo, 3600)).data
            ?.signedUrl,
          largura: e.planta_largura,
          altura: e.planta_altura,
        }
      : null
  const verPlanta = !!planta?.url && vista !== 'grade'
  const sufixo = (s?: StatusLote) =>
    [s && `status=${s}`, vista === 'grade' && planta?.url && 'vista=grade']
      .filter(Boolean)
      .join('&')
  const hrefFiltro = (s?: StatusLote) => {
    const q = sufixo(s)
    return `/empreendimentos/${id}${q ? `?${q}` : ''}`
  }

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
                <Button asChild variant="secondary">
                  <Link href={`/empreendimentos/${id}/permutas`}>Permutas</Link>
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
              <>
                <Button asChild variant="outline">
                  <Link href={`/empreendimentos/${id}/planta`}>Planta</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/empreendimentos/${id}/editar`}>Editar dados</Link>
                </Button>
              </>
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
          <h2 className="font-semibold">{verPlanta ? 'Planta de lotes' : 'Lotes por quadra'}</h2>
          {planta?.url && (
            <nav aria-label="Ver os lotes" className="flex gap-1.5">
              <FiltroLink
                href={`/empreendimentos/${id}${statusFiltro ? `?status=${statusFiltro}` : ''}`}
                ativo={verPlanta}
              >
                Na planta
              </FiltroLink>
              <FiltroLink
                href={`/empreendimentos/${id}?vista=grade${statusFiltro ? `&status=${statusFiltro}` : ''}`}
                ativo={!verPlanta}
              >
                Por quadra
              </FiltroLink>
            </nav>
          )}
          <nav aria-label="Filtrar por situação" className="flex flex-wrap gap-1.5">
            <FiltroLink href={hrefFiltro()} ativo={!statusFiltro}>
              Todos ({r.total})
            </FiltroLink>
            {STATUS.filter((s) => r.porStatus[s] > 0).map((s) => (
              <FiltroLink key={s} href={hrefFiltro(s)} ativo={statusFiltro === s}>
                {ROTULO_STATUS_LOTE[s]} ({r.porStatus[s]})
              </FiltroLink>
            ))}
          </nav>
        </div>

        {verPlanta && planta?.url && (
          <>
            <PlantaLotes
              url={planta.url}
              largura={planta.largura}
              altura={planta.altura}
              lotes={todas.flatMap((q) =>
                q.lotes
                  .filter((l) => l.planta_poligono && (!statusFiltro || l.status === statusFiltro))
                  .map((l) => ({
                    id: l.id,
                    rotulo: `Quadra ${q.codigo}, lote ${l.numero}`,
                    status: l.status,
                    pontos: l.planta_poligono as [number, number][],
                    href: `/empreendimentos/${id}/lotes/${l.id}`,
                  })),
              )}
            />
            {comContorno < lotes.length && (
              <p className="text-sm text-muted-foreground">
                {lotes.length - comContorno} lote(s) ainda sem contorno na planta: veja{' '}
                <Link
                  href={`/empreendimentos/${id}?vista=grade`}
                  className="text-primary underline underline-offset-4"
                >
                  por quadra
                </Link>
                {podeEditar && (
                  <>
                    {' '}
                    ou{' '}
                    <Link
                      href={`/empreendimentos/${id}/planta`}
                      className="text-primary underline underline-offset-4"
                    >
                      desenhe na planta
                    </Link>
                  </>
                )}
                .
              </p>
            )}
          </>
        )}

        {!verPlanta &&
          todas.map((q) => {
            const visiveis = q.lotes
              .filter((l) => !statusFiltro || l.status === statusFiltro)
              .sort((a, b) => ordenarCodigo(a.numero, b.numero))
            if (visiveis.length === 0) return null
            return (
              <section
                key={q.id}
                aria-labelledby={`quadra-${q.id}`}
                className="flex flex-col gap-2"
              >
                <h3 id={`quadra-${q.id}`} className="text-sm font-medium text-muted-foreground">
                  Quadra {q.codigo}
                </h3>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5">
                  {visiveis.map((l) => (
                    <li key={l.id}>
                      <Link
                        href={`/empreendimentos/${id}/lotes/${l.id}`}
                        className={cn(
                          'flex min-h-14 flex-col items-center justify-center rounded-md border px-1 py-1.5 text-center transition-transform hover:scale-[1.03] focus-visible:ring-[3px] focus-visible:ring-ring/60',
                          COR_STATUS[l.status],
                        )}
                      >
                        <span className="sr-only">{`Quadra ${q.codigo}, lote ${l.numero}: ${ROTULO_STATUS_LOTE[l.status]}, ${area.format(l.area_m2)} m²`}</span>
                        <span aria-hidden="true" className="text-sm font-semibold leading-none">
                          {l.numero}
                        </span>
                        <span
                          aria-hidden="true"
                          className="mt-1 text-[0.65rem] leading-none opacity-80"
                        >
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
