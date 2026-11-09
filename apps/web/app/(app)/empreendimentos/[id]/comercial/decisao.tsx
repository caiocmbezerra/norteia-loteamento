'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Entrada } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'

/** Aceitar/aprovar ou recusar (com motivo) um pedido da área comercial. */
export function Decisao({
  acao: acaoServidor,
  id,
  rotulo,
  aceitar = 'Aprovar',
}: {
  acao: (estado: EstadoFormulario, form: FormData) => Promise<EstadoFormulario>
  id: string
  rotulo: string
  aceitar?: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(acaoServidor, {})
  if (estado.ok) return <Alerta tipo="sucesso">{estado.ok}</Alerta>
  const campo = `motivo-${id}`
  return (
    <form action={acao} className="flex flex-col gap-2">
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <label htmlFor={campo} className="sr-only">
        Motivo da decisão ({rotulo})
      </label>
      <Entrada id={campo} name="motivo" placeholder="Motivo (obrigatório para recusar)" />
      <div className="flex gap-2">
        <Button type="submit" name="decisao" value="aprovar" size="sm" disabled={enviando}>
          {aceitar}
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
