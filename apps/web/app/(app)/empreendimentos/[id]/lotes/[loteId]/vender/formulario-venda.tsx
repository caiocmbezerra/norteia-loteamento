'use client'

import type { CondicoesPreco } from '@norteia/aplicacao'
import { formatarData, formatarMoeda, formatarPercentual, lerMoeda } from '@norteia/dominio'
import { Decimal, arredondarCentavos, tabelaAmortizacao } from '@norteia/motor-financeiro'
import { useActionState, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, AreaTexto, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { pedirAprovacaoDesconto, vender } from '../acoes-comerciais'

function centavos(texto: string): number | null {
  try {
    return Number(lerMoeda(texto))
  } catch {
    return null
  }
}

/** Simulação ao vivo com o mesmo motor que projeta o fluxo (RN-F01). */
export function simular(
  preco: string,
  entrada: string,
  parcelas: string,
  juros: string,
  sistema: 'price' | 'sac',
) {
  const p = centavos(preco)
  const e = centavos(entrada)
  const n = Number(parcelas)
  const j = /^\d{1,2}(,\d{1,4})?$/.test(juros)
    ? new Decimal(juros.replace(',', '.')).div(100)
    : null
  if (p === null || e === null || j === null || !Number.isInteger(n) || n < 1 || e >= p) return null
  const tabela = tabelaAmortizacao(sistema, new Decimal(p - e), j, n, { arredondarCentavos: true })
  const total = tabela.reduce((s, x) => s.plus(x.prestacao), new Decimal(e))
  return { primeira: tabela[0]!.prestacao, ultima: tabela.at(-1)!.prestacao, total }
}

/** Desconto sobre a tabela e o que falta para vender com ele (RN-C05). */
function situacaoDesconto(preco: string, c: CondicoesPreco, podeAprovar: boolean) {
  const p = centavos(preco)
  if (p === null || !c.precoTabelaCentavos || p >= c.precoTabelaCentavos) return null
  const desconto = new Decimal(1).minus(new Decimal(p).div(c.precoTabelaCentavos))
  const acimaDoLimite = c.limiteDesconto !== null && desconto.gt(c.limiteDesconto)
  const situacao = podeAprovar
    ? 'dono'
    : c.pedido?.situacao === 'aprovada' && p >= c.pedido.precoCentavos
      ? 'aprovado'
      : c.pedido?.situacao === 'pendente'
        ? 'pendente'
        : 'pedir'
  return { desconto, acimaDoLimite, situacao }
}

export function FormularioVenda({
  empreendimentoId,
  loteId,
  preco,
  hoje,
  primeiraParcela,
  corretores,
  corretorReserva,
  semRegistro,
  condicoes,
  podeAprovarDesconto,
  inicial = {},
}: {
  empreendimentoId: string
  loteId: string
  preco: string
  hoje: string
  primeiraParcela: string
  corretores: { id: string; nome: string }[]
  corretorReserva: string | null
  semRegistro: boolean
  condicoes: CondicoesPreco
  podeAprovarDesconto: boolean
  /** Valores iniciais (ex.: da proposta aceita). */
  inicial?: Record<string, string>
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    vender.bind(null, empreendimentoId, loteId),
    {},
  )
  const [pedido, acaoPedido, pedindo] = useActionState<EstadoFormulario, FormData>(
    pedirAprovacaoDesconto.bind(null, empreendimentoId, loteId),
    {},
  )
  const er = { ...pedido.erros, ...estado.erros }
  const v = (k: string, padrao = '') => estado.valores?.[k] ?? inicial[k] ?? padrao
  const [cond, setCond] = useState({
    preco: v('preco', preco),
    entrada: v('entrada', ''),
    parcelas: v('parcelas', '120'),
    juros: v('juros', '0,5'),
    sistema: v('sistema', 'price') as 'price' | 'sac',
  })
  const sim = useMemo(
    () => simular(cond.preco, cond.entrada, cond.parcelas, cond.juros, cond.sistema),
    [cond],
  )
  const mudar =
    (k: keyof typeof cond) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setCond({ ...cond, [k]: e.target.value })
  const fmt = (d: Decimal) => formatarMoeda(arredondarCentavos(d))
  const desconto = situacaoDesconto(cond.preco, condicoes, podeAprovarDesconto)

  return (
    <form action={acao} className="flex flex-col gap-5" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {pedido.erro && <Alerta>{pedido.erro}</Alerta>}
      {pedido.ok && <Alerta tipo="sucesso">{pedido.ok}</Alerta>}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold">Comprador</legend>
        <Campo id="nome" rotulo="Nome completo" erro={er.nome}>
          <Entrada {...ariaCampo('nome', er.nome)} defaultValue={v('nome')} autoComplete="off" />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo id="cpf" rotulo="CPF" erro={er.cpf}>
            <Entrada
              {...ariaCampo('cpf', er.cpf)}
              inputMode="numeric"
              defaultValue={v('cpf')}
              placeholder="000.000.000-00"
            />
          </Campo>
          <Campo id="telefone" rotulo="Telefone">
            <Entrada id="telefone" name="telefone" inputMode="tel" defaultValue={v('telefone')} />
          </Campo>
        </div>
        <Campo id="email" rotulo="E-mail" erro={er.email}>
          <Entrada {...ariaCampo('email', er.email)} type="email" defaultValue={v('email')} />
        </Campo>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold">Condições</legend>
        <div className="grid grid-cols-2 gap-3">
          <Campo
            id="preco"
            rotulo="Preço (R$)"
            erro={er.preco}
            {...(condicoes.precoTabelaCentavos
              ? {
                  ajuda: `Tabela: ${formatarMoeda(arredondarCentavos(String(condicoes.precoTabelaCentavos)))}${desconto ? ` · desconto de ${formatarPercentual(desconto.desconto.toString(), 2)}` : ''}`,
                }
              : {})}
          >
            <Entrada
              {...ariaCampo('preco', er.preco, condicoes.precoTabelaCentavos ? 'ajuda' : undefined)}
              inputMode="decimal"
              value={cond.preco}
              onChange={mudar('preco')}
            />
          </Campo>
          <Campo id="entrada" rotulo="Entrada (R$)" erro={er.entrada}>
            <Entrada
              {...ariaCampo('entrada', er.entrada)}
              inputMode="decimal"
              value={cond.entrada}
              onChange={mudar('entrada')}
              placeholder="9.000,00"
            />
          </Campo>
          <Campo id="parcelas" rotulo="Parcelas" erro={er.parcelas}>
            <Entrada
              {...ariaCampo('parcelas', er.parcelas)}
              inputMode="numeric"
              value={cond.parcelas}
              onChange={mudar('parcelas')}
            />
          </Campo>
          <Campo id="juros" rotulo="Juros ao mês (%)" erro={er.juros}>
            <Entrada
              {...ariaCampo('juros', er.juros)}
              inputMode="decimal"
              value={cond.juros}
              onChange={mudar('juros')}
            />
          </Campo>
          <Campo id="sistema" rotulo="Sistema">
            <Selecao id="sistema" name="sistema" value={cond.sistema} onChange={mudar('sistema')}>
              <option value="price">Price (parcelas iguais)</option>
              <option value="sac">SAC (decrescentes)</option>
            </Selecao>
          </Campo>
          <Campo id="primeiraParcela" rotulo="1ª parcela" erro={er.primeiraParcela}>
            <Entrada
              {...ariaCampo('primeiraParcela', er.primeiraParcela)}
              type="date"
              defaultValue={v('primeiraParcela', primeiraParcela)}
            />
          </Campo>
          <Campo id="dataVenda" rotulo="Data da venda" erro={er.dataVenda}>
            <Entrada
              {...ariaCampo('dataVenda', er.dataVenda)}
              type="date"
              defaultValue={v('dataVenda', hoje)}
            />
          </Campo>
          <Campo id="indice" rotulo="Reajuste">
            <Selecao id="indice" name="indice" defaultValue={v('indice', 'IPCA')}>
              <option value="IPCA">IPCA</option>
              <option value="IGP-M">IGP-M</option>
              <option value="INCC">INCC</option>
              <option value="">Sem reajuste</option>
            </Selecao>
          </Campo>
          <Campo id="corretor" rotulo="Corretor">
            <Selecao
              id="corretor"
              name="corretor"
              defaultValue={v('corretor', corretorReserva ?? '')}
            >
              <option value="">Sem corretor</option>
              {corretores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        </div>
        <output aria-live="polite" className="rounded-lg border bg-muted/50 p-3 text-sm">
          {sim ? (
            <>
              <span className="font-medium">
                {cond.sistema === 'price'
                  ? `${cond.parcelas} × ${fmt(sim.primeira)}`
                  : `de ${fmt(sim.primeira)} a ${fmt(sim.ultima)}`}
              </span>
              <span className="block text-xs text-muted-foreground">
                Total a pagar com juros: {fmt(sim.total)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              Preencha preço, entrada, parcelas e juros para simular.
            </span>
          )}
        </output>
      </fieldset>

      {desconto?.acimaDoLimite && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50">
          <p>
            O desconto passa do limite de {formatarPercentual(condicoes.limiteDesconto!, 2)} sem
            aprovação.{' '}
            {desconto.situacao === 'dono'
              ? 'A venda fica registrada como aprovada por você.'
              : desconto.situacao === 'aprovado'
                ? `Desconto aprovado até ${formatarData(condicoes.pedido!.validaAte!)}: pode registrar a venda.`
                : desconto.situacao === 'pendente'
                  ? 'Já há um pedido aguardando a aprovação do dono; um novo pedido substitui o anterior.'
                  : 'Peça a aprovação ao dono antes de registrar a venda.'}
          </p>
          {(desconto.situacao === 'pedir' || desconto.situacao === 'pendente') && (
            <>
              <Campo
                id="motivoDesconto"
                rotulo="Motivo do desconto"
                ajuda="O dono vê este motivo ao decidir. A aprovação vale para este preço ou maior."
                erro={er.motivoDesconto}
              >
                <AreaTexto
                  {...ariaCampo('motivoDesconto', er.motivoDesconto, 'ajuda')}
                  defaultValue={v('motivoDesconto')}
                  maxLength={500}
                />
              </Campo>
              <Button type="submit" variant="secondary" formAction={acaoPedido} disabled={pedindo}>
                {pedindo ? 'Enviando…' : 'Pedir aprovação do desconto'}
              </Button>
            </>
          )}
        </div>
      )}

      {semRegistro && (
        <Campo
          id="justificativa"
          rotulo="Justificativa (venda antes do registro)"
          ajuda="Só é aceita se a empresa permitir essa exceção; fica na auditoria."
          erro={er.justificativa}
        >
          <AreaTexto
            {...ariaCampo('justificativa', er.justificativa, 'ajuda')}
            defaultValue={v('justificativa')}
          />
        </Campo>
      )}
      {!semRegistro && <input type="hidden" name="justificativa" value="" />}

      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? 'Registrando…' : 'Registrar venda'}
      </Button>
    </form>
  )
}
