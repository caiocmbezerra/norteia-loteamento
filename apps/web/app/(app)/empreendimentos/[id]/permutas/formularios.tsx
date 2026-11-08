'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { estornar, novaFinanceira, novaFisica, repassar } from './acoes'

function aria(prefixo: string, nome: string, erro?: string) {
  return { ...ariaCampo(`${prefixo}-${nome}`, erro), name: nome }
}

function useForm(acao: (e: EstadoFormulario, f: FormData) => Promise<EstadoFormulario>) {
  const [estado, despachar, enviando] = useActionState<EstadoFormulario, FormData>(acao, {})
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado.ok) ref.current?.reset()
  }, [estado])
  return {
    estado,
    despachar,
    enviando,
    ref,
    er: estado.erros ?? {},
    v: (k: string) => (estado.ok ? undefined : estado.valores?.[k]),
  }
}

function Mensagens({ estado }: { estado: EstadoFormulario }) {
  return (
    <>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {estado.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
    </>
  )
}

function CamposPermutante({
  p,
  f,
  hoje,
}: {
  p: string
  f: ReturnType<typeof useForm>
  hoje: string
}) {
  return (
    <>
      <Campo id={`${p}-nome`} rotulo="Permutante (dono do terreno)" erro={f.er.nome}>
        <Entrada {...aria(p, 'nome', f.er.nome)} defaultValue={f.v('nome')} />
      </Campo>
      <Campo id={`${p}-documento`} rotulo="CPF ou CNPJ" erro={f.er.documento}>
        <Entrada
          {...aria(p, 'documento', f.er.documento)}
          inputMode="numeric"
          defaultValue={f.v('documento')}
        />
      </Campo>
      <Campo id={`${p}-inicio`} rotulo="Início do contrato" erro={f.er.inicio}>
        <Entrada
          {...aria(p, 'inicio', f.er.inicio)}
          type="date"
          defaultValue={f.v('inicio') ?? hoje}
        />
      </Campo>
    </>
  )
}

export function FormularioFisica({
  empreendimentoId,
  lotes,
  hoje,
}: {
  empreendimentoId: string
  lotes: { id: string; rotulo: string }[]
  hoje: string
}) {
  const f = useForm(novaFisica.bind(null, empreendimentoId))
  return (
    <form ref={f.ref} action={f.despachar} className="flex flex-col gap-3" noValidate>
      <Mensagens estado={f.estado} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CamposPermutante p="fis" f={f} hoje={hoje} />
        <Campo id="fis-valor" rotulo="Valor econômico (R$)" erro={f.er.valor}>
          <Entrada
            {...aria('fis', 'valor', f.er.valor)}
            inputMode="decimal"
            placeholder="opcional"
            defaultValue={f.v('valor')}
          />
        </Campo>
      </div>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="mb-1 font-medium">Lotes entregues ao permutante</legend>
        {lotes.length === 0 && <p className="text-muted-foreground">Nenhum lote disponível.</p>}
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          {lotes.map((l) => (
            <label key={l.id} className="flex items-center gap-2">
              <input type="checkbox" name="lote" value={l.id} className="size-4" />
              {l.rotulo}
            </label>
          ))}
        </div>
        {f.er.lote && (
          <p role="alert" className="text-xs text-destructive">
            {f.er.lote}
          </p>
        )}
      </fieldset>
      <Button type="submit" disabled={f.enviando} className="self-start">
        Registrar permuta física
      </Button>
    </form>
  )
}

export function FormularioFinanceira({
  empreendimentoId,
  hoje,
}: {
  empreendimentoId: string
  hoje: string
}) {
  const f = useForm(novaFinanceira.bind(null, empreendimentoId))
  return (
    <form ref={f.ref} action={f.despachar} className="flex flex-col gap-3" noValidate>
      <Mensagens estado={f.estado} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CamposPermutante p="fin" f={f} hoje={hoje} />
        <Campo id="fin-percentual" rotulo="Percentual (%)" erro={f.er.percentual}>
          <Entrada
            {...aria('fin', 'percentual', f.er.percentual)}
            inputMode="decimal"
            defaultValue={f.v('percentual')}
          />
        </Campo>
        <Campo id="fin-base" rotulo="Base do repasse">
          <Selecao id="fin-base" name="base" defaultValue={f.v('base') ?? 'recebido'}>
            <option value="recebido">Tudo o que for recebido</option>
            <option value="principal">Só a amortização recebida</option>
            <option value="vgv">VGV (preço, na venda)</option>
          </Selecao>
        </Campo>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="abate" defaultChecked className="size-4" />
        Distrato abate o repasse (devolução ou estorno da venda)
      </label>
      <Button type="submit" disabled={f.enviando} className="self-start">
        Registrar permuta financeira
      </Button>
    </form>
  )
}

export function FormularioRepasse({
  empreendimentoId,
  permutaId,
  hoje,
}: {
  empreendimentoId: string
  permutaId: string
  hoje: string
}) {
  const f = useForm(repassar.bind(null, empreendimentoId, permutaId))
  const p = `rep-${permutaId.slice(0, 8)}`
  return (
    <form ref={f.ref} action={f.despachar} className="flex flex-col gap-2" noValidate>
      <Mensagens estado={f.estado} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Campo id={`${p}-data`} rotulo="Data do repasse" erro={f.er.data}>
          <Entrada
            {...aria(p, 'data', f.er.data)}
            type="date"
            max={hoje}
            defaultValue={f.v('data') ?? hoje}
          />
        </Campo>
        <Campo id={`${p}-valor`} rotulo="Valor repassado (R$)" erro={f.er.valor}>
          <Entrada
            {...aria(p, 'valor', f.er.valor)}
            inputMode="decimal"
            defaultValue={f.v('valor')}
          />
        </Campo>
        <Campo id={`${p}-observacao`} rotulo="Observação">
          <Entrada id={`${p}-observacao`} name="observacao" defaultValue={f.v('observacao')} />
        </Campo>
      </div>
      <Button type="submit" size="sm" disabled={f.enviando} className="self-start">
        Registrar repasse
      </Button>
    </form>
  )
}

export function FormularioEstornoRepasse({
  empreendimentoId,
  repasseId,
}: {
  empreendimentoId: string
  repasseId: string
}) {
  const f = useForm(estornar.bind(null, empreendimentoId, repasseId))
  return (
    <form action={f.despachar} className="flex flex-wrap items-center gap-2" noValidate>
      <Entrada
        name="motivo"
        aria-label="Motivo do estorno do repasse"
        placeholder="Motivo"
        className="h-8 w-36"
      />
      <Button type="submit" size="sm" variant="outline" disabled={f.enviando}>
        Estornar
      </Button>
      {f.estado.erro && (
        <span role="alert" className="text-xs text-destructive">
          {f.estado.erro}
        </span>
      )}
    </form>
  )
}
