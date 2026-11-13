import Link from 'next/link'

export default function NaoEncontrada() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">
        NorteIA Loteamento
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="text-sm text-muted-foreground">
        O endereço não existe ou você não tem acesso a ele com a conta em que está conectado.
      </p>
      <Link href="/" className="text-sm text-primary underline underline-offset-4">
        Voltar ao início
      </Link>
    </main>
  )
}
