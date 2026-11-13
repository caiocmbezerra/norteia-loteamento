import Link from 'next/link'
import { IlustracaoLoteamento } from '@/components/ilustracao-loteamento'

const DESTAQUES = [
  'Viabilidade, custos e fluxo de caixa de cada empreendimento',
  'Vendas, contratos e cobrança por boleto e Pix',
  'Portal do comprador com parcelas, extrato e atendimento',
]

export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1.1fr_1fr]">
      {/* Painel ilustrado: faixa no celular, metade da tela no computador */}
      <aside className="relative isolate overflow-hidden bg-[#1d4a31] text-white">
        <IlustracaoLoteamento className="absolute inset-0 -z-20 size-full" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0f2d1d]/95 via-[#14402a]/70 to-[#14402a]/30 lg:bg-gradient-to-br lg:from-[#0f2d1d]/90 lg:via-[#14402a]/55 lg:to-transparent" />
        <div className="flex h-full min-h-44 flex-col justify-between gap-8 p-6 sm:p-10 lg:min-h-dvh lg:p-14">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-wide">
            <span className="grid size-8 place-items-center rounded-md bg-white/15 ring-1 ring-white/30 backdrop-blur">
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M12 3 4 21l8-4 8 4-8-18Z" strokeLinejoin="round" />
              </svg>
            </span>
            NORTEIA LOTEAMENTO
          </Link>
          <div className="hidden max-w-lg flex-col gap-5 lg:flex">
            <h2 className="text-4xl font-semibold leading-tight tracking-tight [text-wrap:balance]">
              Seu loteamento, do terreno à última parcela.
            </h2>
            <ul className="flex flex-col gap-3 text-base text-white/90">
              {DESTAQUES.map((d) => (
                <li key={d} className="flex items-start gap-3">
                  <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-white/20 ring-1 ring-white/40">
                    <svg
                      viewBox="0 0 24 24"
                      className="size-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      aria-hidden="true"
                    >
                      <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {d}
                </li>
              ))}
            </ul>
          </div>
          <p className="hidden text-xs text-white/70 lg:block">
            © {new Date().getFullYear()} NorteIA · www.norteialoteamento.com.br
          </p>
          <p className="text-lg font-semibold leading-snug [text-wrap:balance] lg:hidden">
            Seu loteamento, do terreno à última parcela.
          </p>
        </div>
      </aside>
      <main className="flex items-start justify-center px-4 py-8 sm:px-8 lg:items-center lg:py-12">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-lg shadow-black/5 sm:p-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          {children}
        </div>
      </main>
    </div>
  )
}
