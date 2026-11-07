import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { clienteServidor } from '@/lib/supabase/servidor'
import { BotaoAceitar } from './botao-aceitar'

export const metadata: Metadata = { title: 'Convite' }

export default async function PaginaConvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const db = await clienteServidor()
  const { data } = await db.auth.getUser()
  const proximo = encodeURIComponent(`/convite/${token}`)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Você recebeu um convite</h1>
        <p className="text-sm text-muted-foreground">
          {data.user
            ? `Você vai entrar como ${data.user.email}. O convite precisa ter sido enviado para este e-mail.`
            : 'Entre ou crie sua conta com o e-mail que recebeu o convite.'}
        </p>
      </div>
      {data.user ? (
        <BotaoAceitar token={token} />
      ) : (
        <div className="flex flex-col gap-3">
          <Button asChild size="lg">
            <Link href={`/cadastrar?proximo=${proximo}`}>Criar conta</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={`/entrar?proximo=${proximo}`}>Já tenho conta</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
