import { formatarData } from '@norteia/dominio'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Cartao, Indicador, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'
import { AtualizarLead, FormularioLead } from '../formularios'
import { ROTULO_ORIGEM, ROTULO_SITUACAO_LEAD } from '../rotulos'

export const metadata: Metadata = { title: 'Leads' }

const ABERTAS = ['novo', 'em_contato', 'visita', 'proposta']

export default async function PaginaLeads({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await exigirContexto()
  const gestor = temPapel(ctx, 'dono', 'comercial_gestor')
  if (!gestor && !temPapel(ctx, 'corretor')) redirect(`/empreendimentos/${id}/comercial`)
  const { data: e } = await ctx.db
    .from('empreendimentos')
    .select('id, nome')
    .eq('id', id)
    .maybeSingle()
  if (!e) notFound()
  const [{ data: leads, error }, { data: corretores }] = await Promise.all([
    ctx.db
      .from('leads')
      .select(
        'id, nome, telefone, email, origem, situacao, proximo_contato, motivo_perda, observacao, criado_em, corretores(nome)',
      )
      .eq('empreendimento_id', id)
      .order('criado_em', { ascending: false }),
    gestor
      ? ctx.db
          .from('corretores')
          .select('id, nome')
          .eq('tenant_id', ctx.tenant.id)
          .eq('ativo', true)
          .order('nome')
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ])
  if (error) throw error
  const hoje = hojeSaoPaulo()
  const todos = leads ?? []
  const contar = (s: string) => todos.filter((l) => l.situacao === s).length
  const abertos = todos.filter((l) => ABERTAS.includes(l.situacao))
  const encerrados = todos.filter((l) => !ABERTAS.includes(l.situacao))
  const conversao =
    contar('ganho') + contar('perdido') > 0
      ? Math.round((100 * contar('ganho')) / (contar('ganho') + contar('perdido')))
      : null

  return (
    <>
      <Link
        href={`/empreendimentos/${id}/comercial`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Comercial · {e.nome}
      </Link>
      <TituloPagina
        titulo="Leads"
        subtitulo={
          gestor ? 'Interessados do empreendimento e etapa de cada um.' : 'Seus interessados.'
        }
      />
      <section aria-label="Funil" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Em aberto" valor={String(abertos.length)} />
        <Indicador rotulo="Visitas" valor={String(contar('visita'))} />
        <Indicador rotulo="Ganhos" valor={String(contar('ganho'))} />
        <Indicador
          rotulo="Conversão"
          valor={conversao === null ? '—' : `${conversao}%`}
          nota="ganhos sobre encerrados"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Em aberto</h2>
          {abertos.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum lead em aberto.</p>
          )}
          <ul className="divide-y">
            {abertos.map((l) => (
              <li key={l.id} className="flex flex-col gap-2 py-3 text-sm">
                <span>
                  <span className="font-medium">{l.nome}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {ROTULO_ORIGEM[l.origem]} · {l.corretores?.nome ?? 'sem corretor'}
                    {l.telefone ? ` · ${l.telefone}` : ''}
                    {l.email ? ` · ${l.email}` : ''}
                  </span>
                </span>
                {l.observacao && <span className="text-muted-foreground">{l.observacao}</span>}
                {l.proximo_contato && (
                  <span
                    className={
                      l.proximo_contato < hoje
                        ? 'text-xs font-medium text-destructive'
                        : 'text-xs text-muted-foreground'
                    }
                  >
                    Próximo contato: {formatarData(l.proximo_contato)}
                    {l.proximo_contato < hoje ? ' (atrasado)' : ''}
                  </span>
                )}
                <AtualizarLead empreendimentoId={id} lead={l} />
              </li>
            ))}
          </ul>
        </Cartao>

        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Novo lead</h2>
          <FormularioLead empreendimentoId={id} corretores={corretores ?? []} />
        </Cartao>
      </div>

      {encerrados.length > 0 && (
        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Encerrados</h2>
          <ul className="divide-y">
            {encerrados.map((l) => (
              <li key={l.id} className="py-2 text-sm">
                <span className="font-medium">{l.nome}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {ROTULO_SITUACAO_LEAD[l.situacao]}
                  {l.motivo_perda ? ` — ${l.motivo_perda}` : ''} ·{' '}
                  {l.corretores?.nome ?? 'sem corretor'}
                </span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </>
  )
}
