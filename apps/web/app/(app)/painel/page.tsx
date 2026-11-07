import { ROTULO_SITUACAO_EMPREENDIMENTO, formatarMoeda, resumirLotes } from '@norteia/dominio'
import { centavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { SeloStatus } from '@/components/status-lote'
import { Button } from '@/components/ui/button'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { criarEmpreendimentoDemonstracao } from '../acoes'

export const metadata: Metadata = { title: 'Painel' }

export default async function Painel() {
  const ctx = await exigirContexto()
  const { data: empreendimentos, error } = await ctx.db
    .from('empreendimentos')
    .select(
      'id, nome, municipio, uf, situacao, data_registro, lotes(status, area_m2, preco_base_centavos)',
    )
    .eq('tenant_id', ctx.tenant.id)
    .order('nome')
  if (error) throw error

  return (
    <>
      <TituloPagina
        titulo="Painel"
        subtitulo={ctx.tenant.nome}
        acoes={
          <>
            {temPapel(ctx, 'dono') &&
              !empreendimentos.some((e) => e.nome.startsWith('Demonstração')) && (
                <form action={criarEmpreendimentoDemonstracao}>
                  <Button type="submit" variant="outline">
                    Criar demonstração
                  </Button>
                </form>
              )}
            {temPapel(ctx, 'dono', 'engenharia', 'comercial_gestor') && (
              <Button asChild>
                <Link href="/empreendimentos/novo">Novo empreendimento</Link>
              </Button>
            )}
          </>
        }
      />
      {empreendimentos.length === 0 && (
        <Cartao>
          <p className="text-sm text-muted-foreground">Nenhum empreendimento cadastrado ainda.</p>
        </Cartao>
      )}
      <ul className="grid gap-4 md:grid-cols-2">
        {empreendimentos.map((e) => {
          const r = resumirLotes(e.lotes)
          return (
            <li key={e.id}>
              <Link
                href={`/empreendimentos/${e.id}`}
                className="block rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Cartao className="flex flex-col gap-3 transition-colors hover:border-primary/50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">{e.nome}</h2>
                      <p className="text-sm text-muted-foreground">
                        {[e.municipio, e.uf].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                      {ROTULO_SITUACAO_EMPREENDIMENTO[e.situacao]}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(['disponivel', 'reservado', 'vendido', 'bloqueado', 'permuta'] as const)
                      .filter((s) => r.porStatus[s] > 0)
                      .map((s) => (
                        <span key={s} className="flex items-center gap-1 text-xs">
                          <SeloStatus status={s} /> {r.porStatus[s]}
                        </span>
                      ))}
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Lotes</dt>
                      <dd className="font-medium">{r.total}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">VGV de tabela (estoque)</dt>
                      <dd className="font-medium">
                        {formatarMoeda(centavos(r.vgvTabelaCentavos))}
                      </dd>
                    </div>
                  </dl>
                  {!e.data_registro && (
                    <p className="text-xs text-muted-foreground">
                      Vendas bloqueadas até o registro do loteamento.
                    </p>
                  )}
                </Cartao>
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
