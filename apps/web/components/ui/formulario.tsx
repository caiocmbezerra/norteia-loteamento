import type * as React from 'react'
import { cn } from '@/lib/utils'

const baseCampo =
  'h-11 w-full rounded-md border bg-background px-3 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 aria-invalid:border-destructive disabled:opacity-60 sm:text-sm'

export function Entrada({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(baseCampo, className)} {...props} />
}

export function Selecao({ className, ...props }: React.ComponentProps<'select'>) {
  return <select className={cn(baseCampo, 'pr-8', className)} {...props} />
}

export function AreaTexto({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(baseCampo, 'h-auto min-h-20 py-2', className)} {...props} />
}

/** Rótulo + controle + ajuda + erro, com ligações de acessibilidade. */
export function Campo({
  id,
  rotulo,
  ajuda,
  erro,
  className,
  children,
}: {
  id: string
  rotulo: string
  ajuda?: string
  erro?: string | undefined
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      {children}
      {ajuda && !erro && (
        <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
          {ajuda}
        </p>
      )}
      {erro && (
        <p id={`${id}-erro`} role="alert" className="text-xs font-medium text-destructive">
          {erro}
        </p>
      )}
    </div>
  )
}

/** Propriedades de acessibilidade para o controle dentro de <Campo>. */
export function ariaCampo(id: string, erro?: string, ajuda?: string) {
  return {
    id,
    name: id,
    'aria-invalid': erro ? true : undefined,
    'aria-describedby': erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined,
  } as const
}

export function Alerta({
  tipo = 'erro',
  children,
}: {
  tipo?: 'erro' | 'aviso' | 'sucesso'
  children: React.ReactNode
}) {
  return (
    <div
      role={tipo === 'erro' ? 'alert' : 'status'}
      className={cn(
        'rounded-md border px-3 py-2 text-sm',
        tipo === 'erro' && 'border-destructive/40 bg-destructive/10 text-destructive',
        tipo === 'aviso' && 'border-accent-foreground/20 bg-accent text-accent-foreground',
        tipo === 'sucesso' && 'border-primary/30 bg-secondary text-secondary-foreground',
      )}
    >
      {children}
    </div>
  )
}
