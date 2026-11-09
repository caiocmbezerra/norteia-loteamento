import type { ClienteBanco } from '@norteia/db'
import { carregarParametros } from './parametros'
import { traduzirErroBanco } from './erros'

/** Um passo da implantação de um cliente: feito, pendente ou opcional, com onde resolver. */
export interface PassoImplantacao {
  id: string
  titulo: string
  detalhe: string
  feito: boolean
  opcional: boolean
  link: string
}

/** Situação da implantação da loteadora, do cadastro à contabilidade (para o piloto). */
export async function carregarImplantacao(
  db: ClienteBanco,
  tenantId: string,
  hoje: string,
): Promise<PassoImplantacao[]> {
  const [spes, emps, planos, asaas, modelos, contas, regras, membros, vendas, params] =
    await Promise.all([
      db
        .from('spes')
        .select('id, cnpj, endereco, municipio_rfb, cpf_responsavel')
        .eq('tenant_id', tenantId),
      db
        .from('empreendimentos')
        .select('id, cep, municipio_rfb, data_registro')
        .eq('tenant_id', tenantId),
      db.from('plano_versoes').select('empreendimento_id').eq('tenant_id', tenantId),
      db.from('integracoes_asaas').select('ativo').eq('tenant_id', tenantId).maybeSingle(),
      db.from('modelos_documento').select('tipo').eq('tenant_id', tenantId).eq('ativo', true),
      db
        .from('plano_contas')
        .select('codigo', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
      db
        .from('regras_contabeis')
        .select('evento', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
      db
        .from('membros')
        .select('usuario_id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('ativo', true),
      db.from('vendas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      carregarParametros(db, tenantId, hoje),
    ])
  for (const r of [spes, emps, planos, modelos, contas, regras, membros, vendas])
    if (r.error) throw traduzirErroBanco(r.error)
  const listaSpes = spes.data ?? []
  const listaEmps = emps.data ?? []
  const comPlano = new Set((planos.data ?? []).map((p) => p.empreendimento_id))
  const sugestoes = params.filter((p) => !p.vigente && p.pendencia)
  const qtd = (n: number | null) => n ?? 0

  return [
    {
      id: 'cnpj',
      titulo: 'CNPJ das SPEs',
      detalhe: `${listaSpes.filter((s) => s.cnpj).length} de ${listaSpes.length} SPE(s) com CNPJ.`,
      feito: listaSpes.length > 0 && listaSpes.every((s) => s.cnpj),
      opcional: false,
      link: '/configuracoes/empresas',
    },
    {
      id: 'registro',
      titulo: 'Registro dos loteamentos',
      detalhe: `${listaEmps.filter((e) => e.data_registro).length} de ${listaEmps.length} empreendimento(s) com data de registro (exigida para vender).`,
      feito: listaEmps.length > 0 && listaEmps.every((e) => e.data_registro),
      opcional: false,
      link: '/painel',
    },
    {
      id: 'plano',
      titulo: 'Plano aprovado',
      detalhe: `${listaEmps.filter((e) => comPlano.has(e.id)).length} de ${listaEmps.length} empreendimento(s) com viabilidade aprovada (base do plano × atual e dos alertas).`,
      feito: listaEmps.length > 0 && listaEmps.every((e) => comPlano.has(e.id)),
      opcional: false,
      link: '/painel',
    },
    {
      id: 'parametros',
      titulo: 'Regras jurídicas e fiscais confirmadas',
      detalhe: sugestoes.length
        ? `${sugestoes.length} parâmetro(s) ainda na sugestão da plataforma: confirme com o advogado e o contador.`
        : 'Todos os parâmetros com pendência foram definidos pela loteadora.',
      feito: sugestoes.length === 0,
      opcional: false,
      link: '/configuracoes/parametros',
    },
    {
      id: 'modelos',
      titulo: 'Modelos de documento próprios',
      detalhe: `${modelos.data?.length ?? 0} modelo(s) próprio(s); os demais usam o texto provisório da plataforma.`,
      feito: (modelos.data?.length ?? 0) > 0,
      opcional: false,
      link: '/configuracoes/modelos',
    },
    {
      id: 'asaas',
      titulo: 'Boleto e Pix (Asaas)',
      detalhe: asaas.data?.ativo
        ? 'Conectado.'
        : 'Não conectado: cobrança e segunda via no portal ficam manuais.',
      feito: Boolean(asaas.data?.ativo),
      opcional: true,
      link: '/configuracoes/integracoes',
    },
    {
      id: 'equipe',
      titulo: 'Equipe convidada',
      detalhe: `${qtd(membros.count)} membro(s) ativo(s).`,
      feito: qtd(membros.count) > 1,
      opcional: true,
      link: '/configuracoes/membros',
    },
    {
      id: 'carteira',
      titulo: 'Vendas ou carteira importada',
      detalhe: `${qtd(vendas.count)} venda(s) no sistema. Carteira antiga entra por Carteira → Importar carteira.`,
      feito: qtd(vendas.count) > 0,
      opcional: false,
      link: '/painel',
    },
    {
      id: 'contabil',
      titulo: 'Contabilidade configurada',
      detalhe: `${qtd(contas.count)} conta(s) no plano e ${qtd(regras.count)} de 13 regras de lançamento.`,
      feito: qtd(contas.count) > 0 && qtd(regras.count) >= 13,
      opcional: true,
      link: '/configuracoes/contabilidade',
    },
    {
      id: 'dimob',
      titulo: 'Dados para a DIMOB',
      detalhe:
        'Endereço, município (código Receita) e CPF do responsável nas SPEs; CEP e município nos empreendimentos.',
      feito:
        listaSpes.length > 0 &&
        listaSpes.every((s) => s.cnpj && s.endereco && s.municipio_rfb && s.cpf_responsavel) &&
        listaEmps.every((e) => e.cep && e.municipio_rfb),
      opcional: true,
      link: '/configuracoes/empresas',
    },
  ]
}
