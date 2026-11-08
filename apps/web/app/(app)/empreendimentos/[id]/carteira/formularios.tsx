'use client'

import { formatarMoeda, lerMoeda } from '@norteia/dominio'
import { Decimal, arredondarCentavos, calcularEncargos, centavos } from '@norteia/motor-financeiro'
import { useActionState, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { estornar, gerar, reajustar, receber } from './acoes'

const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))
const emTexto = (c: number) => moeda(c).replace(/^R\$\s/, '')

function lerCentavos(texto: string): number | null {
  try {
    return texto.trim() === '' ? 0 : Number(lerMoeda(texto))
  } catch {
    return null
  }
}

/** Identificador único por formulário, com o nome do campo preservado. */
function aria(prefixo: string, nome: string, erro?: string) {
  return { ...ariaCampo(`${prefixo}-${nome}`, erro), name: nome }
}

export function FormularioGerarContrato({
  empreendimentoId,
  vendaId,
}: {
  empreendimentoId: string
  vendaId: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    gerar.bind(null, empreendimentoId, vendaId),
    {},
  )
  return (
    <form action={acao} className="flex flex-wrap items-end gap-2" noValidate>
      <Selecao name="indice" aria-label="Índice de reajuste" defaultValue="IPCA" className="h-9">
        <option value="IPCA">Reajuste IPCA</option>
        <option value="IGP-M">Reajuste IGP-M</option>
        <option value="INCC">Reajuste INCC</option>
        <option value="">Sem reajuste</option>
      </Selecao>
      <Button type="submit" size="sm" disabled={enviando}>
        {enviando ? 'Gerando…' : 'Gerar contrato'}
      </Button>
      {estado.erro && (
        <p role="alert" className="w-full text-xs text-destructive">
          {estado.erro}
        </p>
      )}
    </form>
  )
}

/** Recebimento de parcela com os encargos calculados pelo mesmo motor do servidor (RN-K04). */
export function FormularioRecebimento({
  empreendimentoId,
  contratoId,
  parcela,
  regra,
  hoje,
}: {
  empreendimentoId: string
  contratoId: string
  parcela: { id: string; numero: number; vencimento: string; saldoCentavos: number }
  regra: { multa: string; jurosMoraMensal: string }
  hoje: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    receber.bind(null, empreendimentoId, contratoId, parcela.id),
    {},
  )
  const er = estado.erros ?? {}
  const prefixo = `p${parcela.numero}`
  const [campos, setCampos] = useState({
    data: estado.valores?.data ?? hoje,
    valor: estado.valores?.valor ?? emTexto(parcela.saldoCentavos),
    desconto: estado.valores?.desconto ?? '',
  })
  const previa = useMemo(() => {
    const principal = lerCentavos(campos.valor)
    const desconto = lerCentavos(campos.desconto)
    if (!principal || desconto === null || !/^\d{4}-\d{2}-\d{2}$/.test(campos.data)) return null
    const e = calcularEncargos(centavos(principal), parcela.vencimento, campos.data, {
      multa: new Decimal(regra.multa),
      jurosMoraMensal: new Decimal(regra.jurosMoraMensal),
    })
    return { ...e, aReceber: e.total - desconto }
  }, [campos, parcela.vencimento, regra])
  const mudar = (k: keyof typeof campos) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCampos({ ...campos, [k]: e.target.value })

  return (
    <form action={acao} className="flex flex-col gap-3" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Campo id={`${prefixo}-data`} rotulo="Data do pagamento" erro={er.data}>
          <Entrada
            {...aria(prefixo, 'data', er.data)}
            type="date"
            max={hoje}
            value={campos.data}
            onChange={mudar('data')}
          />
        </Campo>
        <Campo id={`${prefixo}-valor`} rotulo="Parcela paga (R$)" erro={er.valor}>
          <Entrada
            {...aria(prefixo, 'valor', er.valor)}
            inputMode="decimal"
            value={campos.valor}
            onChange={mudar('valor')}
          />
        </Campo>
        <Campo id={`${prefixo}-desconto`} rotulo="Desconto (R$)" erro={er.desconto}>
          <Entrada
            {...aria(prefixo, 'desconto', er.desconto)}
            inputMode="decimal"
            value={campos.desconto}
            onChange={mudar('desconto')}
            placeholder="0,00"
          />
        </Campo>
        <Campo id={`${prefixo}-observacao`} rotulo="Observação">
          <Entrada
            id={`${prefixo}-observacao`}
            name="observacao"
            defaultValue={estado.valores?.observacao}
          />
        </Campo>
      </div>
      <output aria-live="polite" className="rounded-lg border bg-muted/50 p-3 text-sm">
        {previa ? (
          <>
            <span className="font-medium">A receber: {moeda(previa.aReceber)}</span>
            <span className="block text-xs text-muted-foreground">
              {previa.diasAtraso > 0
                ? `${previa.diasAtraso} dia(s) de atraso · multa ${moeda(previa.multa)} · juros de mora ${moeda(previa.jurosMora)}`
                : 'Em dia: sem multa nem juros de mora.'}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Informe a data e o valor.</span>
        )}
      </output>
      <Button type="submit" disabled={enviando} className="self-start">
        {enviando ? 'Registrando…' : 'Registrar recebimento'}
      </Button>
    </form>
  )
}

export function FormularioEstornoRecebimento({
  empreendimentoId,
  contratoId,
  recebimentoId,
}: {
  empreendimentoId: string
  contratoId: string
  recebimentoId: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    estornar.bind(null, empreendimentoId, contratoId, recebimentoId),
    {},
  )
  return (
    <form action={acao} className="flex flex-wrap items-end gap-2" noValidate>
      <Entrada
        name="motivo"
        aria-label="Motivo do estorno"
        placeholder="Motivo do estorno"
        className="h-8 w-44"
      />
      <Button type="submit" size="sm" variant="outline" disabled={enviando}>
        Estornar
      </Button>
      {estado.erro && (
        <p role="alert" className="w-full text-xs text-destructive">
          {estado.erro}
        </p>
      )}
    </form>
  )
}

export function FormularioReajuste({
  empreendimentoId,
  contratoId,
}: {
  empreendimentoId: string
  contratoId: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    reajustar.bind(null, empreendimentoId, contratoId),
    {},
  )
  return (
    <form action={acao} className="flex flex-col items-end gap-1">
      <Button type="submit" size="sm" variant="outline" disabled={enviando}>
        {enviando ? 'Verificando…' : 'Aplicar reajustes pendentes'}
      </Button>
      {estado.erro && (
        <p role="alert" className="text-xs text-destructive">
          {estado.erro}
        </p>
      )}
    </form>
  )
}
