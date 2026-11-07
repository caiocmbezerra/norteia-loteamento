'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})
const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

/**
 * Caixa acumulado do empreendimento, mês a mês (uma série: sem legenda, o título nomeia).
 * Marca a exposição máxima e o payback. Valores em REAIS (já convertidos de centavos).
 */
export function GraficoCaixa({
  acumulado,
  exposicaoMes,
  paybackMes,
}: {
  acumulado: number[]
  exposicaoMes: number
  paybackMes: number | null
}) {
  const id = useId()
  const [foco, setFoco] = useState<number | null>(null)
  // A área de desenho usa a largura real do contêiner, para que o texto fique sempre em
  // tamanho legível (11–12px) no celular e no desktop.
  const caixaRef = useRef<HTMLDivElement>(null)
  const [L, setL] = useState(720)
  useEffect(() => {
    const el = caixaRef.current
    if (!el) return
    const medir = () => setL(Math.max(280, Math.round(el.getBoundingClientRect().width)))
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  const A = Math.round(Math.min(340, Math.max(220, L * 0.42)))
  const m = { topo: 28, dir: 12, base: 44, esq: 52 }
  const largura = L - m.esq - m.dir
  const altura = A - m.topo - m.base

  const { min, max, x, y, caminho, marcas } = useMemo(() => {
    const min = Math.min(0, ...acumulado)
    const max = Math.max(0, ...acumulado)
    const n = Math.max(1, acumulado.length - 1)
    const x = (i: number) => m.esq + (i / n) * largura
    const y = (v: number) => m.topo + ((max - v) / (max - min || 1)) * altura
    const caminho = acumulado
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join('')
    const passo = L < 480 ? (n > 120 ? 48 : 24) : n > 120 ? 24 : 12
    const marcas = Array.from({ length: Math.floor(n / passo) + 1 }, (_, k) => k * passo)
    return { min, max, x, y, caminho, marcas }
  }, [acumulado, altura, largura, m.esq, m.topo, L])

  const ticksY = [min, min / 2, 0, max / 2, max].filter((v, i, a) => a.indexOf(v) === i)

  function aoMover(e: React.PointerEvent<SVGRectElement>) {
    const caixa = e.currentTarget.getBoundingClientRect()
    const rel = (e.clientX - caixa.left) / caixa.width
    const i = Math.round(rel * (acumulado.length - 1))
    setFoco(Math.max(0, Math.min(acumulado.length - 1, i)))
  }

  return (
    <figure className="flex flex-col gap-2">
      <figcaption id={`${id}-titulo`} className="text-sm font-medium">
        Caixa acumulado do empreendimento
        <span className="ml-2 font-normal text-muted-foreground">(R$, mês a mês)</span>
      </figcaption>
      <div className="relative" ref={caixaRef}>
        <svg
          viewBox={`0 0 ${L} ${A}`}
          width={L}
          height={A}
          className="block touch-none text-primary"
          role="img"
          aria-labelledby={`${id}-titulo`}
          aria-describedby={`${id}-desc`}
        >
          <desc id={`${id}-desc`}>
            Saldo acumulado do mês 0 ao mês {acumulado.length - 1}. Menor saldo de{' '}
            {brl.format(acumulado[exposicaoMes] ?? 0)} no mês {exposicaoMes}.
            {paybackMes !== null ? ` Volta a ficar positivo no mês ${paybackMes}.` : ''}
          </desc>
          {ticksY.map((v) => (
            <g key={v}>
              <line
                x1={m.esq}
                x2={L - m.dir}
                y1={y(v)}
                y2={y(v)}
                className={v === 0 ? 'stroke-foreground/40' : 'stroke-border'}
                strokeWidth={1}
              />
              <text
                x={m.esq - 6}
                y={y(v)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-[11px]"
              >
                {compacto.format(v)}
              </text>
            </g>
          ))}
          {marcas.map((mes) => (
            <text
              key={mes}
              x={x(mes)}
              y={A - m.base + 16}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {mes}
            </text>
          ))}
          <path
            d={caminho}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <circle
            cx={x(exposicaoMes)}
            cy={y(acumulado[exposicaoMes] ?? 0)}
            r={5}
            className="fill-card stroke-foreground"
            strokeWidth={2}
          />
          <text
            x={x(exposicaoMes)}
            y={A - 6}
            textAnchor={x(exposicaoMes) < m.esq + 80 ? 'start' : 'middle'}
            className="fill-foreground text-[11px] font-medium"
          >
            exposição máxima · mês {exposicaoMes}
          </text>
          {paybackMes !== null && (
            <>
              <circle
                cx={x(paybackMes)}
                cy={y(acumulado[paybackMes] ?? 0)}
                r={5}
                className="fill-card stroke-foreground"
                strokeWidth={2}
              />
              <text
                x={x(paybackMes) - 8}
                y={y(acumulado[paybackMes] ?? 0)}
                dy="-0.7em"
                textAnchor="end"
                className="fill-foreground text-[11px] font-medium"
              >
                payback · mês {paybackMes}
              </text>
            </>
          )}
          {foco !== null && (
            <>
              <line
                x1={x(foco)}
                x2={x(foco)}
                y1={m.topo}
                y2={A - m.base}
                className="stroke-foreground/30"
                strokeWidth={1}
              />
              <circle
                cx={x(foco)}
                cy={y(acumulado[foco] ?? 0)}
                r={4}
                fill="currentColor"
                className="stroke-card"
                strokeWidth={2}
              />
            </>
          )}
          <rect
            x={m.esq}
            y={m.topo}
            width={largura}
            height={altura}
            fill="transparent"
            onPointerMove={aoMover}
            onPointerDown={aoMover}
            onPointerLeave={() => setFoco(null)}
          />
        </svg>
        {foco !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 rounded-md border bg-card px-2 py-1 text-xs shadow-sm"
            style={{
              left: `${(x(foco) / L) * 100}%`,
              transform: `translateX(${x(foco) > L / 2 ? '-105%' : '5%'})`,
            }}
          >
            <span className="text-muted-foreground">Mês {foco}</span>
            <br />
            <span className="font-medium">{brl.format(acumulado[foco] ?? 0)}</span>
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          Ver em tabela (fim de cada ano)
        </summary>
        <table className="mt-2 w-full text-right text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-normal">Mês</th>
              <th className="font-normal">Caixa acumulado</th>
            </tr>
          </thead>
          <tbody>
            {acumulado
              .map((v, i) => [i, v] as const)
              .filter(([i]) => i % 12 === 0 || i === acumulado.length - 1)
              .map(([i, v]) => (
                <tr key={i} className="border-t">
                  <td className="py-1 text-left">{i}</td>
                  <td className="py-1">{brl.format(v)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
