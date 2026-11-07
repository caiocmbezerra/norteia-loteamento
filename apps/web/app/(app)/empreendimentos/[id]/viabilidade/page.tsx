import { formatarMoeda, formatarPercentual } from '@norteia/dominio'
import { centavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { novoEstudo } from './acoes'

export const metadata: Metadata = { title: 'Viabilidade' }

const quando = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})
const SITUACAO = {
  rascunho: 'Rascunho',
  aprovada: 'Plano vigente',
  arquivada: 'Arquivado',
} as const

interface Resumo {
  tirAnual: string | null
  vpl: string
  lucroNominal: string
}

export default async function PaginaViabilidade({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ aprovado?: string }>
}) {
  const [{ id }, { aprovado }] = await Promise.all([params, searchParams])
  const ctx = await exigirContexto()
  const { data: e } = await ctx.db
    .from('empreendimentos')
    .select('id, nome')
    .eq('id', id)
    .maybeSingle()
  if (!e) notFound()
  if (!temPapel(ctx, 'dono', 'financeiro', 'engenharia', 'contador', 'socio_leitura')) {
    return (
      <Alerta tipo="aviso">
        Os estudos de viabilidade não estão disponíveis para o seu papel.
      </Alerta>
    )
  }

  const [{ data: estudos }, { data: planos }] = await Promise.all([
    ctx.db
      .from('viabilidades')
      .select('id, nome, situacao, atualizado_em')
      .eq('empreendimento_id', id)
      .order('criado_em', { ascending: false }),
    ctx.db
      .from('plano_versoes')
      .select('id, versao, motivo, aprovado_em, resumo, viabilidade_id')
      .eq('empreendimento_id', id)
      .order('versao'),
  ])
  const podeEditar = temPapel(ctx, 'dono', 'financeiro', 'engenharia')

  return (
    <>
      <Link
        href={`/empreendimentos/${id}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {e.nome}
      </Link>
      <TituloPagina
        titulo="Viabilidade"
        subtitulo="Estudos calculados pelo motor financeiro. O plano aprovado fica congelado para comparar com o realizado."
        acoes={
          podeEditar && (
            <form action={novoEstudo.bind(null, id)}>
              <Button type="submit">Novo estudo</Button>
            </form>
          )
        }
      />

      {aprovado && (
        <Alerta tipo="sucesso">
          {aprovado === '1'
            ? 'Plano original aprovado e congelado.'
            : `Revisão ${Number(aprovado) - 1} do plano aprovada.`}
        </Alerta>
      )}

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Plano do empreendimento</h2>
        {(planos ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum plano aprovado. Aprove um estudo para congelar o plano original.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 font-normal">Versão</th>
                  <th className="py-2 font-normal">Aprovado em</th>
                  <th className="py-2 text-right font-normal">TIR anual</th>
                  <th className="py-2 text-right font-normal">VPL</th>
                  <th className="py-2 text-right font-normal">Lucro nominal</th>
                  <th className="py-2 font-normal">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {(planos ?? []).map((p) => {
                  const r = p.resumo as unknown as Resumo
                  return (
                    <tr key={p.id} className="border-t">
                      <td className="py-2">
                        <Link
                          className="text-primary underline-offset-4 hover:underline"
                          href={`/empreendimentos/${id}/viabilidade/${p.viabilidade_id}`}
                        >
                          {p.versao === 1 ? 'Original' : `Revisão ${p.versao - 1}`}
                        </Link>
                      </td>
                      <td className="py-2">{quando.format(new Date(p.aprovado_em))}</td>
                      <td className="py-2 text-right">
                        {r.tirAnual ? formatarPercentual(r.tirAnual, 1) : '—'}
                      </td>
                      <td className="py-2 text-right">{formatarMoeda(centavos(Number(r.vpl)))}</td>
                      <td className="py-2 text-right">
                        {formatarMoeda(centavos(Number(r.lucroNominal)))}
                      </td>
                      <td className="py-2 text-muted-foreground">{p.motivo ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Estudos</h2>
        {(estudos ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum estudo ainda.</p>
        )}
        <ul className="divide-y">
          {(estudos ?? []).map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 py-3">
              <Link
                href={`/empreendimentos/${id}/viabilidade/${v.id}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {v.nome}
              </Link>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
                {SITUACAO[v.situacao]}
              </span>
            </li>
          ))}
        </ul>
      </Cartao>
    </>
  )
}
