import type { ClienteBanco } from '@norteia/db'
import { cnpjValido, cpfValido, soDigitos } from '@norteia/dominio'
import {
  type DeclaracaoDimob,
  type LeiauteDimob,
  type PendenciaDimob,
  gerarArquivoDimob,
  pendenciasDimob,
} from '@norteia/integracoes'
import { ErroAplicacao, traduzirErroBanco } from './erros'

type ErroBanco = { code?: string; message: string; hint?: string | null }
function falhar(error: ErroBanco | null) {
  if (error) throw traduzirErroBanco(error)
}

interface DadosDimobBanco {
  ano: number
  pago_com_encargos: boolean
  declarante: {
    cnpj: string | null
    nome: string
    endereco: string | null
    uf: string | null
    municipio_rfb: string | null
    cpf_responsavel: string | null
  }
  leiaute: { versao: string; registros: LeiauteDimob } | null
  empreendimentos: {
    id: string
    nome: string
    endereco: string | null
    cep: string | null
    uf: string | null
    municipio: string
    municipio_rfb: string | null
    tipo_imovel: 'U' | 'R'
  }[]
  operacoes: {
    contrato_id: string
    numero: number
    empreendimento_id: string
    comprador_id: string
    comprador: string
    cpf: string | null
    data: string
    valor_operacao: number
    pago_no_ano: number
    imovel: string
  }[]
}

export interface PainelDimob {
  ano: number
  pagoComEncargos: boolean
  versaoLeiaute: string | null
  declarante: DadosDimobBanco['declarante']
  empreendimentos: DadosDimobBanco['empreendimentos']
  operacoes: (DadosDimobBanco['operacoes'][number] & { empreendimento: string })[]
  pendencias: PendenciaDimob[]
  totalOperacaoCentavos: number
  totalPagoCentavos: number
}

function declaracaoDe(
  d: DadosDimobBanco,
  retificacao: { retificadora: boolean; recibo: string | null },
): DeclaracaoDimob {
  const emps = new Map(d.empreendimentos.map((e) => [e.id, e]))
  return {
    ano: d.ano,
    retificadora: retificacao.retificadora,
    reciboAnterior: retificacao.recibo,
    declarante: {
      cnpj: d.declarante.cnpj,
      nome: d.declarante.nome,
      endereco: d.declarante.endereco,
      uf: d.declarante.uf,
      municipioRfb: d.declarante.municipio_rfb,
      cpfResponsavel: d.declarante.cpf_responsavel,
    },
    operacoes: d.operacoes.map((o) => {
      const e = emps.get(o.empreendimento_id)!
      return {
        ref: o.contrato_id,
        numeroContrato: o.numero,
        documentoComprador: o.cpf,
        comprador: o.comprador,
        dataContrato: o.data,
        valorOperacaoCentavos: o.valor_operacao,
        pagoNoAnoCentavos: o.pago_no_ano,
        tipoImovel: e.tipo_imovel,
        enderecoImovel: e.endereco ? `${o.imovel}, ${e.endereco}` : o.imovel,
        cep: e.cep,
        municipioRfb: e.municipio_rfb,
        uf: e.uf,
      }
    }),
  }
}

async function dados(
  db: ClienteBanco,
  speId: string,
  ano: number,
): Promise<DadosDimobBanco | null> {
  const { data, error } = await db.rpc('dados_dimob', { p_spe: speId, p_ano: ano })
  if (error?.code === '42501') return null
  falhar(error)
  return data as unknown as DadosDimobBanco
}

