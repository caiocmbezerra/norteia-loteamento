import { cpfValido, cnpjValido, lerData, lerMoeda, soDigitos } from '@norteia/dominio'

/**
 * Importação de carteira de outro sistema: uma planilha (CSV) com uma linha por parcela. As
 * colunas da origem são mapeadas para os campos abaixo; linhas do mesmo contrato viram um
 * contrato. Puro (roda no navegador): o banco refaz as checagens ao gravar.
 */
export const CAMPOS_CARTEIRA = {
  contrato: {
    rotulo: 'Contrato (código na origem)',
    obrigatorio: true,
    sinonimos: [
      'contrato',
      'codigo contrato',
      'cod contrato',
      'num contrato',
      'n contrato',
      'id contrato',
    ],
  },
  quadra: { rotulo: 'Quadra', obrigatorio: true, sinonimos: ['quadra', 'qd'] },
  lote: { rotulo: 'Lote', obrigatorio: true, sinonimos: ['lote', 'lt', 'unidade'] },
  comprador_nome: {
    rotulo: 'Nome do comprador',
    obrigatorio: true,
    sinonimos: ['comprador', 'nome', 'cliente', 'nome comprador', 'nome cliente'],
  },
  comprador_cpf: {
    rotulo: 'CPF/CNPJ do comprador',
    obrigatorio: false,
    sinonimos: ['cpf', 'cnpj', 'cpf cnpj', 'documento', 'cpf comprador'],
  },
  comprador_email: {
    rotulo: 'E-mail',
    obrigatorio: false,
    sinonimos: ['email', 'e-mail', 'e mail'],
  },
  comprador_telefone: {
    rotulo: 'Telefone',
    obrigatorio: false,
    sinonimos: ['telefone', 'celular', 'fone'],
  },
  data_venda: {
    rotulo: 'Data da venda',
    obrigatorio: true,
    sinonimos: ['data venda', 'data contrato', 'data da venda', 'assinatura'],
  },
  preco: {
    rotulo: 'Preço (valor do contrato)',
    obrigatorio: true,
    sinonimos: ['preco', 'valor contrato', 'valor venda', 'valor total', 'preco venda'],
  },
  indice: {
    rotulo: 'Índice de reajuste',
    obrigatorio: false,
    sinonimos: ['indice', 'reajuste', 'indexador'],
  },
  parcela: {
    rotulo: 'Nº da parcela (0 = entrada)',
    obrigatorio: true,
    sinonimos: ['parcela', 'num parcela', 'n parcela', 'numero parcela', 'prestacao'],
  },
  vencimento: {
    rotulo: 'Vencimento',
    obrigatorio: true,
    sinonimos: ['vencimento', 'data vencimento', 'dt vencimento'],
  },
  valor: {
    rotulo: 'Valor da parcela',
    obrigatorio: true,
    sinonimos: ['valor', 'valor parcela', 'vlr parcela', 'valor prestacao'],
  },
  valor_pago: {
    rotulo: 'Valor pago',
    obrigatorio: false,
    sinonimos: ['valor pago', 'pago', 'vlr pago', 'recebido', 'valor recebido'],
  },
  data_pagamento: {
    rotulo: 'Data do pagamento',
    obrigatorio: false,
    sinonimos: ['data pagamento', 'pagamento', 'dt pagamento', 'data recebimento'],
  },
} as const
export type CampoCarteira = keyof typeof CAMPOS_CARTEIRA
/** Campo → índice da coluna na planilha (ou nulo, se não vem). */
export type MapeamentoCarteira = Partial<Record<CampoCarteira, number | null>>

export interface ParcelaImportada {
  numero: number
  vencimento: string
  valor: number
  pago: number
  data_pagamento: string | null
}

export interface ContratoImportado {
  ref: string
  quadra: string
  lote: string
  comprador: { nome: string; cpf: string | null; email: string | null; telefone: string | null }
  data_venda: string
  preco: number
  indice: string | null
  parcelas: ParcelaImportada[]
}

export interface ResultadoImportacao {
  contratos: ContratoImportado[]
  erros: { linha: number; mensagem: string }[]
  resumo: {
    contratos: number
    parcelas: number
    contratadoCentavos: number
    recebidoCentavos: number
    saldoAbertoCentavos: number
  }
}

