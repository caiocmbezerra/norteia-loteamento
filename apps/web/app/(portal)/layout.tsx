import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { exigirUsuario } from '@/lib/contexto'

/** Portal do comprador, do sócio e do permutante: somente leitura, sem cliente ativo. */
export default async function LayoutPortal({ children }: { children: React.ReactNode }) {
  const { usuario } = await exigirUsuario()
  return (
    <>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link
            href="/portal"
            className="text-sm font-semibold uppercase tracking-wide text-primary"
          >
            Meu portal
          </Link>
          <span className="truncate text-sm text-muted-foreground">{usuario.email}</span>
          <form action="/sair" method="post" className="ml-auto">
            <Button size="sm" variant="ghost" type="submit">
              Sair
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:py-8">
        {children}
      </main>
    </>
  )
}
