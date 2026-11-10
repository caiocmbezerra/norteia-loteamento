'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { alternarResolvido } from './acoes'

export function BotaoSituacao({ chamadoId, resolvido }: { chamadoId: string; resolvido: boolean }) {
  const [pendente, iniciar] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pendente}
      onClick={() => iniciar(() => alternarResolvido(chamadoId, !resolvido))}
    >
      {resolvido ? 'Reabrir atendimento' : 'Marcar como resolvido'}
    </Button>
  )
}
