'use client'

import { formatarMoeda, lerMoeda } from '@norteia/dominio'
import {
  CAMPOS_CARTEIRA,
  type CampoCarteira,
  MODELO_CARTEIRA_CSV,
  type MapeamentoCarteira,
  interpretarCarteira,
  lerCsv,
  sugerirMapeamento,
} from '@norteia/integracoes/importacao'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, Selecao } from '@/components/ui/formulario'
import { importar } from './acoes'

const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))
const CAMPOS = Object.keys(CAMPOS_CARTEIRA) as CampoCarteira[]

export function Importador({
  empreendimentoId,
  mapeamentoSalvo,
}: {
  empreendimentoId: string
  mapeamentoSalvo: Partial<Record<CampoCarteira, string>> | null
}) {
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [planilha, setPlanilha] = useState<{ cabecalho: string[]; linhas: string[][] } | null>(null)
  const [mapa, setMapa] = useState<MapeamentoCarteira>({})
  const [origem, setOrigem] = useState('')
  const [saldo, setSaldo] = useState('')
  const [resultado, setResultado] = useState<{ erro?: string; ok?: string }>({})
  const [enviando, iniciar] = useTransition()

  const interpretado = useMemo(
    () => (planilha ? interpretarCarteira(planilha.linhas, mapa) : null),
    [planilha, mapa],
  )
  let saldoOrigem: number | null = null
  try {
    saldoOrigem = saldo.trim() ? lerMoeda(saldo) : null
  } catch {
    saldoOrigem = null
  }
  const confere =
    interpretado !== null &&
    saldoOrigem !== null &&
    saldoOrigem === interpretado.resumo.saldoAbertoCentavos
  const pronto =
    interpretado !== null &&
    interpretado.erros.length === 0 &&
    interpretado.contratos.length > 0 &&
    confere &&
    origem.trim().length >= 2

  async function abrir(arq: File) {
    const texto = await arq.text()
    const p = lerCsv(texto)
    const sugerido = sugerirMapeamento(p.cabecalho)
    // Mapeamento salvo (por nome de coluna) vale se a coluna existir neste arquivo.
    for (const c of CAMPOS) {
      const nome = mapeamentoSalvo?.[c]
      const i = nome ? p.cabecalho.indexOf(nome) : -1
      if (i >= 0) sugerido[c] = i
    }
    setArquivo(arq.name)
    setPlanilha(p)
    setMapa(sugerido)
    setResultado({})
  }

  function enviar() {
    if (!interpretado || !planilha || saldoOrigem === null) return
    const mapeamento = Object.fromEntries(
      CAMPOS.filter((c) => mapa[c] !== null && mapa[c] !== undefined).map((c) => [
        c,
        planilha.cabecalho[mapa[c]!]!,
      ]),
    )
    iniciar(async () => {
      setResultado(
        await importar(empreendimentoId, {
          origem,
          arquivo,
          saldoOrigemCentavos: saldoOrigem,
          contratos: interpretado.contratos,
          mapeamento,
        }),
      )
    })
  }

  if (resultado.ok)
    return (
      <div className="flex flex-col gap-3">
        <Alerta tipo="sucesso">{resultado.ok}</Alerta>
        <Link
          href={`/empreendimentos/${empreendimentoId}/carteira`}
          className="text-primary underline"
        >
          Ver a carteira
        </Link>
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Uma linha por parcela (0 = entrada), com o contrato repetido em cada linha.{' '}
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(MODELO_CARTEIRA_CSV)}`}
          download="modelo-carteira.csv"
          className="text-primary underline"
        >
          Baixar planilha-modelo
        </a>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="origem" rotulo="Sistema de origem">
          <Entrada
            id="origem"
            value={origem}
            onChange={(e) => setOrigem(e.currentTarget.value)}
            placeholder="Ex.: sistema antigo, planilha"
          />
        </Campo>
        <Campo id="arquivo" rotulo="Planilha (CSV)">
          <Entrada
            id="arquivo"
            type="file"
            accept=".csv,.txt,text/csv"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0]
              if (f) void abrir(f)
            }}
          />
        </Campo>
      </div>

      {planilha && (
        <section aria-label="Colunas" className="flex flex-col gap-2">
          <h2 className="font-semibold">Colunas da planilha</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {CAMPOS.map((c) => (
              <Campo
                key={c}
                id={`col-${c}`}
                rotulo={`${CAMPOS_CARTEIRA[c].rotulo}${CAMPOS_CARTEIRA[c].obrigatorio ? ' *' : ''}`}
              >
                <Selecao
                  id={`col-${c}`}
                  value={mapa[c] ?? ''}
                  onChange={(e) =>
                    setMapa({
                      ...mapa,
                      [c]: e.currentTarget.value === '' ? null : Number(e.currentTarget.value),
                    })
                  }
                >
                  <option value="">— não vem —</option>
                  {planilha.cabecalho.map((nome, i) => (
                    <option key={i} value={i}>
                      {nome || `Coluna ${i + 1}`}
                    </option>
                  ))}
                </Selecao>
              </Campo>
            ))}
          </div>
        </section>
      )}

      {interpretado && (
        <section aria-label="Conferência" className="flex flex-col gap-3">
          <h2 className="font-semibold">Conferência</h2>
          <p className="text-sm">
            {interpretado.resumo.contratos} contrato(s), {interpretado.resumo.parcelas} parcela(s) ·
            contratado {moeda(interpretado.resumo.contratadoCentavos)} · recebido{' '}
            {moeda(interpretado.resumo.recebidoCentavos)} ·{' '}
            <strong>saldo em aberto {moeda(interpretado.resumo.saldoAbertoCentavos)}</strong>
          </p>
          {interpretado.erros.length > 0 && (
            <Alerta>
              {interpretado.erros.length} linha(s) com problema:
              <ul className="mt-1 list-disc pl-5">
                {interpretado.erros.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    Linha {e.linha}: {e.mensagem}
                  </li>
                ))}
              </ul>
            </Alerta>
          )}
          <Campo
            id="saldo"
            rotulo="Saldo em aberto no sistema de origem (R$)"
            ajuda="O total a receber que o sistema antigo mostra; precisa bater com a planilha."
            {...(saldoOrigem !== null && !confere
              ? {
                  erro: `Não confere: a planilha soma ${moeda(interpretado.resumo.saldoAbertoCentavos)}.`,
                }
              : {})}
          >
            <Entrada
              id="saldo"
              inputMode="decimal"
              value={saldo}
              onChange={(e) => setSaldo(e.currentTarget.value)}
            />
          </Campo>
          {confere && <Alerta tipo="sucesso">Saldo conciliado com o sistema de origem.</Alerta>}
          {resultado.erro && <Alerta>{resultado.erro}</Alerta>}
          <Button type="button" onClick={enviar} disabled={!pronto || enviando}>
            {enviando ? 'Importando…' : `Importar ${interpretado.resumo.contratos} contrato(s)`}
          </Button>
        </section>
      )}
    </div>
  )
}
