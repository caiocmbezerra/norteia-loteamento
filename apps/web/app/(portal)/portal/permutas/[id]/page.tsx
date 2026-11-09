import { extratoPermutante } from '@norteia/aplicacao'
import { formatarData, formatarMoeda, formatarPercentual } from '@norteia/dominio'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Cartao, Indicador, TituloPagina } from '@/components/ui/cartao'
import { exigirUsuario } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'

export const metadata: Metadata = { title: 'Extrato da permuta' }

const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))
const BASES = {
  recebido: 'tudo o que é recebido',
  principal: 'amortização recebida',
  vgv: 'VGV (preço na venda)',
}

export default async function PaginaPermutaPortal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db } = await exigirUsuario()
  const e = await extratoPermutante(db, id, hojeSaoPaulo())
  if (!e) notFound()
  const { permuta: p, apuracao } = e

  return (
    <>
      <Link href="/portal" className="text-sm text-muted-foreground hover:underline">
        ← Meu portal
      </Link>
      <TituloPagina
        titulo={p.tipo === 'fisica' ? 'Permuta física' : 'Permuta financeira'}
        subtitulo={`${p.loteadora} · ${p.empreendimento} · desde ${formatarData(p.inicio)}`}
      />
      {apuracao ? (
        <>
          <p className="text-sm text-muted-foreground">
            {formatarPercentual(String(p.percentual), 2)} sobre {BASES[p.base!]}
            {p.abate_distrato ? ', abatendo as devoluções de distrato' : ''}. Apurado com os
            recebimentos registrados pela loteadora.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Indicador rotulo="Devido até hoje" valor={moeda(apuracao.devidoCentavos)} />
            <Indicador rotulo="Repassado" valor={moeda(apuracao.pagoCentavos)} />
            <Indicador
              rotulo={apuracao.saldoCentavos >= 0 ? 'A receber' : 'Repassado a mais'}
              valor={moeda(Math.abs(apuracao.saldoCentavos))}
            />
          </div>
          <Cartao className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Extrato</h2>
            {apuracao.linhas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum evento gerou repasse ainda.</p>
            ) : (
              <div className="overflow-x-auto" tabIndex={0}>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-2 font-medium">Data</th>
                      <th className="py-2 pr-2 font-medium">Evento</th>
                      <th className="py-2 pr-2 text-right font-medium">Base</th>
                      <th className="py-2 text-right font-medium">Repasse</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {apuracao.linhas.map((l, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-2 whitespace-nowrap">{formatarData(l.data)}</td>
                        <td className="py-2 pr-2">{l.descricao}</td>
                        <td className="py-2 pr-2 text-right whitespace-nowrap">
                          {moeda(l.baseCentavos)}
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {moeda(l.repasseCentavos)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Cartao>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Na permuta física você recebe lotes, não repasses em dinheiro. Os lotes ficam reservados
          para você no mapa do empreendimento.
        </p>
      )}
      {e.pagos.length > 0 && (
        <Cartao className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Repasses recebidos</h2>
          <ul className="flex flex-col divide-y text-sm">
            {e.pagos.map((r, i) => (
              <li key={i} className="flex justify-between py-2">
                <span>{formatarData(r.data)}</span>
                <span className="font-medium">{moeda(r.valor)}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </>
  )
}
