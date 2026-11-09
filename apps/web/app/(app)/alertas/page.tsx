import { carregarAlertas } from '@norteia/aplicacao'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'

export const metadata: Metadata = { title: 'Alertas' }

const TITULOS = {
  aporte: 'Aporte próximo',
  custo: 'Custo acima do plano',
  exposicao: 'Exposição acima do plano',
  inadimplencia: 'Inadimplência',
}

export default async function PaginaAlertas() {
  const ctx = await exigirContexto()
  if (!temPapel(ctx, 'dono', 'financeiro', 'contador', 'socio_leitura')) redirect('/painel')
  const alertas = await carregarAlertas(ctx.db, ctx.tenant.id, hojeSaoPaulo())
  return (
    <>
      <TituloPagina
        titulo="Alertas de risco"
        subtitulo="Aporte próximo, custos e exposição acima do plano e inadimplência alta ou crescendo, calculados pelo motor com os limites da sua loteadora (Configurações → Parâmetros)."
      />
      {alertas.length === 0 ? (
        <Alerta tipo="sucesso">Nenhum alerta de risco hoje.</Alerta>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Alertas">
          {alertas.map((a, i) => (
            <li key={i}>
              <Cartao className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      a.alerta.gravidade === 'critico'
                        ? 'rounded bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive'
                        : 'rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
                    }
                  >
                    {a.alerta.gravidade === 'critico' ? 'Crítico' : 'Atenção'}
                  </span>
                  <h2 className="font-semibold">{TITULOS[a.alerta.tipo]}</h2>
                  <Link
                    href={`/empreendimentos/${a.empreendimentoId}${a.alerta.tipo === 'inadimplencia' ? '/carteira' : '/custos'}`}
                    className="text-sm text-primary underline-offset-4 hover:underline sm:ml-auto"
                  >
                    {a.empreendimento}
                  </Link>
                </div>
                <p className="text-sm">{a.texto}</p>
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
