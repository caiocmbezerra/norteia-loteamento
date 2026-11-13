import type { Metadata } from 'next'
import { BotaoDescadastrar } from './botao'

export const metadata: Metadata = { title: 'Lembretes por e-mail' }

export default async function PaginaDescadastrar({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Lembretes por e-mail</h1>
        <p className="text-sm text-muted-foreground">
          Você recebe lembretes de vencimento das parcelas do seu lote. Confirme abaixo para deixar
          de recebê-los. Os boletos e o portal continuam funcionando normalmente.
        </p>
      </div>
      <BotaoDescadastrar token={token} />
    </div>
  )
}
