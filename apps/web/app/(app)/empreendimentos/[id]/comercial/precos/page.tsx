import { formatarData, formatarMoeda, formatarPercentual } from '@norteia/dominio'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'
import { FormularioTabela } from './formulario-tabela'

export const metadata: Metadata = { title: 'Tabela de preços' }

const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))
const ordenarCodigo = (a: string, b: string) =>
  a.length - b.length || a.localeCompare(b, 'pt-BR', { numeric: true })

export default async function PaginaTabelaPrecos({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ publicada?: string }>
}) {
  const [{ id }, { publicada }] = await Promise.all([params, searchParams])
  const ctx = await exigirContexto()
  const { data: e } = await ctx.db
    .from('empreendimentos')
    .select('id, nome')
    .eq('id', id)
    .maybeSingle()
  if (!e) notFound()
  const [{ data: tabelas, error }, { data: quadras, error: erroLotes }] = await Promise.all([
    ctx.db
      .from('tabelas_preco')
      .select('id, nome, vigente_desde, reajuste, lotes, criado_em')
      .eq('empreendimento_id', id)
      .order('vigente_desde', { ascending: false }),
    ctx.db
      .from('quadras')
      .select('codigo, lotes(id, numero, status, preco_base_centavos)')
      .eq('empreendimento_id', id),
  ])
  if (error) throw error
  if (erroLotes) throw erroLotes
  const hoje = hojeSaoPaulo()
  const vigente = (tabelas ?? []).find((t) => t.vigente_desde <= hoje)
  const lotes = (quadras ?? [])
    .sort((a, b) => ordenarCodigo(a.codigo, b.codigo))
    .flatMap((q) =>
      q.lotes
        .sort((a, b) => ordenarCodigo(a.numero, b.numero))
        .map((l) => ({
          id: l.id,
          rotulo: `Quadra ${q.codigo} · Lote ${l.numero}`,
          precoCentavos: l.preco_base_centavos,
          vendido: ['vendido', 'permuta'].includes(l.status),
        })),
    )
  const podePublicar = temPapel(ctx, 'dono', 'comercial_gestor')

  return (
    <>
      <Link
        href={`/empreendimentos/${id}/comercial`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Comercial · {e.nome}
      </Link>
      <TituloPagina
        titulo="Tabela de preços"
        subtitulo="A venda usa o preço da tabela vigente na data; desconto acima do limite pede aprovação do dono."
      />
      {publicada && <Alerta tipo="sucesso">Tabela publicada.</Alerta>}

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Tabelas publicadas</h2>
        {(tabelas ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma tabela ainda: vale o preço de cadastro de cada lote. Ao publicar a primeira, os
            preços passam a mudar só por nova tabela, com histórico.
          </p>
        ) : (
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-2 font-medium">
                    Tabela
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Vigente desde
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Reajuste
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Lotes
                  </th>
                </tr>
              </thead>
              <tbody>
                {(tabelas ?? []).map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="py-2">
                      {t.nome}{' '}
                      <span className="text-xs text-muted-foreground">
                        {t.id === vigente?.id
                          ? '(vigente)'
                          : t.vigente_desde > hoje
                            ? '(futura)'
                            : '(anterior)'}
                      </span>
                    </td>
                    <td className="py-2">{formatarData(t.vigente_desde)}</td>
                    <td className="py-2 text-right">{formatarPercentual(String(t.reajuste), 2)}</td>
                    <td className="py-2 text-right">{t.lotes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      {podePublicar ? (
        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Publicar nova tabela</h2>
          <FormularioTabela
            empreendimentoId={id}
            hoje={hoje}
            lotes={lotes.map((l) => ({
              ...l,
              preco: l.precoCentavos === null ? 'sem preço' : moeda(l.precoCentavos),
            }))}
          />
        </Cartao>
      ) : (
        <Alerta tipo="aviso">Só o dono e a gestão comercial publicam tabelas.</Alerta>
      )}
    </>
  )
}
