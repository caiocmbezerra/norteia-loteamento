import { condicoesDePreco } from '@norteia/aplicacao'
import { formatarMoeda } from '@norteia/dominio'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'
import { FormularioVenda } from './formulario-venda'

export const metadata: Metadata = { title: 'Registrar venda' }

function proximoMes(data: string) {
  const [a, m, d] = data.split('-').map(Number) as [number, number, number]
  const ano = m === 12 ? a + 1 : a
  const mes = m === 12 ? 1 : m + 1
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return `${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`
}

export default async function PaginaVender({
  params,
}: {
  params: Promise<{ id: string; loteId: string }>
}) {
  const { id, loteId } = await params
  const ctx = await exigirContexto()
  if (!temPapel(ctx, 'dono', 'comercial_gestor')) redirect(`/empreendimentos/${id}/lotes/${loteId}`)
  const { data: lote } = await ctx.db
    .from('lotes')
    .select(
      'id, numero, status, preco_base_centavos, quadras(codigo), empreendimentos(nome, data_registro)',
    )
    .eq('id', loteId)
    .eq('empreendimento_id', id)
    .maybeSingle()
  if (!lote) notFound()
  const [{ data: corretores }, { data: reserva }] = await Promise.all([
    ctx.db
      .from('corretores')
      .select('id, nome')
      .eq('tenant_id', ctx.tenant.id)
      .eq('ativo', true)
      .order('nome'),
    ctx.db
      .from('reservas')
      .select('corretor_id')
      .eq('lote_id', loteId)
      .eq('situacao', 'ativa')
      .maybeSingle(),
  ])
  const hoje = hojeSaoPaulo()
  const condicoes = await condicoesDePreco(ctx.db, ctx.tenant.id, id, loteId, hoje)
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
        titulo="Registrar venda"
        subtitulo={`${lote.empreendimentos?.nome} · Quadra ${lote.quadras?.codigo} · Lote ${lote.numero}`}
      />
      {!['disponivel', 'reservado'].includes(lote.status) ? (
        <Alerta>Este lote não está disponível para venda.</Alerta>
      ) : (
        <Cartao>
          <FormularioVenda
            empreendimentoId={id}
            loteId={loteId}
            preco={preco}
            hoje={hoje}
            primeiraParcela={proximoMes(hoje)}
            corretores={corretores ?? []}
            corretorReserva={reserva?.corretor_id ?? null}
            semRegistro={!lote.empreendimentos?.data_registro}
            condicoes={condicoes}
            podeAprovarDesconto={temPapel(ctx, 'dono')}
          />
        </Cartao>
      )}
    </div>
  )
}
