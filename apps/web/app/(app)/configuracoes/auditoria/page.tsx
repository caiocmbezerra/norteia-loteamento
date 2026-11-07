import type { Metadata } from 'next'
import Link from 'next/link'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Auditoria' }

const TABELAS: Record<string, string> = {
  empreendimentos: 'Empreendimentos',
  lotes: 'Lotes',
  quadras: 'Quadras',
  empresas: 'Empresas',
  spes: 'SPEs',
  membros: 'Membros',
  atribuicoes_papel: 'Papéis',
  convites: 'Convites',
  parametro_valores: 'Parâmetros',
  glebas: 'Glebas',
  tenants: 'Cliente',
}
const OPERACAO = { INSERT: 'Criou', UPDATE: 'Alterou', DELETE: 'Excluiu' } as const
const quando = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

export default async function Auditoria({
  searchParams,
}: {
  searchParams: Promise<{ tabela?: string }>
}) {
  const { tabela } = await searchParams
  const ctx = await exigirContexto()
  if (!temPapel(ctx, 'dono', 'financeiro', 'contador')) {
    return <Alerta tipo="aviso">A auditoria é visível para dono, financeiro e contador.</Alerta>
  }
  let consulta = ctx.db
    .from('auditoria')
    .select(
      'id, tabela, operacao, campos_alterados, antes, depois, usuario_id, motivo, ocorrido_em',
    )
    .eq('tenant_id', ctx.tenant.id)
    .order('ocorrido_em', { ascending: false })
    .limit(100)
  if (tabela && TABELAS[tabela]) consulta = consulta.eq('tabela', tabela)
  const { data: linhas, error } = await consulta
  if (error) throw error

  const ids = [...new Set((linhas ?? []).map((l) => l.usuario_id).filter((v): v is string => !!v))]
  const { data: perfis } = ids.length
    ? await ctx.db.from('perfis').select('id, nome, email').in('id', ids)
    : { data: [] }
  const nome = new Map((perfis ?? []).map((p) => [p.id, p.nome || p.email]))

  return (
    <>
      <TituloPagina titulo="Auditoria" subtitulo="Últimas 100 alterações. Registros imutáveis." />
      <nav aria-label="Filtrar por tipo" className="flex flex-wrap gap-1.5">
        {[['', 'Tudo'], ...Object.entries(TABELAS)].map(([chave, rotulo]) => (
          <Link
            key={chave}
            href={chave ? `/configuracoes/auditoria?tabela=${chave}` : '/configuracoes/auditoria'}
            aria-current={(tabela ?? '') === chave ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-xs',
              (tabela ?? '') === chave
                ? 'border-primary bg-primary text-primary-foreground'
                : 'hover:bg-muted',
            )}
          >
            {rotulo}
          </Link>
        ))}
      </nav>
      <Cartao className="p-0 sm:p-0">
        <ul className="divide-y">
          {(linhas ?? []).map((l) => (
            <li key={l.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <span className="font-medium">
                    {l.usuario_id ? (nome.get(l.usuario_id) ?? 'Usuário') : 'Sistema'}
                  </span>{' '}
                  {OPERACAO[l.operacao as keyof typeof OPERACAO].toLowerCase()} ·{' '}
                  {TABELAS[l.tabela] ?? l.tabela}
                </span>
                <time className="text-xs text-muted-foreground" dateTime={l.ocorrido_em}>
                  {quando.format(new Date(l.ocorrido_em))}
                </time>
              </div>
              {l.campos_alterados && (
                <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {l.campos_alterados.map((c) => (
                    <li key={c}>
                      <span className="font-mono">{c}</span>:{' '}
                      {formatar((l.antes as Record<string, unknown> | null)?.[c])} →{' '}
                      {formatar((l.depois as Record<string, unknown> | null)?.[c])}
                    </li>
                  ))}
                </ul>
              )}
              {l.motivo && <p className="text-xs">Motivo: {l.motivo}</p>}
            </li>
          ))}
        </ul>
      </Cartao>
    </>
  )
}

function formatar(v: unknown) {
  if (v === null || v === undefined) return '—'
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 60 ? `${s.slice(0, 57)}…` : s
}