const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Lê CSV (separador ; , ou tabulação, detectado pelo cabeçalho), com aspas e BOM. */
export function lerCsv(texto: string): { cabecalho: string[]; linhas: string[][] } {
  const limpo = texto.replace(/^\uFEFF/, '')
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? ''
  const sep = [';', '\t', ','].reduce((melhor, s) =>
    primeira.split(s).length > primeira.split(melhor).length ? s : melhor,
  )
  const linhas: string[][] = []
  let campo = ''
  let linha: string[] = []
  let aspas = false
  for (let i = 0; i < limpo.length; i++) {
    const ch = limpo[i]!
    if (aspas) {
      if (ch === '"' && limpo[i + 1] === '"') {
        campo += '"'
        i++
      } else if (ch === '"') aspas = false
      else campo += ch
    } else if (ch === '"') aspas = true
    else if (ch === sep) {
      linha.push(campo)
      campo = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && limpo[i + 1] === '\n') i++
      linha.push(campo)
      linhas.push(linha)
      linha = []
      campo = ''
    } else campo += ch
  }
  if (campo !== '' || linha.length > 0) {
    linha.push(campo)
    linhas.push(linha)
  }
  const uteis = linhas.filter((l) => l.some((c) => c.trim() !== ''))
  return { cabecalho: (uteis[0] ?? []).map((c) => c.trim()), linhas: uteis.slice(1) }
}

/** Sugere o mapeamento pelo nome das colunas (sem acento, maiúsculas ou pontuação). */
export function sugerirMapeamento(cabecalho: readonly string[]): MapeamentoCarteira {
  const nomes = cabecalho.map(normalizar)
  const usados = new Set<number>()
  const m: MapeamentoCarteira = {}
  for (const [campo, def] of Object.entries(CAMPOS_CARTEIRA) as [
    CampoCarteira,
    (typeof CAMPOS_CARTEIRA)[CampoCarteira],
  ][]) {
    const alvos = [normalizar(campo.replace(/_/g, ' ')), ...def.sinonimos.map(normalizar)]
    const i = nomes.findIndex((n, k) => !usados.has(k) && alvos.includes(n))
    m[campo] = i >= 0 ? i : null
    if (i >= 0) usados.add(i)
  }
  return m
}

function dinheiro(texto: string): number {
  const t = texto.replace(/R\$/u, '').replace(/\s/g, '')
  if (/^-?\d+\.\d{1,2}$/.test(t)) return Math.round(Number(t) * 100)
  return lerMoeda(t)
}

function data(texto: string): string {
  const t = texto.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  return lerData(t)
}

const INDICES = ['IPCA', 'IGP-M', 'INCC']
function indice(texto: string): string | null {
  if (!texto) return null
  const t = texto
    .toUpperCase()
    .replace(/\s/g, '')
    .replace(/^IGPM$/, 'IGP-M')
  if (!INDICES.includes(t))
    throw new Error(`Índice "${texto}" desconhecido (use IPCA, IGP-M ou INCC).`)
  return t
}

