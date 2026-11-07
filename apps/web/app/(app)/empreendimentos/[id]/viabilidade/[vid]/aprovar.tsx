'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { aprovarEstudo } from '../acoes'

export function FormularioAprovar({
  empreendimentoId,
  id,
  revisao,
}: {
  empreendimentoId: string
  id: string
  revisao: boolean
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    aprovarEstudo.bind(null, empreendimentoId, id),
    {},
  )
  if (estado.ok) return <Alerta tipo="sucesso">{estado.ok}</Alerta>
  const er = estado.erros ?? {}
  return (
    <form action={acao} className="flex flex-col gap-3">
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <p className="text-sm text-muted-foreground">
        {revisao
          ? 'Já existe um plano aprovado. Aprovar este estudo cria uma revisão; o plano original continua guardado.'
          : 'Aprovar congela premissas e indicadores como o plano original do empreendimento.'}
      </p>
      {revisao && (
        <Campo id="motivo" rotulo="Motivo da revisão" erro={er.motivo}>
          <Entrada
            {...ariaCampo('motivo', er.motivo)}
            defaultValue={estado.valores?.motivo}
            placeholder="Ex.: infraestrutura 15% mais cara"
          />
        </Campo>
      )}
      <Button type="submit" disabled={enviando}>
        {enviando
          ? 'Aprovando…'
          : revisao
            ? 'Aprovar revisão do plano'
            : 'Aprovar como plano original'}
      </Button>
    </form>
  )
}
