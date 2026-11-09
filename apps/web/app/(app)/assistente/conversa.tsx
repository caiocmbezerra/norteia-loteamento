'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, AreaTexto } from '@/components/ui/formulario'
import { type TrocaAssistente, perguntar } from './acoes'

const SUGESTOES = [
  'Quanto tenho a receber nos próximos meses?',
  'Qual empreendimento tem mais inadimplência?',
  'Qual é a TIR atual comparada ao plano?',
]

export function Conversa() {
  const [trocas, setTrocas] = useState<TrocaAssistente[]>([])
  const [pergunta, setPergunta] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pensando, iniciar] = useTransition()

  function enviar(texto: string) {
    setErro(null)
    iniciar(async () => {
      const r = await perguntar(trocas, texto)
      if ('erro' in r) setErro(r.erro)
      else {
        setTrocas([...trocas, r])
        setPergunta('')
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-4" aria-label="Conversa">
        {trocas.map((t, i) => (
          <li key={i} className="flex flex-col gap-2">
            <p className="self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
              {t.pergunta}
            </p>
            <div className="rounded-lg border bg-card px-3 py-2 text-sm whitespace-pre-line">
              {t.resposta}
              {t.naoConferidos.length > 0 && (
                <p className="mt-2 text-xs font-medium text-destructive">
                  Atenção: {t.naoConferidos.join(', ')} não veio das consultas ao sistema. Confira
                  nas telas.
                </p>
              )}
              {t.fontes.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Consultado: {t.fontes.join(' · ')}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      {trocas.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGESTOES.map((s) => (
            <Button
              key={s}
              type="button"
              variant="outline"
              size="sm"
              disabled={pensando}
              onClick={() => enviar(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      )}
      {erro && <Alerta>{erro}</Alerta>}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          enviar(pergunta)
        }}
      >
        <label htmlFor="pergunta" className="text-sm font-medium">
          Sua pergunta
        </label>
        <AreaTexto
          id="pergunta"
          rows={2}
          value={pergunta}
          onChange={(e) => setPergunta(e.currentTarget.value)}
          placeholder="Ex.: quanto está vencido no Jardim das Flores?"
        />
        <Button type="submit" disabled={pensando || pergunta.trim().length < 3}>
          {pensando ? 'Consultando…' : 'Perguntar'}
        </Button>
      </form>
    </div>
  )
}
