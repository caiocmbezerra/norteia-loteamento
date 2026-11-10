import {
  CATEGORIAS_CHAMADO,
  type CategoriaChamado,
  SITUACOES_CHAMADO,
  type SituacaoChamado,
} from '@norteia/aplicacao'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Cartao, Indicador, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto } from '@/lib/contexto'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Atendimento' }

const quando = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

export default async function PaginaAtendimento({
  searchParams,
}: {
  searchParams: Promise<{ situacao?: string }>
}) {
  const { situacao } = await searchParams
  const ctx = await exigirContexto()
  const { data: chamados } = await ctx.db
    .from('chamados')
    .select(
      'id, assunto, categoria, situacao, ultima_mensagem_em, empreendimentos(nome), contratos(compradores(nome), lotes(numero, quadras(codigo)))',
    )
    .eq('tenant_id', ctx.tenant.id)
    .order('ultima_mensagem_em', { ascending: false })
    .limit(200)
  const todos = chamados ?? []
  const filtro = situacao === 'resolvido' ? 'resolvido' : 'pendentes'
  const lista = todos.filter((c) =>
    filtro === 'resolvido' ? c.situacao === 'resolvido' : c.situacao !== 'resolvido',
  )
  const contar = (s: SituacaoChamado) => todos.filter((c) => c.situacao === s).length

  return (
    <>
      <TituloPagina
        titulo="Atendimento"
        subtitulo="Chamados abertos pelos compradores no portal."
      />
      <section aria-label="Resumo" className="grid grid-cols-3 gap-3">
        <Indicador
          rotulo="Abertos"
          valor={String(contar('aberto'))}
          nota="aguardando a loteadora"
        />
        <Indicador rotulo="Em atendimento" valor={String(contar('em_atendimento'))} />
        <Indicador rotulo="Resolvidos" valor={String(contar('resolvido'))} />
      </section>
      <Cartao className="flex flex-col gap-3">
        <nav aria-label="Filtrar chamados" className="flex gap-1.5">
          {(
            [
              ['pendentes', 'Pendentes', '/atendimento'],
              ['resolvido', 'Resolvidos', '/atendimento?situacao=resolvido'],
            ] as const
          ).map(([k, r, href]) => (
            <Link
              key={k}
              href={href}
              aria-current={filtro === k ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1 text-xs',
                filtro === k
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:bg-muted',
              )}
            >
              {r}
            </Link>
          ))}
        </nav>
        {lista.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum chamado aqui.</p>
        )}
        <ul className="divide-y">
          {lista.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 py-3 text-sm">
              <span className="flex flex-wrap justify-between gap-2">
                <Link
                  href={`/atendimento/${c.id}`}
                  className="font-medium text-primary underline underline-offset-4"
                >
                  {c.assunto}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {SITUACOES_CHAMADO[c.situacao as SituacaoChamado]} ·{' '}
                  {quando.format(new Date(c.ultima_mensagem_em))}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {c.contratos?.compradores?.nome} · {c.empreendimentos?.nome} · Quadra{' '}
                {c.contratos?.lotes?.quadras?.codigo} · Lote {c.contratos?.lotes?.numero} ·{' '}
                {CATEGORIAS_CHAMADO[c.categoria as CategoriaChamado]}
              </span>
            </li>
          ))}
        </ul>
      </Cartao>
    </>
  )
}
