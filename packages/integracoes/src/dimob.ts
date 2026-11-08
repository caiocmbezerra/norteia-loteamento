import { cnpjValido, cpfValido, soDigitos } from '@norteia/dominio'

/**
 * Arquivo de importação da DIMOB (IN RFB 1.115/2010) para o PGD da Receita: texto de posições
 * fixas. O leiaute vem do banco (tabela `leiautes_declaracao`, por ano-calendário); este módulo só
 * preenche os campos. Campo desconhecido no leiaute é erro: leiaute novo exige revisão aqui.
 */

export interface CampoLeiaute {
  campo: string
  tipo: 'C' | 'N'
  tamanho: number
  decimais?: number
  fixo?: string
}

export interface LeiauteDimob {
  cabecalho: CampoLeiaute[]
  R01: CampoLeiaute[]
  R03: CampoLeiaute[]
  T9: CampoLeiaute[]
}

export interface OperacaoDimob {
  /** Para apontar a pendência na tela. */
  ref: string
  numeroContrato: number
  documentoComprador: string | null
  comprador: string
  /** AAAA-MM-DD */
  dataContrato: string
  valorOperacaoCentavos: number
  pagoNoAnoCentavos: number
  tipoImovel: 'U' | 'R'
  enderecoImovel: string
  cep: string | null
  municipioRfb: string | null
  uf: string | null
}

export interface DeclaracaoDimob {
  ano: number
  retificadora: boolean
  reciboAnterior: string | null
  declarante: {
    cnpj: string | null
    nome: string
    endereco: string | null
    uf: string | null
    municipioRfb: string | null
    cpfResponsavel: string | null
  }
  operacoes: OperacaoDimob[]
}

export interface PendenciaDimob {
  ref: string | null
  mensagem: string
}

/** Texto em maiúsculas, sem acentos e só com ASCII imprimível (o PGD lê o arquivo sem UTF-8). */
export function textoDimob(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/** AAAA-MM-DD → DDMMAAAA. // VALIDAR COM CONTADOR: conferir na importação pelo PGD (PL-20). */
function dataDimob(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}${m}${a}`
}

function documentoValido(doc: string | null): boolean {
  return !!doc && (cpfValido(doc) || cnpjValido(doc))
}

export function pendenciasDimob(d: DeclaracaoDimob): PendenciaDimob[] {
  const p: PendenciaDimob[] = []
  const dec = d.declarante
  if (!dec.cnpj || !cnpjValido(dec.cnpj))
    p.push({ ref: null, mensagem: 'CNPJ da SPE ausente ou inválido.' })
  if (!dec.endereco) p.push({ ref: null, mensagem: 'Endereço da SPE não informado.' })
  if (!dec.uf) p.push({ ref: null, mensagem: 'UF da SPE não informada.' })
  if (!dec.municipioRfb)
    p.push({ ref: null, mensagem: 'Código do município da SPE (Receita) não informado.' })
  if (!dec.cpfResponsavel || !cpfValido(dec.cpfResponsavel))
    p.push({
      ref: null,
      mensagem: 'CPF do responsável pela SPE perante a Receita ausente ou inválido.',
    })
  if (d.retificadora && !/^\d{1,10}$/.test(d.reciboAnterior ?? ''))
    p.push({ ref: null, mensagem: 'Informe o número do recibo da declaração que será retificada.' })
  for (const o of d.operacoes) {
    const rotulo = `Contrato ${o.numeroContrato} (${o.comprador})`
    if (!documentoValido(o.documentoComprador))
      p.push({ ref: o.ref, mensagem: `${rotulo}: CPF/CNPJ do comprador ausente ou inválido.` })
    if (o.numeroContrato > 999_999)
      p.push({ ref: o.ref, mensagem: `${rotulo}: número do contrato passa de 6 dígitos.` })
    if (!o.cep) p.push({ ref: o.ref, mensagem: `${rotulo}: CEP do empreendimento não informado.` })
    if (!o.municipioRfb)
      p.push({
        ref: o.ref,
        mensagem: `${rotulo}: código do município do empreendimento (Receita) não informado.`,
      })
    if (!o.uf) p.push({ ref: o.ref, mensagem: `${rotulo}: UF do empreendimento não informada.` })
  }
  return p
}

function preencher(c: CampoLeiaute, valor: string | number | null): string {
  if (c.fixo !== undefined) valor = c.fixo
  if (c.tipo === 'N') {
    const s = valor === null ? '' : soDigitos(String(valor))
    if (s.length > c.tamanho) throw new Error(`DIMOB: ${c.campo} excede ${c.tamanho} dígitos.`)
    return s.padStart(c.tamanho, '0')
  }
  return textoDimob(valor === null ? '' : String(valor))
    .slice(0, c.tamanho)
    .padEnd(c.tamanho, ' ')
}

function registro(campos: CampoLeiaute[], valores: Record<string, string | number | null>): string {
  return campos
    .map((c) => {
      if (c.fixo !== undefined) return preencher(c, null)
      if (c.campo.startsWith('reservado')) return ' '.repeat(c.tamanho)
      if (!(c.campo in valores)) throw new Error(`DIMOB: campo do leiaute sem valor: ${c.campo}.`)
      return preencher(c, valores[c.campo]!)
    })
    .join('')
}

/** Gera o arquivo (linhas terminadas em CRLF). Lança erro se houver pendência. */
export function gerarArquivoDimob(leiaute: LeiauteDimob, d: DeclaracaoDimob): string {
  const pend = pendenciasDimob(d)
  if (pend.length > 0)
    throw new Error(`DIMOB com ${pend.length} pendência(s): ${pend[0]!.mensagem}`)
  const dec = d.declarante
  const comuns = { cnpj: soDigitos(dec.cnpj!), ano_apuracao: d.ano }
  const linhas = [
    registro(leiaute.cabecalho, {}),
    registro(leiaute.R01, {
      ...comuns,
      retificadora: d.retificadora ? 1 : 0,
      numero_recibo: d.retificadora ? d.reciboAnterior : null,
      situacao_especial: 0,
      data_situacao_especial: null,
      codigo_situacao_especial: null,
      nome_empresarial: dec.nome,
      cpf_representante: dec.cpfResponsavel,
      endereco: dec.endereco,
      uf: dec.uf,
      cod_municipio: dec.municipioRfb,
    }),
    ...d.operacoes.map((o, i) =>
      registro(leiaute.R03, {
        ...comuns,
        sequencial: i + 1,
        cpf_cnpj_comprador: soDigitos(o.documentoComprador!),
        nome_empresarial_comprador: o.comprador,
        numero_contrato: String(o.numeroContrato),
        data_contrato: dataDimob(o.dataContrato),
        valor_operacao: o.valorOperacaoCentavos,
        valor_pago: o.pagoNoAnoCentavos,
        tipo_imovel: o.tipoImovel,
        endereco_imovel: o.enderecoImovel,
        cep_imovel: o.cep,
        cod_municipio_imovel: o.municipioRfb,
        uf_imovel: o.uf,
      }),
    ),
    registro(leiaute.T9, {}),
  ]
  return linhas.map((l) => `${l}\r\n`).join('')
}
