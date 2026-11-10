import { ROTULO_SITUACAO_MAPA, type SituacaoMapa } from '@norteia/dominio'
import { cn } from '@/lib/utils'

// Cores com contraste AA; o texto do status sempre acompanha a cor (não depender só de cor).
export const COR_STATUS: Record<SituacaoMapa, string> = {
  disponivel:
    'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800',
  reservado:
    'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800',
  vendido:
    'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950 dark:text-sky-100 dark:border-sky-800',
  quitado:
    'bg-indigo-200 text-indigo-950 border-indigo-400 dark:bg-indigo-900 dark:text-indigo-50 dark:border-indigo-600',
  bloqueado:
    'bg-zinc-200 text-zinc-800 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700',
  permuta:
    'bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-950 dark:text-violet-100 dark:border-violet-800',
}

export function SeloStatus({ status, className }: { status: SituacaoMapa; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        COR_STATUS[status],
        className,
      )}
    >
      {ROTULO_SITUACAO_MAPA[status]}
    </span>
  )
}
