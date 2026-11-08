'use client'

import { Button } from '@/components/ui/button'

export function BotaoImprimir() {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden">
      Imprimir ou salvar em PDF
    </Button>
  )
}
