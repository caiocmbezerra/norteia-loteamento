import { formatarData, formatarMoeda } from '@norteia/dominio'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SeloStatus } from '@/components/status-lote'
import { Button } from '@/components/ui/button'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { FormularioGerarContrato } from '../../carteira/formularios'
import { FormularioLote } from './formulario-lote'
import { FormularioCancelarReserva, FormularioReserva } from './formularios-comerciais'

export const metadata: Metadata = { title: 'Lote' }

const quando = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})
const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))

export default async function PaginaLote({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; loteId: string }>
  searchParams: Promise<{ vendido?: string; semContrato?: string }>
}) {
  const [{ id, loteId }, { vendido, semContrato }] = await Promise.all([params, searchParams])
  const ctx = await exigirContexto()
  const { data: lote } = await ctx.db
    .from('lotes')
    .select(
      'id, numero, status, area_m2, testada_m, preco_base_centavos, observacao, tenant_id, quadras(codigo), empreendimentos(nome, data_registro), tabela_preco_itens(tabela_id)',
    )
    .eq('id', loteId)
    .eq('empreendimento_id', id)
    .maybeSingle()
  if (!lote) notFound()

  const gestor = temPapel(ctx, 'dono', 'comercial_gestor')
  const podeReservar = gestor || temPapel(ctx, 'corretor')
  const verCarteira = temPapel(
    ctx,
    'dono',
    'financeiro',
    'contador',
    'comercial_gestor',
    'engenharia',
    'socio_leitura',
  )
  const podeGerarContrato = temPapel(ctx, 'dono', 'financeiro', 'comercial_gestor')
  const podeEditarCadastro = temPapel(ctx, 'dono', 'engenharia', 'comercial_gestor')

  const [{ data: reserva }, { data: venda }, { data: corretores }, { data: prazo }] =
    await Promise.all([
      ctx.db
        .from('reservas')
        .select('id, cliente_nome, expira_em, corretores(nome)')
        .eq('lote_id', loteId)
        .eq('situacao', 'ativa')
        .gt('expira_em', new Date().toISOString())
        .maybeSingle(),
      ctx.db
        .from('vendas')
        .select(
          'id, data_venda, preco_centavos, entrada_centavos, parcelas, compradores(nome), corretores(nome), contratos(id)',
        )
        .eq('lote_id', loteId)
        .eq('situacao', 'ativa')
        .maybeSingle(),
      gestor
        ? ctx.db
            .from('corretores')
            .select('id, nome')
            .eq('tenant_id', ctx.tenant.id)
            .eq('ativo', true)
            .order('nome')
        : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
      ctx.db.rpc('parametro_vigente', {
        p_chave: 'comercial.prazo_reserva_horas',
        p_data: new Date().toISOString().slice(0, 10),
        p_tenant: ctx.tenant.id,
        p_escopo: 'empreendimento',
        p_escopo_id: id,
      }),
    ])
  const semRegistro = !lote.empreendimentos?.data_registro

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <Link
        href={`/empreendimentos/${id}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {lote.empreendimentos?.nome}
      </Link>
      <TituloPagina
        titulo={`Quadra ${lote.quadras?.codigo} · Lote ${lote.numero}`}
        subtitulo={`${String(lote.area_m2).replace('.', ',')} m²${lote.preco_base_centavos ? ` · tabela ${moeda(lote.preco_base_centavos)}` : ''}`}
        acoes={<SeloStatus status={lote.status} />}
      />
      {vendido && (
        <Alerta tipo="sucesso">
          Venda registrada
          {semContrato
            ? '. O contrato não foi gerado; gere-o abaixo.'
            : ' com o contrato e as parcelas.'}{' '}
          O fluxo do empreendimento já considera esta venda.
        </Alerta>
      )}

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Comercial</h2>
        {lote.status === 'disponivel' && (
          <>
            {podeReservar && (
              <FormularioReserva
                empreendimentoId={id}
                loteId={loteId}
                corretores={corretores ?? []}
                prazoPadrao={Number(prazo ?? 48)}
              />
            )}
            {gestor && (
              <Button asChild variant="outline">
                <Link href={`/empreendimentos/${id}/lotes/${loteId}/vender`}>
                  Registrar venda direta
                </Link>
              </Button>
            )}
          </>
        )}
        {lote.status === 'reservado' && (
          <>
            {reserva ? (
              <p className="text-sm">
                Reservado para <span className="font-medium">{reserva.cliente_nome}</span>
                {reserva.corretores?.nome ? ` por ${reserva.corretores.nome}` : ''} até{' '}
                {quando.format(new Date(reserva.expira_em))}.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Lote reservado por outro corretor.</p>
            )}
            {gestor && (
              <Button asChild>
                <Link href={`/empreendimentos/${id}/lotes/${loteId}/vender`}>Registrar venda</Link>
              </Button>
            )}
            {reserva && (
              <FormularioCancelarReserva
                empreendimentoId={id}
                loteId={loteId}
                reservaId={reserva.id}
              />
            )}
          </>
        )}
        {lote.status === 'vendido' &&
          (venda ? (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Comprador</dt>
              <dd>{venda.compradores?.nome ?? '—'}</dd>
              <dt className="text-muted-foreground">Data da venda</dt>
              <dd>{formatarData(venda.data_venda)}</dd>
              <dt className="text-muted-foreground">Preço</dt>
              <dd>{moeda(venda.preco_centavos)}</dd>
              <dt className="text-muted-foreground">Condição</dt>
              <dd>
                {venda.parcelas === 0
                  ? 'À vista'
                  : `${moeda(venda.entrada_centavos)} + ${venda.parcelas} parcelas`}
              </dd>
              <dt className="text-muted-foreground">Corretor</dt>
              <dd>{venda.corretores?.nome ?? '—'}</dd>
              {verCarteira && (
                <>
                  <dt className="text-muted-foreground">Contrato</dt>
                  <dd>
                    {venda.contratos[0] ? (
                      <Link
                        href={`/empreendimentos/${id}/carteira/${venda.contratos[0].id}`}
                        className="text-primary underline underline-offset-4"
                      >
                        Ver parcelas
                      </Link>
                    ) : podeGerarContrato ? (
                      <FormularioGerarContrato empreendimentoId={id} vendaId={venda.id} />
                    ) : (
                      'Não gerado'
                    )}
                  </dd>
                </>
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Lote vendido.</p>
          ))}
        {(lote.status === 'bloqueado' || lote.status === 'permuta') && (
          <p className="text-sm text-muted-foreground">
            {lote.status === 'permuta'
              ? 'Lote do permutante: não entra no estoque de vendas.'
              : 'Lote bloqueado para venda.'}
          </p>
        )}
        {semRegistro && ['disponivel', 'reservado'].includes(lote.status) && (
          <p className="text-xs text-muted-foreground">
            Loteamento sem registro: reservas são permitidas, a venda fica bloqueada (Lei 6.766).
          </p>
        )}
      </Cartao>

      {podeEditarCadastro && (
        <Cartao>
          <details>
            <summary className="cursor-pointer font-semibold">Cadastro do lote</summary>
            <div className="mt-4">
              <FormularioLote
                empreendimentoId={id}
                lote={lote}
                precoPelaTabela={lote.tabela_preco_itens.length > 0}
              />
            </div>
          </details>
        </Cartao>
      )}
    </div>
  )
}
