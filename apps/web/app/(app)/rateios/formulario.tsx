'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { ratear } from './acoes'

type Opcao = { id: string; nome: string }

const CRITERIOS = {
  lotes: 'Número de lotes',
  area: 'Área dos lotes',
  vgv: 'VGV de tabela',
  manual: 'Percentuais informados',
} as const

export function FormularioRateio({
  empreendimentos,
  centros,
  fornecedores,
  hoje,
}: {
  empreendimentos: Opcao[]
  centros: { codigo: string; nome: string }[]
  fornecedores: Opcao[]
  hoje: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(ratear, {})
  const [criterio, setCriterio] = useState<keyof typeof CRITERIOS>('lotes')
  const er = estado.erros ?? {}
  const v = (k: string, padrao = '') => estado.valores?.[k] ?? padrao
  return (
    <form action={acao} className="flex flex-col gap-4" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {estado.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
      <Campo id="descricao" rotulo="Descrição" erro={er.descricao}>
        <Entrada
          {...ariaCampo('descricao', er.descricao)}
          defaultValue={v('descricao')}
          placeholder="Ex.: Contabilidade de novembro"
        />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="centro" rotulo="Centro de custo" erro={er.centro}>
          <Selecao {...ariaCampo('centro', er.centro)} defaultValue={v('centro')}>
            <option value="">—</option>
            {centros.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="fornecedorId" rotulo="Fornecedor (opcional)">
          <Selecao id="fornecedorId" name="fornecedorId" defaultValue={v('fornecedorId')}>
            <option value="">—</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="valor" rotulo="Valor total (R$)" erro={er.valor}>
          <Entrada
            {...ariaCampo('valor', er.valor)}
            inputMode="decimal"
            defaultValue={v('valor')}
          />
        </Campo>
        <Campo id="vencimento" rotulo="Vencimento" erro={er.vencimento}>
          <Entrada
            {...ariaCampo('vencimento', er.vencimento)}
            type="date"
            defaultValue={v('vencimento', hoje)}
          />
        </Campo>
        <Campo id="documentoNumero" rotulo="Nº da nota (opcional)">
          <Entrada
            id="documentoNumero"
            name="documentoNumero"
            defaultValue={v('documentoNumero')}
          />
        </Campo>
        <Campo id="criterio" rotulo="Critério do rateio" erro={er.criterio}>
          <Selecao
            {...ariaCampo('criterio', er.criterio)}
            name={undefined}
            value={criterio}
            onChange={(e) => setCriterio(e.target.value as keyof typeof CRITERIOS)}
          >
            {Object.entries(CRITERIOS).map(([k, r]) => (
              <option key={k} value={k}>
                {r}
              </option>
            ))}
          </Selecao>
        </Campo>
      </div>
      {/* O React limpa o formulário após o envio; o critério vai pelo campo oculto. */}
      <input type="hidden" name="criterio" value={criterio} />
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={er.empreendimentos ? 'emp-erro' : undefined}
      >
        <legend className="mb-1 text-sm font-semibold">Empreendimentos</legend>
        {er.empreendimentos && (
          <p id="emp-erro" className="text-sm text-destructive">
            {er.empreendimentos}
          </p>
        )}
        {empreendimentos.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="emp" value={e.id} className="size-4" />
              {e.nome}
            </label>
            {criterio === 'manual' && (
              <span className="flex items-center gap-1 text-sm">
                <label htmlFor={`pct_${e.id}`} className="sr-only">
                  Percentual de {e.nome}
                </label>
                <Entrada
                  id={`pct_${e.id}`}
                  name={`pct_${e.id}`}
                  inputMode="decimal"
                  className="w-24"
                  placeholder="0"
                />
                %
              </span>
            )}
          </div>
        ))}
      </fieldset>
      <Button type="submit" disabled={enviando}>
        {enviando ? 'Rateando…' : 'Ratear despesa'}
      </Button>
    </form>
  )
}
