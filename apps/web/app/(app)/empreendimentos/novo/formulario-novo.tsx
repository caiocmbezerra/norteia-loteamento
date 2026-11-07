'use client'

import { useActionState } from 'react'
import { CamposEmpreendimento } from '@/components/empreendimento/campos-empreendimento'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Selecao } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { novoEmpreendimento } from '../acoes'

export function FormularioNovo({
  mesPadrao,
  spes,
}: {
  mesPadrao: string
  spes: { id: string; razao_social: string }[]
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    novoEmpreendimento,
    {},
  )
  return (
    <form action={acao} className="flex flex-col gap-4" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {spes.length > 1 && (
        <Campo id="spe" rotulo="SPE">
          <Selecao id="spe" name="spe" defaultValue={estado.valores?.spe ?? spes[0]?.id}>
            {spes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.razao_social}
              </option>
            ))}
          </Selecao>
        </Campo>
      )}
      <CamposEmpreendimento erros={estado.erros} valores={estado.valores} mesPadrao={mesPadrao} />
      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? 'Criando…' : 'Criar empreendimento'}
      </Button>
    </form>
  )
}
