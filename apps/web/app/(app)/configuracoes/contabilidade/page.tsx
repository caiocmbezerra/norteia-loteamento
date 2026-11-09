import { EVENTOS_CONTABEIS, type EventoContabil, carregarConfigContabil } from '@norteia/aplicacao'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { FormularioContas, FormularioFormato, FormularioRegra } from './formularios'

export const metadata: Metadata = { title: 'Contabilidade' }

export default async function PaginaContabilidade() {
  const ctx = await exigirContexto()
  if (!temPapel(ctx, 'dono', 'contador')) redirect('/configuracoes')
  const c = await carregarConfigContabil(ctx.db, ctx.tenant.id)
  const regras = new Map(c.regras.map((r) => [r.evento, r]))

  return (
    <>
      <Link href="/configuracoes" className="text-sm text-muted-foreground hover:underline">
        ← Configurações
      </Link>
      <TituloPagina
        titulo="Contabilidade"
        subtitulo="Cada fato do sistema (venda, recebimento, pagamento, sócio) vira um lançamento com as contas do seu plano. O contador define as contas; o arquivo sai no formato que o sistema dele importa."
      />

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Plano de contas ({c.contas.length})</h2>
        {c.contas.length > 0 && (
          <ul className="grid gap-x-6 text-sm sm:grid-cols-2">
            {c.contas.map((x) => (
              <li key={x.codigo}>
                <span className="font-mono">{x.codigo}</span> · {x.nome}
              </li>
            ))}
          </ul>
        )}
        <FormularioContas />
      </Cartao>

      <Cartao className="flex flex-col gap-4">
        <h2 className="font-semibold">Regras de lançamento</h2>
        {c.contas.length === 0 ? (
          <Alerta tipo="aviso">Cadastre o plano de contas para definir as regras.</Alerta>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Histórico aceita {'{descricao}'}, {'{documento}'}, {'{empreendimento}'} e {'{evento}'}
              . Evento sem regra não é exportado (aparece como pendência na exportação).
            </p>
            {(Object.entries(EVENTOS_CONTABEIS) as [EventoContabil, string][]).map(
              ([evento, nome]) => (
                <section key={evento} className="border-t pt-3">
                  <FormularioRegra
                    evento={evento}
                    nome={nome}
                    contas={c.contas}
                    atual={regras.get(evento) ?? null}
                  />
                </section>
              ),
            )}
          </>
        )}
      </Cartao>

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Formato do arquivo</h2>
        <FormularioFormato atual={c.formato} />
      </Cartao>
    </>
  )
}
