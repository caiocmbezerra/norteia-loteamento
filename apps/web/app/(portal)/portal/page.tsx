import { carregarMeuPortal, temPortal } from '@norteia/aplicacao'
import { formatarData, formatarMoeda, formatarPercentual } from '@norteia/dominio'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Cartao, Indicador, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirUsuario } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'
import { BotaoSegundaVia } from './botao-segunda-via'

export const metadata: Metadata = { title: 'Meu portal' }

const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))
const SITUACAO_CONTRATO: Record<string, string> = {
  vigente: 'Contrato vigente',
  quitado: 'Quitado',
  distratado: 'Distratado',
  cedido: 'Cedido',
}
const MOVIMENTO: Record<string, string> = {
  aporte: 'Aporte',
  mutuo: 'Mútuo',
  devolucao_mutuo: 'Devolução de mútuo',
  distribuicao: 'Distribuição',
}

export default async function PaginaPortal() {
  const { db, usuario } = await exigirUsuario()
  const hoje = hojeSaoPaulo()
  const [p, { data: vitrinesBrutas }] = await Promise.all([
    carregarMeuPortal(db, hoje),
    db.rpc('vitrines_do_portal'),
  ])
  const vitrines = (vitrinesBrutas ?? []) as {
    slug: string
    nome: string
    municipio: string | null
    uf: string | null
    loteadora: string
    em_vendas: boolean
    disponiveis: number
    a_partir_centavos: number | null
  }[]
  const primeiroNome = usuario.nome.split(' ')[0]

  return (
    <>
      <TituloPagina
        titulo={primeiroNome ? `Olá, ${primeiroNome}` : 'Meu portal'}
        subtitulo="Seus contratos, sociedades e permutas com as loteadoras."
      />
      {!temPortal(p) && (
        <Alerta tipo="aviso">
          Nada por aqui ainda. Peça à loteadora um convite para o portal, enviado para{' '}
          {usuario.email}.
        </Alerta>
      )}

      {p.contratos.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="t-contratos">
          <h2 id="t-contratos" className="text-lg font-semibold">
            Meus lotes
          </h2>
          {p.contratos.map((c) => (
            <Cartao key={c.id} className="flex flex-col gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">
                  {c.loteadora} · {c.empreendimento}
                </span>
                <span className="font-semibold">{c.lote}</span>
                <span className="text-xs text-muted-foreground">
                  {SITUACAO_CONTRATO[c.situacao] ?? c.situacao}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Indicador rotulo="Saldo a pagar" valor={moeda(c.saldo)} />
                <Indicador
                  rotulo="Em atraso"
                  valor={moeda(c.vencido)}
                  {...(c.vencido > 0 ? { nota: 'Pague pela segunda via' } : {})}
                />
              </div>
              {c.proxima && (
                <div className="flex flex-col gap-2 rounded-lg border bg-background p-3">
                  <span className="text-sm">
                    Próxima parcela ({c.proxima.numero === 0 ? 'entrada' : `nº ${c.proxima.numero}`}
                    ): <strong>{moeda(c.proxima.saldo)}</strong> em{' '}
                    {formatarData(c.proxima.vencimento)}
                  </span>
                  {c.boleto_disponivel && <BotaoSegundaVia parcelaId={c.proxima.id} tamanho="lg" />}
                </div>
              )}
              <Button asChild variant="outline">
                <Link href={`/portal/contratos/${c.id}`}>Parcelas e pagamentos</Link>
              </Button>
            </Cartao>
          ))}
        </section>
      )}

      {p.sociedades.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="t-sociedades">
          <h2 id="t-sociedades" className="text-lg font-semibold">
            Minhas sociedades
          </h2>
          {p.sociedades.map((s) => (
            <Cartao key={`${s.spe}-${s.socio}`} className="flex flex-col gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">{s.loteadora}</span>
                <span className="font-semibold">{s.spe}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Indicador
                  rotulo="Participação"
                  valor={
                    s.participacao !== null ? formatarPercentual(String(s.participacao), 2) : '—'
                  }
                />
                <Indicador rotulo="Aportado" valor={moeda(s.aportes)} />
                <Indicador rotulo="Recebido" valor={moeda(s.recebido)} />
              </div>
              {s.movimentos.length > 0 && (
                <ul className="flex flex-col divide-y text-sm">
                  {s.movimentos.map((m, i) => (
                    <li key={i} className="flex justify-between gap-2 py-2">
                      <span>
                        {formatarData(m.data)} · {MOVIMENTO[m.tipo] ?? m.tipo}
                      </span>
                      <span className="font-medium">{moeda(m.valor)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          ))}
        </section>
      )}

      {p.permutas.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="t-permutas">
          <h2 id="t-permutas" className="text-lg font-semibold">
            Minhas permutas
          </h2>
          {p.permutas.map((m) => (
            <Cartao key={m.id} className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">
                  {m.loteadora} · {m.empreendimento}
                </span>
                <span className="font-semibold">
                  {m.tipo === 'fisica'
                    ? `Permuta física · ${m.lotes} ${m.lotes === 1 ? 'lote' : 'lotes'}`
                    : `Permuta financeira · ${formatarPercentual(String(m.percentual ?? 0), 2)}`}
                </span>
              </div>
              <Button asChild variant="outline">
                <Link href={`/portal/permutas/${m.id}`}>Ver extrato</Link>
              </Button>
            </Cartao>
          ))}
        </section>
      )}

      {vitrines.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="t-lancamentos">
          <h2 id="t-lancamentos" className="text-lg font-semibold">
            Lançamentos e lotes disponíveis
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {vitrines.map((v) => (
              <Cartao key={v.slug} className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">
                  {v.loteadora} · {v.em_vendas ? 'Vendas abertas' : 'Lançamento em breve'}
                </span>
                <span className="font-semibold">{v.nome}</span>
                <span className="text-sm text-muted-foreground">
                  {[v.municipio, v.uf].filter(Boolean).join(' - ')}
                  {' · '}
                  {v.disponiveis} {v.disponiveis === 1 ? 'lote disponível' : 'lotes disponíveis'}
                  {v.a_partir_centavos != null && ` · a partir de ${moeda(v.a_partir_centavos)}`}
                </span>
                <Button asChild variant="outline" className="self-start">
                  <Link href={`/v/${v.slug}`}>Ver lotes</Link>
                </Button>
              </Cartao>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
