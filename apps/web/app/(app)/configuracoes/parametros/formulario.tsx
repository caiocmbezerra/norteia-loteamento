'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { salvarParametro } from './acoes'

export function FormularioParametro({
  chave,
  tipo,
  percentual,
  unidade,
  opcoes,
  escopos,
  hoje,
}: {
  chave: string
  tipo: string
  percentual: boolean
  unidade: string | null
  opcoes: string[] | null
  escopos: { valor: string; rotulo: string }[]
  hoje: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    salvarParametro.bind(null, chave),
    {},
  )
  const er = estado.erros ?? {}
  const id = (n: string) => `${chave.replace(/\./g, '-')}-${n}`
  const aria = (n: string) => ({ ...ariaCampo(id(n), er[n]), name: n })
  const v = (k: string) => (estado.ok ? undefined : estado.valores?.[k])
  const rotuloValor = percentual
    ? `Valor (%${unidade === 'fração ao mês' ? ' ao mês' : ''})`
    : tipo === 'centavos'
      ? 'Valor (R$)'
      : unidade
        ? `Valor (${unidade})`
        : 'Valor'
  return (
    <form action={acao} className="flex flex-col gap-3" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {estado.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Campo id={id('escopo')} rotulo="Vale para" erro={er.escopo}>
          <Selecao {...aria('escopo')} defaultValue={v('escopo') ?? 'tenant'}>
            {escopos.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.rotulo}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id={id('valor')} rotulo={rotuloValor} erro={er.valor}>
          {tipo === 'booleano' || opcoes ? (
            <Selecao {...aria('valor')} defaultValue={v('valor') ?? ''}>
              <option value="">Escolha…</option>
              {(tipo === 'booleano' ? ['sim', 'nao'] : (opcoes ?? [])).map((o) => (
                <option key={o} value={o}>
                  {o === 'nao' ? 'não' : o.replace(/_/g, ' ')}
                </option>
              ))}
            </Selecao>
          ) : (
            <Entrada {...aria('valor')} inputMode="decimal" defaultValue={v('valor')} />
          )}
        </Campo>
        <Campo id={id('inicio')} rotulo="A partir de" erro={er.inicio}>
          <Entrada {...aria('inicio')} type="date" defaultValue={v('inicio') ?? hoje} />
        </Campo>
        <Campo id={id('motivo')} rotulo="Motivo" erro={er.motivo}>
          <Entrada
            {...aria('motivo')}
            defaultValue={v('motivo') ?? 'Orientação do advogado/contador'}
          />
        </Campo>
      </div>
      <Button type="submit" size="sm" disabled={enviando} className="self-start">
        {enviando ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}