/** Prévia da DIMOB da SPE no ano: operações, totais e pendências que impedem o arquivo. */
export async function carregarDimob(
  db: ClienteBanco,
  speId: string,
  ano: number,
): Promise<PainelDimob | null> {
  const d = await dados(db, speId, ano)
  if (!d) return null
  const nomes = new Map(d.empreendimentos.map((e) => [e.id, e.nome]))
  const pendencias = pendenciasDimob(declaracaoDe(d, { retificadora: false, recibo: null }))
  if (!d.leiaute)
    pendencias.unshift({ ref: null, mensagem: `Não há leiaute da DIMOB cadastrado para ${ano}.` })
  return {
    ano: d.ano,
    pagoComEncargos: d.pago_com_encargos,
    versaoLeiaute: d.leiaute?.versao ?? null,
    declarante: d.declarante,
    empreendimentos: d.empreendimentos,
    operacoes: d.operacoes.map((o) => ({
      ...o,
      empreendimento: nomes.get(o.empreendimento_id) ?? '',
    })),
    pendencias,
    totalOperacaoCentavos: d.operacoes.reduce((t, o) => t + o.valor_operacao, 0),
    totalPagoCentavos: d.operacoes.reduce((t, o) => t + o.pago_no_ano, 0),
  }
}

/** Arquivo de importação para o PGD Dimob (texto ASCII, linhas CRLF). */
export async function arquivoDimob(
  db: ClienteBanco,
  speId: string,
  ano: number,
  retificacao: { retificadora: boolean; recibo: string | null },
): Promise<{ nome: string; conteudo: string }> {
  const d = await dados(db, speId, ano)
  if (!d) throw new ErroAplicacao('Sem permissão para a DIMOB desta SPE.')
  if (!d.leiaute) throw new ErroAplicacao(`Não há leiaute da DIMOB cadastrado para ${ano}.`)
  const declaracao = declaracaoDe(d, retificacao)
  const pend = pendenciasDimob(declaracao)
  if (pend.length > 0)
    throw new ErroAplicacao(`Resolva as pendências antes de gerar o arquivo: ${pend[0]!.mensagem}`)
  return {
    nome: `DIMOB_${soDigitos(d.declarante.cnpj ?? '')}_${ano}${retificacao.retificadora ? '_RETIFICADORA' : ''}.TXT`,
    conteudo: gerarArquivoDimob(d.leiaute.registros, declaracao),
  }
}

export interface DadosFiscaisSpe {
  cnpj: string | null
  endereco: string | null
  uf: string | null
  municipioRfb: string | null
  cpfResponsavel: string | null
}

export async function salvarDadosFiscaisSpe(db: ClienteBanco, speId: string, d: DadosFiscaisSpe) {
  if (d.cnpj && !cnpjValido(d.cnpj)) throw new ErroAplicacao('CNPJ inválido.', 'validacao', 'cnpj')
  if (d.cpfResponsavel && !cpfValido(d.cpfResponsavel))
    throw new ErroAplicacao('CPF inválido.', 'validacao', 'cpf_responsavel')
  const { error } = await db
    .from('spes')
    .update({
      cnpj: d.cnpj ? soDigitos(d.cnpj) : null,
      endereco: d.endereco,
      uf: d.uf,
      municipio_rfb: d.municipioRfb,
      cpf_responsavel: d.cpfResponsavel ? soDigitos(d.cpfResponsavel) : null,
    })
    .eq('id', speId)
  falhar(error)
}

export interface DadosFiscaisEmpreendimento {
  endereco: string | null
  cep: string | null
  municipioRfb: string | null
  tipoImovel: 'U' | 'R'
}

export async function salvarDadosFiscaisEmpreendimento(
  db: ClienteBanco,
  empreendimentoId: string,
  d: DadosFiscaisEmpreendimento,
) {
  const { error } = await db
    .from('empreendimentos')
    .update({
      endereco: d.endereco,
      cep: d.cep ? soDigitos(d.cep) : null,
      municipio_rfb: d.municipioRfb,
      tipo_imovel: d.tipoImovel,
    })
    .eq('id', empreendimentoId)
  falhar(error)
}

export async function informarCpfComprador(db: ClienteBanco, compradorId: string, cpf: string) {
  if (!cpfValido(cpf)) throw new ErroAplicacao('CPF inválido.', 'validacao', 'cpf')
  const { error } = await db
    .from('compradores')
    .update({ cpf: soDigitos(cpf) })
    .eq('id', compradorId)
  falhar(error)
}
