'use client'

import { ROTULO_SITUACAO_MAPA, type SituacaoMapa } from '@norteia/dominio'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Preenchimento semitransparente para a planta continuar legível; o nome acessível traz a situação.
export const COR_PLANTA: Record<SituacaoMapa, string> = {
  disponivel: 'fill-emerald-400/45 stroke-emerald-800',
  reservado: 'fill-amber-400/50 stroke-amber-800',
  vendido: 'fill-sky-500/45 stroke-sky-900',
  quitado: 'fill-indigo-600/50 stroke-indigo-950',
  bloqueado: 'fill-zinc-500/45 stroke-zinc-800',
  permuta: 'fill-violet-500/45 stroke-violet-900',
}

export interface LotePlanta {
  id: string
  rotulo: string
  status: SituacaoMapa
  pontos: [number, number][]
  href?: string
}

export const pontosSvg = (pontos: [number, number][], largura: number, altura: number) =>
  pontos.map(([x, y]) => `${(x * largura).toFixed(1)},${(y * altura).toFixed(1)}`).join(' ')

/** Planta do loteamento com os lotes coloridos pela situação; cada lote leva à sua página. */
export function PlantaLotes({
  url,
  largura,
  altura,
  lotes,
}: {
  url: string
  largura: number
  altura: number
  lotes: LotePlanta[]
}) {
  const [zoom, setZoom] = useState(1)
  const traco = Math.max(largura, altura) / 600
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Legenda />
        <div className="flex gap-1" role="group" aria-label="Zoom da planta">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setZoom((z) => Math.max(1, z / 1.5))}
            disabled={zoom <= 1}
            aria-label="Diminuir zoom"
          >
            −
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setZoom((z) => Math.min(6, z * 1.5))}
            disabled={zoom >= 6}
            aria-label="Aumentar zoom"
          >
            +
          </Button>
        </div>
      </div>
      <div className="max-h-[75vh] overflow-auto rounded-md border" tabIndex={0}>
        <svg
          viewBox={`0 0 ${largura} ${altura}`}
          style={{ width: `${zoom * 100}%` }}
          className="block h-auto"
          role="group"
          aria-label="Planta do loteamento"
        >
          <image href={url} width={largura} height={altura} />
          {lotes.map((l) => {
            const poligono = (
              <polygon
                points={pontosSvg(l.pontos, largura, altura)}
                strokeWidth={traco}
                className={cn(COR_PLANTA[l.status], 'transition-opacity hover:opacity-70')}
              />
            )
            const nome = `${l.rotulo}: ${ROTULO_SITUACAO_MAPA[l.status]}`
            return l.href ? (
              <Link key={l.id} href={l.href} aria-label={nome}>
                <title>{nome}</title>
                {poligono}
              </Link>
            ) : (
              <g key={l.id} role="img" aria-label={nome}>
                <title>{nome}</title>
                {poligono}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

export function Legenda() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Legenda">
      {(Object.keys(COR_PLANTA) as SituacaoMapa[]).map((s) => (
        <li key={s} className="flex items-center gap-1">
          <svg width="12" height="12" aria-hidden="true">
            <rect width="12" height="12" rx="2" strokeWidth="1.5" className={COR_PLANTA[s]} />
          </svg>
          {ROTULO_SITUACAO_MAPA[s]}
        </li>
      ))}
    </ul>
  )
}
