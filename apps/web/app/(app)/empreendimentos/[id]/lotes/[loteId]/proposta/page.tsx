import { condicoesDePreco } from '@norteia/aplicacao'
import { formatarMoeda } from '@norteia/dominio'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { hojeSaoPaulo, somarDias } from '@/lib/datas'
import { FormularioProposta } from './formulario-proposta'

export const metadata: Metadata = { title: 'Fazer proposta' }

export default async function PaginaProposta({
  params,
}: {
  params: Promise<{ id: string; loteId: string }>
}) {
  const { id, loteId } = await params
  const ctx = await exigirContexto()
  const gestor = temPapel(ctx, 'dono', 'comercial_gestor')
  if (!gestor && !temPapel(ctx, 'corretor')) redirect(`/empreendimentos/${id}/lotes/${loteId}`)
  const { data: lote } = await ctx.db
    .from('lotes')
    .select('id, numero, status, quadras(codigo), empreendimentos(nome)')
    .eq('id', loteId)
    .eq('empreendimento_id', id)
    .maybeSingle()
  if (!lote) notFound()
  const hoje = hojeSaoPaulo()
  const [condicoes, { data: corretores }, { data: reserva }] = await Promise.all([
    condicoesDePreco(ctx.db, ctx.tenant.id, id, loteId, hoje),
    gestor
      ? ctx.db
          .from('corretores')
          .select('id, nome')
          .eq('tenant_id', ctx.tenant.id)
          .eq('ativo', true)
          .order('nome')
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    ctx.db
      .from('reservas')
      .select('corretor_id')
      .eq('lote_id', loteId)
      .eq('situacao', 'ativa')
      .maybeSingle(),
  ])
  const tabela = condicoes.precoTabelaCentavos
  const preco = tabela
    ? formatarMoeda(arredondarCentavos(String(tabela))).replace(/^R\$\s/, '')
    : ''

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <Link
        href={`/empreendimentos/${id}/lotes/${loteId}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Quadra {lote.quadras?.codigo} · Lote {lote.numero}
      </Link>
      <TituloPagina
        titulo="Fazer proposta"
        subtitulo={`${lote.empreendimentos?.nome} · Quadra ${lote.quadras?.codigo} · Lote ${lote.numero}${tabela ? ` · tabela ${formatarMoeda(arredondarCentavos(String(tabela)))}` : ''}`}
      />
      {!['disponivel', 'reservado'].includes(lote.status) ? (
        <Alerta>Este lote não está disponível.</Alerta>
      ) : (
        <Cartao>
          <FormularioProposta
            empreendimentoId={id}
            loteId={loteId}
            preco={preco}
            primeiraParcela={somarDias(hoje, 30)}
            validade={somarDias(hoje, 7)}
            corretores={corretores ?? []}
            corretorPadrao={reserva?.corretor_id ?? null}
          />
        </Cartao>
      )}
    </div>
  )
}
