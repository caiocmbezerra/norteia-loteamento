import { formatarPercentual } from '@norteia/dominio'
import type { Metadata } from 'next'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { FormularioCorretor, FormularioImobiliaria } from './formularios'

export const metadata: Metadata = { title: 'Corretores' }

export default async function Corretores() {
  const ctx = await exigirContexto()
  const gestor = temPapel(ctx, 'dono', 'comercial_gestor')
  const [{ data: corretores }, { data: imobiliarias }, { data: membros }] = await Promise.all([
    ctx.db
      .from('corretores')
      .select('id, nome, creci, comissao_percentual, comissao_modo, usuario_id, imobiliarias(nome)')
      .eq('tenant_id', ctx.tenant.id)
      .order('nome'),
    ctx.db.from('imobiliarias').select('id, nome').eq('tenant_id', ctx.tenant.id).order('nome'),
    gestor
      ? ctx.db
          .from('membros')
          .select('usuario_id, perfis(nome, email), atribuicoes_papel!inner(papel)')
          .eq('tenant_id', ctx.tenant.id)
          .eq('ativo', true)
          .eq('atribuicoes_papel.papel', 'corretor')
      : Promise.resolve({ data: [] }),
  ])
  const vinculados = new Set((corretores ?? []).map((c) => c.usuario_id).filter(Boolean))
  const usuarios = (membros ?? [])
    .filter((m) => !vinculados.has(m.usuario_id))
    .map((m) => ({ id: m.usuario_id, nome: m.perfis?.nome || m.perfis?.email || 'Usuário' }))

  return (
    <>
      <TituloPagina
        titulo="Corretores e imobiliárias"
        subtitulo="Comissão no ato da venda ou sobre o valor recebido (RN-C06)."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <Cartao>
          {(corretores ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum corretor cadastrado.</p>
          )}
          <ul className="divide-y">
            {(corretores ?? []).map((c) => (
              <li key={c.id} className="py-3 text-sm">
                <p className="font-medium">{c.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    c.imobiliarias?.nome ?? 'Autônomo',
                    c.creci ? `CRECI ${c.creci}` : null,
                    `comissão ${formatarPercentual(String(c.comissao_percentual), 1)} ${c.comissao_modo === 'ato' ? 'no ato' : 'sobre o recebido'}`,
                    c.usuario_id ? 'com acesso' : 'sem acesso',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </Cartao>
        {gestor && (
          <div className="flex flex-col gap-6">
            <Cartao className="flex flex-col gap-3">
              <h2 className="font-semibold">Novo corretor</h2>
              <FormularioCorretor imobiliarias={imobiliarias ?? []} usuarios={usuarios} />
            </Cartao>
            <Cartao className="flex flex-col gap-3">
              <h2 className="font-semibold">Nova imobiliária</h2>
              <FormularioImobiliaria />
            </Cartao>
          </div>
        )}
      </div>
    </>
  )
}
