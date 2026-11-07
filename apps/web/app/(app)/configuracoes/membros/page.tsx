import { ROTULO_PAPEL, formatarData } from '@norteia/dominio'
import type { Metadata } from 'next'
import { Button } from '@/components/ui/button'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { alternarMembro, cancelarConvite } from './acoes'
import { FormularioConvite } from './formulario-convite'

export const metadata: Metadata = { title: 'Membros' }

export default async function Membros() {
  const ctx = await exigirContexto()
  const podeGerenciar = temPapel(ctx, 'dono')
  const [{ data: membros }, { data: convites }, { data: empreendimentos }] = await Promise.all([
    ctx.db
      .from('membros')
      .select(
        'id, ativo, usuario_id, perfis(nome, email), atribuicoes_papel(papel, escopo_tipo, escopo_id)',
      )
      .eq('tenant_id', ctx.tenant.id)
      .order('criado_em'),
    ctx.db
      .from('convites')
      .select('id, email, papel, escopo_tipo, expira_em')
      .eq('tenant_id', ctx.tenant.id)
      .is('aceito_em', null)
      .is('cancelado_em', null)
      .gt('expira_em', new Date().toISOString())
      .order('criado_em', { ascending: false }),
    ctx.db.from('empreendimentos').select('id, nome').eq('tenant_id', ctx.tenant.id).order('nome'),
  ])
  const nomeEmp = new Map((empreendimentos ?? []).map((e) => [e.id, e.nome]))

  return (
    <>
      <TituloPagina
        titulo="Membros e convites"
        subtitulo="Cada pessoa vê apenas o que o papel e o escopo permitem."
      />
      {!podeGerenciar && (
        <Alerta tipo="aviso">
          Somente o dono gerencia membros. Você está vendo apenas o seu acesso.
        </Alerta>
      )}

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Membros</h2>
        <ul className="divide-y">
          {(membros ?? []).map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {m.perfis?.nome || m.perfis?.email}{' '}
                  {m.usuario_id === ctx.usuario.id && (
                    <span className="text-xs text-muted-foreground">(você)</span>
                  )}
                </p>
                <p className="truncate text-sm text-muted-foreground">{m.perfis?.email}</p>
                <p className="mt-1 text-xs">
                  {m.atribuicoes_papel
                    .map(
                      (a) =>
                        `${ROTULO_PAPEL[a.papel]}${a.escopo_tipo === 'tenant' ? '' : ` · ${a.escopo_tipo === 'empreendimento' ? (nomeEmp.get(a.escopo_id!) ?? 'empreendimento') : a.escopo_tipo}`}`,
                    )
                    .join(', ')}
                  {!m.ativo && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                      desativado
                    </span>
                  )}
                </p>
              </div>
              {podeGerenciar && m.usuario_id !== ctx.usuario.id && (
                <form action={alternarMembro.bind(null, m.id, !m.ativo)}>
                  <Button size="sm" variant={m.ativo ? 'outline' : 'secondary'} type="submit">
                    {m.ativo ? 'Desativar' : 'Reativar'}
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Cartao>

      {podeGerenciar && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Cartao className="flex flex-col gap-3">
            <h2 className="font-semibold">Convidar pessoa</h2>
            <FormularioConvite empreendimentos={empreendimentos ?? []} />
          </Cartao>
          <Cartao className="flex flex-col gap-3">
            <h2 className="font-semibold">Convites pendentes</h2>
            {(convites ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum convite pendente.</p>
            )}
            <ul className="divide-y">
              {(convites ?? []).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROTULO_PAPEL[c.papel]} · expira em {formatarData(c.expira_em.slice(0, 10))}
                    </p>
                  </div>
                  <form action={cancelarConvite.bind(null, c.id)}>
                    <Button size="sm" variant="ghost" type="submit">
                      Cancelar
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </Cartao>
        </div>
      )}
    </>
  )
}
