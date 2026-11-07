import type * as React from 'react'
import { cn } from '@/lib/utils'

export function Cartao({ className, ...props }: React.ComponentProps<'section'>) {
  return <section className={cn('rounded-xl border bg-card p-4 sm:p-6', className)} {...props} />
}

export function TituloPagina({
  titulo,
  subtitulo,
  acoes,
}: {
  titulo: string
  subtitulo?: React.ReactNode
  acoes?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {subtitulo && <p className="text-sm text-muted-foreground">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  )
}

export function Indicador({
  rotulo,
  valor,
  nota,
}: {
  rotulo: string
  valor: string
  nota?: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-background p-3">
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      <span className="text-base font-semibold sm:text-lg">{valor}</span>
      {nota && <span className="text-xs text-muted-foreground">{nota}</span>}
    </div>
  )
}
