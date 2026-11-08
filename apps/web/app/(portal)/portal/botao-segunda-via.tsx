'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta } from '@/components/ui/formulario'
import { segundaVia } from './acoes'

export function BotaoSegundaVia({
  parcelaId,
  rotulo = 'Segunda via do boleto',
  tamanho = 'default',
}: {
  parcelaId: string
  rotulo?: string
  tamanho?: 'default' | 'sm' | 'lg'
}) {
  const [estado, acao, enviando] = useActionState(segundaVia.bind(null, parcelaId), {})
  return (
    <form action={acao} className="flex flex-col gap-2">
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <Button type="submit" size={tamanho} disabled={enviando}>
        {enviando ? 'Gerando…' : rotulo}
      </Button>
    </form>
  )
}
