'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta } from '@/components/ui/formulario'
import { descadastrar } from './acoes'

export function BotaoDescadastrar({ token }: { token: string }) {
  const [estado, acao, enviando] = useActionState(descadastrar.bind(null, token), {})
  if (estado.feito)
    return (
      <Alerta tipo="sucesso">
        Pronto. Você não vai mais receber lembretes de vencimento por e-mail de {estado.feito}. Se
        mudar de ideia, religue no portal do comprador.
      </Alerta>
    )
  return (
    <form action={acao} className="flex flex-col gap-3">
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Não quero mais receber lembretes'}
      </Button>
    </form>
  )
}
