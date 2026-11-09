'use client'

import { formatarMoeda } from '@norteia/dominio'
import { type Decimal, arredondarCentavos } from '@norteia/motor-financeiro'
import { useActionState, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, AreaTexto, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { propor } from '../acoes-comerciais'
import { simular } from '../vender/formulario-venda'

export function FormularioProposta({
  empreendimentoId,
  loteId,
  preco,
  primeiraParcela,
  validade,
  corretores,
  corretorPadrao,
}: {
  empreendimentoId: string
  loteId: string
  preco: string
  primeiraParcela: string
  validade: string
  /** Vazio quando quem propõe é o próprio corretor. */
  corretores: { id: string; nome: string }[]
  corretorPadrao: string | null
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    propor.bind(null, empreendimentoId, loteId),
    {},
  )
  const er = estado.erros ?? {}
  const v = (k: string, padrao = '') => estado.valores?.[k] ?? padrao
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

  return (
    <form action={acao} className="flex flex-col gap-5" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold">Cliente</legend>
        <Campo id="nome" rotulo="Nome completo" erro={er.nome}>
          <Entrada {...ariaCampo('nome', er.nome)} defaultValue={v('nome')} autoComplete="off" />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo id="cpf" rotulo="CPF (opcional)" erro={er.cpf}>
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
        <legend className="mb-2 text-sm font-semibold">Condições propostas</legend>
        <div className="grid grid-cols-2 gap-3">
          <Campo id="preco" rotulo="Preço (R$)" erro={er.preco}>
            <Entrada
              {...ariaCampo('preco', er.preco)}
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
          <Campo id="validade" rotulo="Proposta válida até" erro={er.validade}>
            <Entrada
              {...ariaCampo('validade', er.validade)}
              type="date"
              defaultValue={v('validade', validade)}
            />
          </Campo>
          {corretores.length > 0 ? (
            <Campo id="corretor" rotulo="Corretor">
              <Selecao
                id="corretor"
                name="corretor"
                defaultValue={v('corretor', corretorPadrao ?? '')}
              >
                <option value="">Sem corretor</option>
                {corretores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
          ) : (
            <input type="hidden" name="corretor" value="" />
          )}
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
        <Campo id="observacao" rotulo="Observação para a gestão" erro={er.observacao}>
          <AreaTexto
            {...ariaCampo('observacao', er.observacao)}
            defaultValue={v('observacao')}
            maxLength={1000}
          />
        </Campo>
      </fieldset>

      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Enviar proposta'}
      </Button>
    </form>
  )
}
