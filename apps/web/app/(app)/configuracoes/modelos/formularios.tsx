'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { enviar, voltarAoPadrao } from './acoes'

export function FormularioModelo({ tipo, proprio }: { tipo: string; proprio: boolean }) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    enviar.bind(null, tipo),
    {},
  )
  const [estadoPadrao, acaoPadrao, voltando] = useActionState<EstadoFormulario, FormData>(
    voltarAoPadrao.bind(null, tipo),
    {},
  )
  const erro = estado.erros?.arquivo ?? estado.erro ?? estadoPadrao.erro
  return (
    <div className="flex flex-col gap-2">
      {erro && <Alerta>{erro}</Alerta>}
      {(estado.ok || estadoPadrao.ok) && (
        <Alerta tipo="sucesso">{estado.ok ?? estadoPadrao.ok}</Alerta>
      )}
      <form action={acao} className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="arquivo"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          aria-label={`Arquivo do modelo (${tipo})`}
          className="text-sm"
        />
        <Button type="submit" size="sm" disabled={enviando}>
          {enviando ? 'Conferindo…' : 'Enviar meu modelo'}
        </Button>
      </form>
      {proprio && (
        <form action={acaoPadrao}>
          <Button type="submit" size="sm" variant="outline" disabled={voltando}>
            Voltar ao modelo padrão
          </Button>
        </form>
      )}
    </div>
  )
}
