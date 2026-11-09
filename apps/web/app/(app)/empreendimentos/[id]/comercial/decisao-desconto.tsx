'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Entrada } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { decidirDesconto } from './acoes'

export function DecisaoDesconto({
  empreendimentoId,
  aprovacaoId,
  rotulo,
}: {
  empreendimentoId: string
  aprovacaoId: string
  rotulo: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    decidirDesconto.bind(null, empreendimentoId, aprovacaoId),
    {},
  )
  if (estado.ok) return <Alerta tipo="sucesso">{estado.ok}</Alerta>
  const campo = `motivo-${aprovacaoId}`
  return (
    <form action={acao} className="flex flex-col gap-2">
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <label htmlFor={campo} className="sr-only">
        Motivo da decisão ({rotulo})
      </label>
      <Entrada id={campo} name="motivo" placeholder="Motivo (obrigatório para recusar)" />
      <div className="flex gap-2">
        <Button type="submit" name="decisao" value="aprovar" size="sm" disabled={enviando}>
          Aprovar
        </Button>
        <Button
          type="submit"
          name="decisao"
          value="recusar"
          size="sm"
          variant="outline"
          disabled={enviando}
        >
          Recusar
        </Button>
      </div>
    </form>
  )
}
