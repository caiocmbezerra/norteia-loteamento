import { carregarMapeamento, listarImportacoes } from '@norteia/aplicacao'
import { formatarMoeda } from '@norteia/dominio'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { Importador } from './importador'

export const metadata: Metadata = { title: 'Importar carteira' }

const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))

export default async function PaginaImportar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await exigirContexto()
  if (!temPapel(ctx, 'dono', 'comercial_gestor')) redirect(`/empreendimentos/${id}/carteira`)
  const [mapeamento, anteriores] = await Promise.all([
    carregarMapeamento(ctx.db, ctx.tenant.id),
    listarImportacoes(ctx.db, id),
  ])
  return (
    <>
      <Link
        href={`/empreendimentos/${id}/carteira`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Carteira
      </Link>
      <TituloPagina
        titulo="Importar carteira"
        subtitulo="Traga contratos, parcelas e pagamentos do sistema antigo. A importação só é gravada com o saldo conciliado, e é tudo ou nada."
      />
      <Cartao>
        <Importador empreendimentoId={id} mapeamentoSalvo={mapeamento} />
      </Cartao>
      {anteriores.length > 0 && (
        <Cartao className="flex flex-col gap-2">
          <h2 className="font-semibold">Importações anteriores</h2>
          <ul className="flex flex-col divide-y text-sm">
            {anteriores.map((i) => (
              <li key={i.id} className="py-2">
                {new Date(i.criado_em).toLocaleDateString('pt-BR')} · {i.origem}
                {i.arquivo ? ` (${i.arquivo})` : ''} · {i.contratos} contrato(s), {i.parcelas}{' '}
                parcela(s) · saldo {moeda(i.saldo_aberto_centavos)}
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </>
  )
}
