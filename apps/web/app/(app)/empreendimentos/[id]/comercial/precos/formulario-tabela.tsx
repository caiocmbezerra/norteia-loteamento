'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { publicarTabela } from '../acoes'

export function FormularioTabela({
  empreendimentoId,
  hoje,
  lotes,
}: {
  empreendimentoId: string
  hoje: string
  lotes: { id: string; rotulo: string; preco: string; vendido: boolean }[]
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    publicarTabela.bind(null, empreendimentoId),
    {},
  )
  const er = estado.erros ?? {}
  const v = (k: string, padrao = '') => estado.valores?.[k] ?? padrao
  const aVenda = lotes.filter((l) => !l.vendido)

  return (
    <form action={acao} className="flex flex-col gap-4" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <Campo id="nome" rotulo="Nome da tabela" erro={er.nome}>
        <Entrada
          {...ariaCampo('nome', er.nome)}
          defaultValue={v('nome')}
          placeholder="Tabela de janeiro"
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="vigenteDesde" rotulo="Vale a partir de" erro={er.vigenteDesde}>
          <Entrada
            {...ariaCampo('vigenteDesde', er.vigenteDesde)}
            type="date"
            min={hoje}
            defaultValue={v('vigenteDesde', hoje)}
          />
        </Campo>
        <Campo
          id="reajuste"
          rotulo="Reajuste (%)"
          ajuda="Sobre os preços vigentes na data."
          erro={er.reajuste}
        >
          <Entrada
            {...ariaCampo('reajuste', er.reajuste, 'ajuda')}
            inputMode="decimal"
            defaultValue={v('reajuste', '0')}
          />
        </Campo>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Preço próprio por lote (opcional)</legend>
        <p className="text-xs text-muted-foreground">
          Em branco, o lote recebe o preço vigente com o reajuste. Lotes vendidos ficam de fora da
          lista, mas entram na tabela.
        </p>
        <ul className="flex max-h-96 flex-col divide-y overflow-y-auto rounded-md border px-3">
          {aVenda.map((l) => {
            const nome = `preco_${l.id}`
            return (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <label htmlFor={nome} className="flex flex-col">
                  {l.rotulo}
                  <span className="text-xs text-muted-foreground">Hoje: {l.preco}</span>
                </label>
                <span className="flex w-36 flex-col">
                  <Entrada
                    {...ariaCampo(nome, er[nome])}
                    inputMode="decimal"
                    placeholder="90.000,00"
                    defaultValue={v(nome)}
                  />
                  {er[nome] && (
                    <span id={`${nome}-erro`} className="text-xs text-destructive">
                      {er[nome]}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </fieldset>
      <Button type="submit" disabled={enviando}>
        {enviando ? 'Publicando…' : 'Publicar tabela'}
      </Button>
    </form>
  )
}
