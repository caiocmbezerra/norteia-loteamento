'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { cancelar, reservar } from './acoes-comerciais'

export function FormularioReserva({
  empreendimentoId,
  loteId,
  corretores,
  prazoPadrao,
}: {
  empreendimentoId: string
  loteId: string
  /** Vazio quando quem reserva é o próprio corretor. */
  corretores: { id: string; nome: string }[]
  prazoPadrao: number
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    reservar.bind(null, empreendimentoId, loteId),
    {},
  )
  const er = estado.erros ?? {}
  if (estado.ok) return <Alerta tipo="sucesso">{estado.ok}</Alerta>
  return (
    <form action={acao} className="flex flex-col gap-3" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <Campo id="cliente" rotulo="Nome do cliente" erro={er.cliente}>
        <Entrada
          {...ariaCampo('cliente', er.cliente)}
          defaultValue={estado.valores?.cliente}
          autoComplete="off"
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        {corretores.length > 0 ? (
          <Campo id="corretor" rotulo="Corretor">
            <Selecao id="corretor" name="corretor" defaultValue={estado.valores?.corretor ?? ''}>
              <option value="">Sem corretor</option>
              {corretores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        ) : (
          <input type="hidden" name="corretor" value="" />
        )}
        <Campo id="horas" rotulo="Prazo (horas)" erro={er.horas}>
          <Entrada
            {...ariaCampo('horas', er.horas)}
            inputMode="numeric"
            defaultValue={estado.valores?.horas ?? String(prazoPadrao)}
          />
        </Campo>
      </div>
      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? 'Reservando…' : 'Reservar lote'}
      </Button>
    </form>
  )
}

export function FormularioCancelarReserva({
  empreendimentoId,
  loteId,
  reservaId,
}: {
  empreendimentoId: string
  loteId: string
  reservaId: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    cancelar.bind(null, empreendimentoId, loteId, reservaId),
    {},
  )
  if (estado.ok) return <Alerta tipo="sucesso">{estado.ok}</Alerta>
  const er = estado.erros ?? {}
  return (
    <form action={acao} className="flex flex-col gap-2" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <Campo id="motivo" rotulo="Motivo do cancelamento" erro={er.motivo}>
        <Entrada {...ariaCampo('motivo', er.motivo)} />
      </Campo>
      <Button type="submit" variant="outline" disabled={enviando}>
        Cancelar reserva
      </Button>
    </form>
  )
}
