'use client'

import { formatarMoeda, lerMoeda } from '@norteia/dominio'
import {
  Decimal,
  arredondarCentavos,
  calcularEncargos,
  centavos,
  descontoAntecipacao,
  gerarParcelasContrato,
} from '@norteia/motor-financeiro'
import { useActionState, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import {
  antecipar,
  cancelarCobrancaAcao,
  ceder,
  emitirCobranca,
  estornar,
  gerar,
  reajustar,
  receber,
  renegociar,
  trocar,
} from './acoes'

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

export function FormularioEmitirCobranca({
  empreendimentoId,
  contratoId,
  parcelaId,
}: {
  empreendimentoId: string
  contratoId: string
  parcelaId: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    emitirCobranca.bind(null, empreendimentoId, contratoId, parcelaId),
    {},
  )
  return (
    <form action={acao} className="mt-1 flex flex-col items-end gap-1">
      <Button type="submit" size="sm" variant="outline" disabled={enviando}>
        {enviando ? 'Emitindo…' : 'Gerar boleto/Pix'}
      </Button>
      {estado.erro && (
        <p role="alert" className="text-xs text-destructive">
          {estado.erro}
        </p>
      )}
    </form>
  )
}

export function FormularioCancelarCobranca({
  empreendimentoId,
  contratoId,
  cobrancaId,
}: {
  empreendimentoId: string
  contratoId: string
  cobrancaId: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    cancelarCobrancaAcao.bind(null, empreendimentoId, contratoId, cobrancaId),
    {},
  )
  return (
    <form action={acao} className="mt-1 flex flex-wrap items-end justify-end gap-2" noValidate>
      <Entrada
        name="motivo"
        aria-label="Motivo do cancelamento da cobrança"
        placeholder="Motivo"
        className="h-8 w-32"
      />
      <Button type="submit" size="sm" variant="outline" disabled={enviando}>
        Cancelar cobrança
      </Button>
      {estado.erro && (
        <p role="alert" className="w-full text-xs text-destructive">
          {estado.erro}
        </p>
      )}
    </form>
  )
}

type ParcelaAberta = { id: string; numero: number; vencimento: string; saldoCentavos: number }

/** Renegociação por aditivo com prévia do novo plano pelo mesmo motor do servidor (RN-K07). */
export function FormularioRenegociacao({
  empreendimentoId,
  contratoId,
  abertas,
  regra,
  jurosMensal,
  sistema,
  hoje,
  primeiraParcela,
}: {
  empreendimentoId: string
  contratoId: string
  abertas: ParcelaAberta[]
  regra: { multa: string; jurosMoraMensal: string }
  jurosMensal: string
  sistema: 'price' | 'sac'
  hoje: string
  primeiraParcela: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    renegociar.bind(null, empreendimentoId, contratoId),
    {},
  )
  const er = estado.erros ?? {}
  const v = (k: string, padrao: string) => estado.valores?.[k] ?? padrao
  const [campos, setCampos] = useState({
    data: v('data', hoje),
    encargos: estado.valores ? estado.valores.encargos === 'on' : true,
    desconto: v('desconto', ''),
    parcelas: v('parcelas', String(Math.max(1, abertas.length))),
    juros: v('juros', new Decimal(jurosMensal).times(100).toString().replace('.', ',')),
    sistema: v('sistema', sistema) as 'price' | 'sac',
    primeiraParcela: v('primeiraParcela', primeiraParcela),
  })
  const previa = useMemo(() => {
    const desconto = lerCentavos(campos.desconto)
    const n = Number(campos.parcelas)
    const data = /^\d{4}-\d{2}-\d{2}$/.test(campos.data) ? campos.data : null
    const taxa = /^\d{1,2}(,\d{1,4})?$/.test(campos.juros)
      ? new Decimal(campos.juros.replace(',', '.')).div(100)
      : null
    if (desconto === null || !data || !taxa || !Number.isInteger(n) || n < 1 || n > 480) return null
    const r = {
      multa: new Decimal(regra.multa),
      jurosMoraMensal: new Decimal(regra.jurosMoraMensal),
    }
    const saldo = abertas.reduce((t, p) => t + p.saldoCentavos, 0)
    const encargos = campos.encargos
      ? abertas.reduce((t, p) => {
          const e = calcularEncargos(centavos(p.saldoCentavos), p.vencimento, data, r)
          return t + e.multa + e.jurosMora
        }, 0)
      : 0
    const novo = saldo + encargos - desconto
    if (novo <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(campos.primeiraParcela))
      return { saldo, encargos, novo, plano: null }
    const plano = gerarParcelasContrato({
      precoCentavos: centavos(novo),
      entradaCentavos: centavos(0),
      dataEntrada: data,
      parcelas: n,
      jurosMensal: taxa,
      sistema: campos.sistema,
      primeiraParcelaEm: campos.primeiraParcela,
    })
    return { saldo, encargos, novo, plano }
  }, [campos, abertas, regra])
  const mudar =
    (k: keyof typeof campos) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setCampos({
        ...campos,
        [k]:
          e.target instanceof HTMLInputElement && e.target.type === 'checkbox'
            ? e.target.checked
            : e.target.value,
      })

  return (
    <form action={acao} className="flex flex-col gap-3" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Campo id="ren-data" rotulo="Data do aditivo" erro={er.data}>
          <Entrada
            {...aria('ren', 'data', er.data)}
            type="date"
            max={hoje}
            value={campos.data}
            onChange={mudar('data')}
          />
        </Campo>
        <Campo id="ren-desconto" rotulo="Desconto (R$)" erro={er.desconto}>
          <Entrada
            {...aria('ren', 'desconto', er.desconto)}
            inputMode="decimal"
            placeholder="0,00"
            value={campos.desconto}
            onChange={mudar('desconto')}
          />
        </Campo>
        <Campo id="ren-parcelas" rotulo="Parcelas" erro={er.parcelas}>
          <Entrada
            {...aria('ren', 'parcelas', er.parcelas)}
            inputMode="numeric"
            value={campos.parcelas}
            onChange={mudar('parcelas')}
          />
        </Campo>
        <Campo id="ren-juros" rotulo="Juros ao mês (%)" erro={er.juros}>
          <Entrada
            {...aria('ren', 'juros', er.juros)}
            inputMode="decimal"
            value={campos.juros}
            onChange={mudar('juros')}
          />
        </Campo>
        <Campo id="ren-sistema" rotulo="Sistema">
          <Selecao
            id="ren-sistema"
            name="sistema"
            value={campos.sistema}
            onChange={mudar('sistema')}
          >
            <option value="price">Price</option>
            <option value="sac">SAC</option>
          </Selecao>
        </Campo>
        <Campo id="ren-primeiraParcela" rotulo="1ª parcela" erro={er.primeiraParcela}>
          <Entrada
            {...aria('ren', 'primeiraParcela', er.primeiraParcela)}
            type="date"
            value={campos.primeiraParcela}
            onChange={mudar('primeiraParcela')}
          />
        </Campo>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="encargos"
          checked={campos.encargos}
          onChange={mudar('encargos')}
          className="size-4"
        />
        Incorporar multa e juros de mora das parcelas vencidas
      </label>
      <Campo id="ren-motivo" rotulo="Motivo (fica no aditivo e na auditoria)" erro={er.motivo}>
        <Entrada {...aria('ren', 'motivo', er.motivo)} defaultValue={estado.valores?.motivo} />
      </Campo>
      <output aria-live="polite" className="rounded-lg border bg-muted/50 p-3 text-sm">
        {previa ? (
          <>
            <span className="block">
              Saldo {moeda(previa.saldo)}
              {previa.encargos > 0 && ` + encargos ${moeda(previa.encargos)}`}
              {lerCentavos(campos.desconto)
                ? ` − desconto ${moeda(lerCentavos(campos.desconto)!)}`
                : ''}{' '}
              = <strong>{moeda(previa.novo)}</strong>
            </span>
            {previa.plano ? (
              <span className="block text-xs text-muted-foreground">
                {campos.sistema === 'price'
                  ? `${previa.plano.length} × ${moeda(previa.plano[0]!.valor)}`
                  : `de ${moeda(previa.plano[0]!.valor)} a ${moeda(previa.plano.at(-1)!.valor)}`}{' '}
                · total {moeda(previa.plano.reduce((t, p) => t + p.valor, 0))}
              </span>
            ) : (
              <span className="block text-xs text-destructive">
                O desconto não pode zerar o saldo.
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">
            Preencha as condições para ver o novo plano.
          </span>
        )}
      </output>
      <Button type="submit" disabled={enviando} className="self-start">
        {enviando ? 'Registrando…' : 'Registrar aditivo de renegociação'}
      </Button>
    </form>
  )
}

/** Antecipação das parcelas a vencer com desconto dos juros não decorridos (RN-K08). */
export function FormularioAntecipacao({
  empreendimentoId,
  contratoId,
  abertas,
  jurosMensal,
  hoje,
}: {
  empreendimentoId: string
  contratoId: string
  abertas: ParcelaAberta[]
  jurosMensal: string
  hoje: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    antecipar.bind(null, empreendimentoId, contratoId),
    {},
  )
  const [data, setData] = useState(estado.valores?.data ?? hoje)
  const aVencer = abertas.filter((p) => p.vencimento > data)
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set())
  const taxa = new Decimal(jurosMensal)
  const lista = aVencer.filter((p) => escolhidas.has(p.id))
  const saldo = lista.reduce((t, p) => t + p.saldoCentavos, 0)
  const desconto = /^\d{4}-\d{2}-\d{2}$/.test(data)
    ? lista.reduce(
        (t, p) => t + descontoAntecipacao(centavos(p.saldoCentavos), p.vencimento, data, taxa),
        0,
      )
    : 0
  const alternar = (id: string) => {
    const novo = new Set(escolhidas)
    if (novo.has(id)) novo.delete(id)
    else novo.add(id)
    setEscolhidas(novo)
  }
  return (
    <form action={acao} className="flex flex-col gap-3" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <Campo id="ant-data" rotulo="Data da antecipação" erro={estado.erros?.data}>
        <Entrada
          {...aria('ant', 'data', estado.erros?.data)}
          type="date"
          max={hoje}
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="sm:w-48"
        />
      </Campo>
      {aVencer.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma parcela a vencer nesta data.</p>
      ) : (
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="mb-1 text-sm font-medium">Parcelas a antecipar</legend>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="size-4"
              checked={lista.length === aVencer.length}
              onChange={(e) =>
                setEscolhidas(new Set(e.target.checked ? aVencer.map((p) => p.id) : []))
              }
            />
            Todas (quitação antecipada)
          </label>
          {aVencer.map((p) => (
            <label key={p.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="parcela"
                value={p.id}
                className="size-4"
                checked={escolhidas.has(p.id)}
                onChange={() => alternar(p.id)}
              />
              Parcela {p.numero} · vence {p.vencimento.split('-').reverse().join('/')} ·{' '}
              {moeda(p.saldoCentavos)}
            </label>
          ))}
        </fieldset>
      )}
      <output aria-live="polite" className="rounded-lg border bg-muted/50 p-3 text-sm">
        {lista.length > 0 ? (
          <>
            <span className="font-medium">A receber: {moeda(saldo - desconto)}</span>
            <span className="block text-xs text-muted-foreground">
              Saldo {moeda(saldo)} − desconto dos juros não decorridos {moeda(desconto)}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Escolha as parcelas.</span>
        )}
      </output>
      <Button type="submit" disabled={enviando || lista.length === 0} className="self-start">
        {enviando ? 'Registrando…' : 'Registrar antecipação'}
      </Button>
    </form>
  )
}

/** Cessão do contrato a outro comprador (o plano de parcelas não muda). */
export function FormularioCessao({
  empreendimentoId,
  contratoId,
  hoje,
}: {
  empreendimentoId: string
  contratoId: string
  hoje: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    ceder.bind(null, empreendimentoId, contratoId),
    {},
  )
  const er = estado.erros ?? {}
  const v = (k: string) => estado.valores?.[k]
  return (
    <form action={acao} className="flex flex-col gap-3" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <div className="grid grid-cols-2 gap-3">
        <Campo id="ces-nome" rotulo="Nome do cessionário" erro={er.nome}>
          <Entrada {...aria('ces', 'nome', er.nome)} defaultValue={v('nome')} autoComplete="off" />
        </Campo>
        <Campo id="ces-cpf" rotulo="CPF do cessionário" erro={er.cpf}>
          <Entrada {...aria('ces', 'cpf', er.cpf)} inputMode="numeric" defaultValue={v('cpf')} />
        </Campo>
        <Campo id="ces-email" rotulo="E-mail" erro={er.email}>
          <Entrada {...aria('ces', 'email', er.email)} type="email" defaultValue={v('email')} />
        </Campo>
        <Campo id="ces-telefone" rotulo="Telefone">
          <Entrada id="ces-telefone" name="telefone" inputMode="tel" defaultValue={v('telefone')} />
        </Campo>
        <Campo id="ces-data" rotulo="Data da cessão" erro={er.data}>
          <Entrada
            {...aria('ces', 'data', er.data)}
            type="date"
            max={hoje}
            defaultValue={v('data') ?? hoje}
          />
        </Campo>
        <Campo id="ces-motivo" rotulo="Motivo" erro={er.motivo}>
          <Entrada {...aria('ces', 'motivo', er.motivo)} defaultValue={v('motivo')} />
        </Campo>
      </div>
      <Button type="submit" disabled={enviando} className="self-start">
        {enviando ? 'Registrando…' : 'Registrar aditivo de cessão'}
      </Button>
    </form>
  )
}

/** Troca de lote: a diferença de preço entra no saldo, que vira novo plano (prévia pelo motor). */
export function FormularioTrocaLote({
  empreendimentoId,
  contratoId,
  lotes,
  saldoCentavos,
  precoAtualCentavos,
  jurosMensal,
  sistema,
  hoje,
  primeiraParcela,
}: {
  empreendimentoId: string
  contratoId: string
  lotes: { id: string; rotulo: string; precoCentavos: number | null }[]
  saldoCentavos: number
  precoAtualCentavos: number
  jurosMensal: string
  sistema: 'price' | 'sac'
  hoje: string
  primeiraParcela: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    trocar.bind(null, empreendimentoId, contratoId),
    {},
  )
  const er = estado.erros ?? {}
  const v = (k: string, padrao: string) => estado.valores?.[k] ?? padrao
  const [campos, setCampos] = useState({
    lote: v('lote', ''),
    preco: v('preco', ''),
    parcelas: v('parcelas', '12'),
    juros: v('juros', new Decimal(jurosMensal).times(100).toString().replace('.', ',')),
    sistema: v('sistema', sistema) as 'price' | 'sac',
    primeiraParcela: v('primeiraParcela', primeiraParcela),
    data: v('data', hoje),
  })
  const escolherLote = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const l = lotes.find((x) => x.id === e.target.value)
    setCampos({
      ...campos,
      lote: e.target.value,
      preco: l?.precoCentavos ? emTexto(l.precoCentavos) : campos.preco,
    })
  }
  const mudar =
    (k: keyof typeof campos) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setCampos({ ...campos, [k]: e.target.value })
  const previa = useMemo(() => {
    const preco = lerCentavos(campos.preco)
    const n = Number(campos.parcelas)
    const taxa = /^\d{1,2}(,\d{1,4})?$/.test(campos.juros)
      ? new Decimal(campos.juros.replace(',', '.')).div(100)
      : null
    if (!preco || !taxa || !Number.isInteger(n) || n < 1 || n > 480) return null
    const novo = saldoCentavos + preco - precoAtualCentavos
    if (
      novo <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(campos.primeiraParcela) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(campos.data)
    )
      return { novo, plano: null }
    const plano = gerarParcelasContrato({
      precoCentavos: centavos(novo),
      entradaCentavos: centavos(0),
      dataEntrada: campos.data,
      parcelas: n,
      jurosMensal: taxa,
      sistema: campos.sistema,
      primeiraParcelaEm: campos.primeiraParcela,
    })
    return { novo, plano }
  }, [campos, saldoCentavos, precoAtualCentavos])
  return (
    <form action={acao} className="flex flex-col gap-3" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Campo id="tro-lote" rotulo="Novo lote" erro={er.lote}>
          <Selecao {...aria('tro', 'lote', er.lote)} value={campos.lote} onChange={escolherLote}>
            <option value="">Escolha…</option>
            {lotes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.rotulo}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="tro-preco" rotulo="Preço do novo lote (R$)" erro={er.preco}>
          <Entrada
            {...aria('tro', 'preco', er.preco)}
            inputMode="decimal"
            value={campos.preco}
            onChange={mudar('preco')}
          />
        </Campo>
        <Campo id="tro-parcelas" rotulo="Parcelas do saldo" erro={er.parcelas}>
          <Entrada
            {...aria('tro', 'parcelas', er.parcelas)}
            inputMode="numeric"
            value={campos.parcelas}
            onChange={mudar('parcelas')}
          />
        </Campo>
        <Campo id="tro-juros" rotulo="Juros ao mês (%)" erro={er.juros}>
          <Entrada
            {...aria('tro', 'juros', er.juros)}
            inputMode="decimal"
            value={campos.juros}
            onChange={mudar('juros')}
          />
        </Campo>
        <Campo id="tro-sistema" rotulo="Sistema">
          <Selecao
            id="tro-sistema"
            name="sistema"
            value={campos.sistema}
            onChange={mudar('sistema')}
          >
            <option value="price">Price</option>
            <option value="sac">SAC</option>
          </Selecao>
        </Campo>
        <Campo id="tro-primeiraParcela" rotulo="1ª parcela" erro={er.primeiraParcela}>
          <Entrada
            {...aria('tro', 'primeiraParcela', er.primeiraParcela)}
            type="date"
            value={campos.primeiraParcela}
            onChange={mudar('primeiraParcela')}
          />
        </Campo>
        <Campo id="tro-data" rotulo="Data da troca" erro={er.data}>
          <Entrada
            {...aria('tro', 'data', er.data)}
            type="date"
            max={hoje}
            value={campos.data}
            onChange={mudar('data')}
          />
        </Campo>
        <Campo id="tro-motivo" rotulo="Motivo" erro={er.motivo}>
          <Entrada {...aria('tro', 'motivo', er.motivo)} defaultValue={estado.valores?.motivo} />
        </Campo>
      </div>
      <output aria-live="polite" className="rounded-lg border bg-muted/50 p-3 text-sm">
        {previa ? (
          <>
            <span className="block">
              Saldo {moeda(saldoCentavos)} + diferença de preço {moeda(previa.novo - saldoCentavos)}{' '}
              = <strong>{moeda(previa.novo)}</strong>
            </span>
            {previa.plano ? (
              <span className="block text-xs text-muted-foreground">
                {campos.sistema === 'price'
                  ? `${previa.plano.length} × ${moeda(previa.plano[0]!.valor)}`
                  : `de ${moeda(previa.plano[0]!.valor)} a ${moeda(previa.plano.at(-1)!.valor)}`}
              </span>
            ) : (
              <span className="block text-xs text-destructive">
                Sem saldo depois da troca: a diferença é devolução (distrato).
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">Escolha o lote e as condições do saldo.</span>
        )}
      </output>
      <Button type="submit" disabled={enviando} className="self-start">
        {enviando ? 'Registrando…' : 'Registrar aditivo de troca de lote'}
      </Button>
    </form>
  )
}
