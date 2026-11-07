import Link from 'next/link'
import { trocarCliente } from '@/app/(app)/acoes'
import { Button } from '@/components/ui/button'
import type { Contexto } from '@/lib/contexto'

const LINKS = [
  { href: '/painel', rotulo: 'Painel' },
  { href: '/configuracoes', rotulo: 'Configurações' },
]

export function Cabecalho({ ctx }: { ctx: Contexto }) {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/painel" className="text-sm font-semibold uppercase tracking-wide text-primary">
          NorteIA
        </Link>
        {ctx.clientes.length > 1 ? (
          <form action={trocarCliente} className="flex items-center gap-2">
            <label htmlFor="tenant" className="sr-only">
              Cliente
            </label>
            <select
              id="tenant"
              name="tenant"
              defaultValue={ctx.tenant.id}
              className="h-9 max-w-48 rounded-md border bg-background px-2 text-sm"
            >
              {ctx.clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" type="submit">
              Trocar
            </Button>
          </form>
        ) : (
          <span className="truncate text-sm font-medium">{ctx.tenant.nome}</span>
        )}
        <nav aria-label="Principal" className="flex items-center gap-1 sm:ml-auto">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              {l.rotulo}
            </Link>
          ))}
          <form action="/sair" method="post">
            <Button size="sm" variant="ghost" type="submit">
              Sair
            </Button>
          </form>
        </nav>
      </div>
    </header>
  )
}
