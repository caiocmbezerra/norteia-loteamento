import { formatarMoeda } from '@norteia/dominio'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { IlustracaoLoteamento } from '@/components/ilustracao-loteamento'
import { clienteServidor } from '@/lib/supabase/servidor'
import { FormularioInteresse } from './formulario'

interface LoteVitrine {
  id: string
  quadra: string
  numero: string
  area_m2: number
  disponivel: boolean
  preco_centavos: number | null
}
interface Vitrine {
  nome: string
  municipio: string | null
  uf: string | null
  descricao: string | null
  em_vendas: boolean
  loteadora: string
  precos: 'lote' | 'a_partir' | 'nenhum'
  a_partir_centavos: number | null
  lotes: LoteVitrine[]
}

const carregar = cache(async (slug: string): Promise<Vitrine | null> => {
  const db = await clienteServidor()
  const { data } = await db.rpc('vitrine_publica', { p_slug: slug })
  return (data as Vitrine | null) ?? null
})

const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))
const area = (m2: number) => `${new Intl.NumberFormat('pt-BR').format(m2)} m²`

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const v = await carregar((await params).slug)
  if (!v) return { title: 'Empreendimento' }
  const local = [v.municipio, v.uf].filter(Boolean).join(' - ')
  const disponiveis = v.lotes.filter((l) => l.disponivel).length
  return {
    title: `${v.nome}${local ? ` · ${local}` : ''}`,
    description:
      v.descricao ??
      `${disponiveis} lotes disponíveis${v.a_partir_centavos ? ` a partir de ${moeda(v.a_partir_centavos)}` : ''}. ${v.loteadora}.`,
  }
}

export default async function PaginaVitrine({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lote?: string }>
}) {
  const [{ slug }, { lote }] = await Promise.all([params, searchParams])
  const v = await carregar(slug)
  if (!v) notFound()
  const local = [v.municipio, v.uf].filter(Boolean).join(' - ')
  const disponiveis = v.lotes.filter((l) => l.disponivel)
  const quadras = [...new Set(v.lotes.map((l) => l.quadra))]

  return (
    <div className="min-h-dvh bg-background">
      <header className="relative isolate overflow-hidden bg-[#1d4a31] text-white">
        <IlustracaoLoteamento className="absolute inset-0 -z-20 size-full" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0f2d1d]/95 via-[#14402a]/70 to-[#14402a]/35" />
        <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 pb-10 pt-6 sm:px-8 sm:pb-14">
          <p className="text-sm font-semibold uppercase tracking-wide text-white/85">
            {v.loteadora}
          </p>
          <div className="flex flex-col gap-2">
            <span className="w-fit rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/30">
              {v.em_vendas ? 'Vendas abertas' : 'Lançamento em breve'}
            </span>
            <h1 className="text-3xl font-semibold tracking-tight [text-wrap:balance] sm:text-5xl">
              {v.nome}
            </h1>
            {local && <p className="text-base text-white/85">{local}</p>}
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/20 backdrop-blur">
              <p className="text-xs text-white/75">Lotes disponíveis</p>
              <p className="text-2xl font-semibold">{disponiveis.length}</p>
            </div>
            {v.a_partir_centavos != null && (
              <div className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/20 backdrop-blur">
                <p className="text-xs text-white/75">A partir de</p>
                <p className="text-2xl font-semibold">{moeda(v.a_partir_centavos)}</p>
              </div>
            )}
          </div>
          <a
            href="#interesse"
            className="w-fit rounded-lg bg-white px-5 py-3 font-semibold text-[#14402a] shadow-lg hover:bg-white/90"
          >
            Tenho interesse
          </a>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="t-lotes" className="flex flex-col gap-4">
          {v.descricao && <p className="whitespace-pre-line text-base">{v.descricao}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="t-lotes" className="text-xl font-semibold">
              Lotes
            </h2>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-3 rounded-sm bg-emerald-200 ring-1 ring-emerald-400" />
                Disponível
              </span>
              <span className="flex items-center gap-1">
                <span className="size-3 rounded-sm bg-muted ring-1 ring-border" />
                Indisponível
              </span>
            </div>
          </div>
          {quadras.map((q) => (
            <div key={q} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-muted-foreground">Quadra {q}</h3>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {v.lotes
                  .filter((l) => l.quadra === q)
                  .map((l) => (
                    <li key={l.id}>
                      {l.disponivel ? (
                        <a
                          href={`?lote=${l.id}#interesse`}
                          className={`flex flex-col rounded-lg border px-2 py-2 text-center text-xs transition-colors ${lote === l.id ? 'border-emerald-600 bg-emerald-100 ring-2 ring-emerald-600' : 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100'}`}
                        >
                          <span className="text-sm font-semibold text-emerald-900">
                            Lote {l.numero}
                          </span>
                          <span className="text-emerald-800">{area(l.area_m2)}</span>
                          {l.preco_centavos != null && (
                            <span className="font-medium text-emerald-900">
                              {moeda(l.preco_centavos)}
                            </span>
                          )}
                        </a>
                      ) : (
                        <span
                          className="flex flex-col rounded-lg border bg-muted px-2 py-2 text-center text-xs text-muted-foreground"
                          aria-label={`Lote ${l.numero}, indisponível`}
                        >
                          <span className="text-sm font-semibold line-through">
                            Lote {l.numero}
                          </span>
                          <span>Indisponível</span>
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Disponibilidade atualizada em tempo real. Toque num lote disponível para pedir
            informações sobre ele.
          </p>
        </section>

        <aside
          id="interesse"
          aria-labelledby="t-interesse"
          className="flex h-fit flex-col gap-4 rounded-2xl border bg-card p-5 shadow-lg shadow-black/5 lg:sticky lg:top-6"
        >
          <div>
            <h2 id="t-interesse" className="text-xl font-semibold">
              Tenho interesse
            </h2>
            <p className="text-sm text-muted-foreground">
              Deixe seu contato. A equipe da {v.loteadora} responde com valores, condições e visita.
            </p>
          </div>
          <FormularioInteresse
            slug={slug}
            loteadora={v.loteadora}
            lotes={disponiveis.map((l) => ({
              id: l.id,
              rotulo: `Quadra ${l.quadra} · Lote ${l.numero} · ${area(l.area_m2)}${l.preco_centavos != null ? ` · ${moeda(l.preco_centavos)}` : ''}`,
            }))}
            {...(lote ? { loteEscolhido: lote } : {})}
          />
        </aside>
      </main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        {v.loteadora} · página feita com NorteIA Loteamento
      </footer>
    </div>
  )
}
