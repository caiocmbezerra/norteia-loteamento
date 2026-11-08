import { carregarParametros, ehPercentual, textoDoValor } from '@norteia/aplicacao'
import { formatarData } from '@norteia/dominio'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'
import { FormularioParametro } from './formulario'

export const metadata: Metadata = { title: 'Parâmetros' }

const GRUPOS: Record<string, string> = {
  carteira: 'Carteira e cobrança',
  comercial: 'Comercial',
  tributario: 'Tributário',
  financeiro: 'Financeiro',
}

export default async function PaginaParametros() {
  const ctx = await exigirContexto()
  const hoje = hojeSaoPaulo()
  const podeEditar = temPapel(ctx, 'dono', 'financeiro')
  const [parametros, { data: empresas }] = await Promise.all([
    carregarParametros(ctx.db, ctx.tenant.id, hoje),
    ctx.db
      .from('empresas')
      .select('id, razao_social, spes(id, razao_social, empreendimentos(id, nome))')
      .eq('tenant_id', ctx.tenant.id)
      .order('criado_em'),
  ])
  const escopos = [
    { valor: 'tenant', rotulo: 'Toda a loteadora' },
    ...(empresas ?? []).flatMap((e) => [
      { valor: `empresa:${e.id}`, rotulo: `Empresa ${e.razao_social}` },
      ...e.spes.flatMap((s) => [
        { valor: `spe:${s.id}`, rotulo: `SPE ${s.razao_social}` },
        ...s.empreendimentos.map((m) => ({
          valor: `empreendimento:${m.id}`,
          rotulo: `Empreendimento ${m.nome}`,
        })),
      ]),
    ]),
  ]
  const pendentes = parametros.filter((p) => !p.vigente && p.pendencia)
  const grupos = Object.entries(GRUPOS)
    .map(([prefixo, titulo]) => ({
      titulo,
      itens: parametros.filter((p) => p.chave.startsWith(`${prefixo}.`)),
    }))
    .filter((g) => g.itens.length > 0)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/configuracoes" className="text-sm text-muted-foreground hover:underline">
        ← Configurações
      </Link>
      <TituloPagina
        titulo="Parâmetros"
        subtitulo="Regras jurídicas, fiscais e comerciais da sua loteadora, com data de início. Valem para toda a loteadora ou só para uma empresa, SPE ou empreendimento."
      />
      {pendentes.length > 0 && (
        <Alerta tipo="aviso">
          {pendentes.length} parâmetro(s) ainda usam a sugestão da plataforma. Confirme com o seu
          advogado e o seu contador e defina os valores da sua loteadora.
        </Alerta>
      )}
      {grupos.map((g) => (
        <section key={g.titulo} aria-label={g.titulo} className="flex flex-col gap-3">
          <h2 className="font-semibold">{g.titulo}</h2>
          {g.itens.map((p) => (
            <Cartao key={p.chave} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">{p.descricao}</h3>
                {p.pendencia && (
                  <span className="text-xs text-muted-foreground">roteiro {p.pendencia}</span>
                )}
              </div>
              <p className="text-sm">
                {p.vigente ? (
                  <>
                    <strong>{textoDoValor(p, p.vigente.valor)}</strong>
                    <span className="text-muted-foreground">
                      {' '}
                      · definido pela loteadora desde {formatarData(p.vigente.inicio)}
                    </span>
                  </>
                ) : p.sugestao ? (
                  <>
                    <strong>{textoDoValor(p, p.sugestao.valor)}</strong>{' '}
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                      sugestão não confirmada
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Não definido</span>
                )}
              </p>
              {p.outros.length > 0 && (
                <ul className="text-xs text-muted-foreground">
                  {p.outros.map((o) => (
                    <li key={`${o.escopo}-${o.escopoId}-${o.inicio}`}>
                      {o.escopoNome}: {textoDoValor(p, o.valor)}
                      {o.inicio > hoje ? ` a partir de ${formatarData(o.inicio)}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {podeEditar && (
                <details>
                  <summary className="cursor-pointer text-sm text-primary">Definir valor</summary>
                  <div className="mt-3">
                    <FormularioParametro
                      chave={p.chave}
                      tipo={p.tipo}
                      percentual={ehPercentual(p)}
                      unidade={p.unidade}
                      opcoes={p.valoresPermitidos}
                      escopos={escopos}
                      hoje={hoje}
                    />
                  </div>
                </details>
              )}
            </Cartao>
          ))}
        </section>
      ))}
    </div>
  )
}
