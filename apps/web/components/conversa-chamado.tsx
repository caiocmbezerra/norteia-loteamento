'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, AreaTexto, Campo, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { cn } from '@/lib/utils'

const quando = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

/** Conversa do chamado; `souComprador` decide de que lado ficam as mensagens. */
export function ConversaChamado({
  mensagens,
  souComprador,
  nomeLoteadora,
  acao: acaoServidor,
}: {
  mensagens: { id: string; autorComprador: boolean; texto: string; criadoEm: string }[]
  souComprador: boolean
  nomeLoteadora: string
  acao: (estado: EstadoFormulario, form: FormData) => Promise<EstadoFormulario>
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(acaoServidor, {})
  const er = estado.erros ?? {}
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3" aria-label="Mensagens">
        {mensagens.map((m) => {
          const minha = m.autorComprador === souComprador
          return (
            <li
              key={m.id}
              className={cn(
                'max-w-[85%] rounded-lg border p-3 text-sm',
                minha ? 'self-end bg-primary/10' : 'self-start bg-muted',
              )}
            >
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {m.autorComprador ? 'Comprador' : nomeLoteadora} ·{' '}
                {quando.format(new Date(m.criadoEm))}
              </p>
              <p className="whitespace-pre-wrap">{m.texto}</p>
            </li>
          )
        })}
      </ol>
      <form action={acao} className="flex flex-col gap-3" noValidate>
        {estado.erro && <Alerta>{estado.erro}</Alerta>}
        <Campo id="texto" rotulo="Sua mensagem" erro={er.texto}>
          <AreaTexto {...ariaCampo('texto', er.texto)} maxLength={4000} rows={3} />
        </Campo>
        <Button type="submit" disabled={enviando} className="self-start">
          {enviando ? 'Enviando…' : 'Enviar mensagem'}
        </Button>
      </form>
    </div>
  )
}
