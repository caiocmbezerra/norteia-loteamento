'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta } from '@/components/ui/formulario'
import { aceitarPortal } from './acoes'

export function BotaoAceitarPortal({ token }: { token: string }) {
  const [estado, acao, enviando] = useActionState(aceitarPortal.bind(null, token), {})
  return (
    <form action={acao} className="flex flex-col gap-3">
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? 'Abrindo…' : 'Abrir meu portal'}
      </Button>
    </form>
  )
}
