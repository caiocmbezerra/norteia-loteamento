import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { clienteServidor } from '@/lib/supabase/servidor'

export default async function Inicio() {
  const db = await clienteServidor()
  const { data } = await db.auth.getClaims()
  if (data?.claims) redirect('/painel')

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-4 py-10">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">NorteIA</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">NorteIA Loteamento</h1>
        <p className="text-base text-muted-foreground">
          Gestão de loteamentos com um motor financeiro único: cada custo, parcela, aporte e repasse
          atualiza o retorno e a necessidade de caixa de cada empreendimento e de cada sócio.
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/cadastrar">Criar conta</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/entrar">Entrar</Link>
        </Button>
      </div>
    </main>
  )
}
