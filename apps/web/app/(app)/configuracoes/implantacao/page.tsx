import { carregarImplantacao } from '@norteia/aplicacao'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'

export const metadata: Metadata = { title: 'Implantação' }

export default async function PaginaImplantacao() {
  const ctx = await exigirContexto()
  if (!temPapel(ctx, 'dono', 'financeiro', 'contador')) redirect('/configuracoes')
  const passos = await carregarImplantacao(ctx.db, ctx.tenant.id, hojeSaoPaulo())
  const essenciais = passos.filter((p) => !p.opcional)
  const feitos = essenciais.filter((p) => p.feito).length
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/configuracoes" className="text-sm text-muted-foreground hover:underline">
        ← Configurações
      </Link>
      <TituloPagina
        titulo="Implantação"
        subtitulo={`${feitos} de ${essenciais.length} passos essenciais concluídos. Os opcionais dependem de como a sua loteadora trabalha.`}
      />
      <ol className="flex flex-col gap-3" aria-label="Passos da implantação">
        {passos.map((p) => (
          <li key={p.id}>
            <Cartao className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
              <span
                role="img"
                aria-label={p.feito ? 'Concluído' : 'Pendente'}
                className={
                  p.feito
                    ? 'flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground'
                    : 'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-sm text-muted-foreground'
                }
              >
                {p.feito ? '✓' : ''}
              </span>
              <div className="flex flex-1 flex-col">
                <h2 className="font-medium">
                  {p.titulo}
                  {p.opcional && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">opcional</span>
                  )}
                </h2>
                <p className="text-sm text-muted-foreground">{p.detalhe}</p>
              </div>
              {!p.feito && (
                <Link href={p.link} className="text-sm text-primary underline underline-offset-4">
                  Resolver
                </Link>
              )}
            </Cartao>
          </li>
        ))}
      </ol>
    </div>
  )
}
