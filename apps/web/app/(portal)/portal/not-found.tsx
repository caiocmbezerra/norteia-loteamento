import Link from 'next/link'

export default function PortalNaoEncontrado() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">Não encontramos este contrato</h1>
      <p className="text-sm text-muted-foreground">
        Ele não está ligado à conta em que você entrou. O portal mostra só os contratos do e-mail
        que recebeu o convite da loteadora: confira se entrou com esse e-mail ou peça um novo
        convite à loteadora.
      </p>
      <Link href="/portal" className="text-sm text-primary underline underline-offset-4">
        Ver meus contratos
      </Link>
    </div>
  )
}