/** Agrupa as linhas por contrato, converte formatos brasileiros e aponta os erros por linha. */
export function interpretarCarteira(
  linhas: readonly string[][],
  mapa: MapeamentoCarteira,
): ResultadoImportacao {
  const erros: ResultadoImportacao['erros'] = []
  const faltando = (Object.keys(CAMPOS_CARTEIRA) as CampoCarteira[]).filter(
    (c) => CAMPOS_CARTEIRA[c].obrigatorio && (mapa[c] === undefined || mapa[c] === null),
  )
  if (faltando.length > 0)
    return {
      contratos: [],
      erros: [
        {
          linha: 1,
          mensagem: `Associe as colunas: ${faltando.map((c) => CAMPOS_CARTEIRA[c].rotulo).join(', ')}.`,
        },
      ],
      resumo: {
        contratos: 0,
        parcelas: 0,
        contratadoCentavos: 0,
        recebidoCentavos: 0,
        saldoAbertoCentavos: 0,
      },
    }
  const porRef = new Map<string, ContratoImportado>()
  const lotes = new Map<string, string>()
  linhas.forEach((l, i) => {
    const n = i + 2 // linha 1 é o cabeçalho
    const v = (c: CampoCarteira) => {
      const k = mapa[c]
      return k === undefined || k === null ? '' : (l[k] ?? '').trim()
    }
    const falta = (Object.keys(CAMPOS_CARTEIRA) as CampoCarteira[]).find(
      (c) => CAMPOS_CARTEIRA[c].obrigatorio && v(c) === '',
    )
    if (falta) {
      erros.push({ linha: n, mensagem: `${CAMPOS_CARTEIRA[falta].rotulo} em branco.` })
      return
    }
    try {
      const doc = soDigitos(v('comprador_cpf'))
      if (doc && !cpfValido(doc) && !cnpjValido(doc)) throw new Error('CPF/CNPJ inválido.')
      const numero = Number(v('parcela'))
      if (!Number.isInteger(numero) || numero < 0) throw new Error('Número da parcela inválido.')
      const valor = dinheiro(v('valor'))
      if (valor <= 0) throw new Error('Valor da parcela precisa ser positivo.')
      const pago = v('valor_pago') ? dinheiro(v('valor_pago')) : 0
      if (pago < 0) throw new Error('Valor pago negativo.')
      if (pago > 0 && !v('data_pagamento')) throw new Error('Informe a data do pagamento.')
      const parcela: ParcelaImportada = {
        numero,
        vencimento: data(v('vencimento')),
        valor,
        pago,
        data_pagamento: pago > 0 ? data(v('data_pagamento')) : null,
      }
      const ref = v('contrato')
      const chaveLote = `${v('quadra')}|${v('lote')}`
      const outroLote = lotes.get(chaveLote)
      if (outroLote && outroLote !== ref)
        throw new Error(
          `Quadra ${v('quadra')} lote ${v('lote')} aparece em mais de um contrato (${outroLote} e ${ref}).`,
        )
      lotes.set(chaveLote, ref)
      let c = porRef.get(ref)
      if (!c) {
        c = {
          ref,
          quadra: v('quadra'),
          lote: v('lote'),
          comprador: {
            nome: v('comprador_nome'),
            cpf: doc || null,
            email: v('comprador_email') || null,
            telefone: v('comprador_telefone') || null,
          },
          data_venda: data(v('data_venda')),
          preco: dinheiro(v('preco')),
          indice: indice(v('indice')),
          parcelas: [],
        }
        if (c.preco <= 0) throw new Error('Preço precisa ser positivo.')
        porRef.set(ref, c)
      } else if (
        c.quadra !== v('quadra') ||
        c.lote !== v('lote') ||
        c.comprador.nome !== v('comprador_nome')
      ) {
        throw new Error(`Contrato ${ref} com lote ou comprador diferente das linhas anteriores.`)
      }
      if (c.parcelas.some((p) => p.numero === numero))
        throw new Error(`Parcela ${numero} repetida no contrato ${ref}.`)
      c.parcelas.push(parcela)
    } catch (e) {
      erros.push({ linha: n, mensagem: e instanceof Error ? e.message : String(e) })
    }
  })
  const contratos = [...porRef.values()].map((c) => ({
    ...c,
    parcelas: c.parcelas.sort((a, b) => a.numero - b.numero),
  }))
  const parcelas = contratos.flatMap((c) => c.parcelas)
  return {
    contratos,
    erros,
    resumo: {
      contratos: contratos.length,
      parcelas: parcelas.length,
      contratadoCentavos: contratos.reduce((t, c) => t + c.preco, 0),
      recebidoCentavos: parcelas.reduce((t, p) => t + p.pago, 0),
      saldoAbertoCentavos: parcelas.reduce(
        (t, p) => t + Math.max(p.valor - Math.min(p.pago, p.valor), 0),
        0,
      ),
    },
  }
}

/** Planilha-modelo (CSV com ;) para quem exporta a carteira do sistema antigo. */
export const MODELO_CARTEIRA_CSV = [
  'contrato;quadra;lote;comprador;cpf;email;telefone;data_venda;preco;indice;parcela;vencimento;valor;valor_pago;data_pagamento',
  '1001;A;1;Maria da Silva;529.982.247-25;maria@exemplo.com.br;(62) 99999-0000;10/01/2024;90.000,00;IPCA;0;10/01/2024;9.000,00;9.000,00;10/01/2024',
  '1001;A;1;Maria da Silva;529.982.247-25;maria@exemplo.com.br;(62) 99999-0000;10/01/2024;90.000,00;IPCA;1;10/02/2024;1.350,00;1.350,00;09/02/2024',
  '1001;A;1;Maria da Silva;529.982.247-25;maria@exemplo.com.br;(62) 99999-0000;10/01/2024;90.000,00;IPCA;2;10/03/2024;1.350,00;;',
].join('\r\n')
