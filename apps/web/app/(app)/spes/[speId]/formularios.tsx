'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { estornar, movimento, novoSocio, participacao } from './acoes'

type Opcao = { id: string; nome: string }

function aria(p: string, nome: string, erro?: string) {
  return { ...ariaCampo(`${p}-${nome}`, erro), name: nome }
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
function SelecaoSocio({
  p,
  f,
  socios,
}: {
  p: string
  f: ReturnType<typeof useForm>
  socios: Opcao[]
}) {
  return (
    <Campo id={`${p}-socio`} rotulo="Sócio" erro={f.er.socio}>
      <Selecao
        key={f.v('socio') ?? ''}
        {...aria(p, 'socio', f.er.socio)}
        defaultValue={f.v('socio') ?? ''}
      >
        <option value="">Escolha…</option>
        {socios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nome}
          </option>
        ))}
      </Selecao>
    </Campo>
  )
}

export function FormularioSocio({ speId }: { speId: string }) {
  const f = useForm(novoSocio.bind(null, speId))
  return (
    <form ref={f.ref} action={f.despachar} className="flex flex-col gap-3" noValidate>
      <Mensagens estado={f.estado} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Campo id="soc-nome" rotulo="Nome do sócio" erro={f.er.nome}>
          <Entrada {...aria('soc', 'nome', f.er.nome)} defaultValue={f.v('nome')} />
        </Campo>
        <Campo id="soc-documento" rotulo="CPF ou CNPJ" erro={f.er.documento}>
          <Entrada
            {...aria('soc', 'documento', f.er.documento)}
            inputMode="numeric"
            defaultValue={f.v('documento')}
          />
        </Campo>
        <Campo id="soc-email" rotulo="E-mail" erro={f.er.email}>
          <Entrada {...aria('soc', 'email', f.er.email)} type="email" defaultValue={f.v('email')} />
        </Campo>
      </div>
      <Button type="submit" size="sm" disabled={f.enviando} className="self-start">
        Cadastrar sócio
      </Button>
    </form>
  )
}

export function FormularioParticipacao({
  speId,
  socios,
  hoje,
}: {
  speId: string
  socios: Opcao[]
  hoje: string
}) {
  const f = useForm(participacao.bind(null, speId))
  return (
    <form ref={f.ref} action={f.despachar} className="flex flex-col gap-3" noValidate>
      <Mensagens estado={f.estado} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SelecaoSocio p="par" f={f} socios={socios} />
        <Campo id="par-percentual" rotulo="Participação (%)" erro={f.er.percentual}>
          <Entrada
            {...aria('par', 'percentual', f.er.percentual)}
            inputMode="decimal"
            defaultValue={f.v('percentual')}
          />
        </Campo>
        <Campo id="par-inicio" rotulo="A partir de" erro={f.er.inicio}>
          <Entrada
            {...aria('par', 'inicio', f.er.inicio)}
            type="date"
            defaultValue={f.v('inicio') ?? hoje}
          />
        </Campo>
        <Campo id="par-motivo" rotulo="Motivo" erro={f.er.motivo}>
          <Entrada
            {...aria('par', 'motivo', f.er.motivo)}
            defaultValue={f.v('motivo') ?? 'Contrato social'}
          />
        </Campo>
      </div>
      <Button type="submit" size="sm" disabled={f.enviando} className="self-start">
        Registrar participação
      </Button>
    </form>
  )
}

export function FormularioMovimento({
  speId,
  socios,
  hoje,
}: {
  speId: string
  socios: Opcao[]
  hoje: string
}) {
  const f = useForm(movimento.bind(null, speId))
  return (
    <form ref={f.ref} action={f.despachar} className="flex flex-col gap-3" noValidate>
      <Mensagens estado={f.estado} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SelecaoSocio p="mov" f={f} socios={socios} />
        <Campo id="mov-tipo" rotulo="Tipo">
          <Selecao id="mov-tipo" name="tipo" defaultValue={f.v('tipo') ?? 'aporte'}>
            <option value="aporte">Aporte</option>
            <option value="mutuo">Mútuo (empréstimo do sócio)</option>
            <option value="devolucao_mutuo">Devolução de mútuo</option>
            <option value="distribuicao">Distribuição</option>
          </Selecao>
        </Campo>
        <Campo id="mov-data" rotulo="Data" erro={f.er.data}>
          <Entrada
            {...aria('mov', 'data', f.er.data)}
            type="date"
            max={hoje}
            defaultValue={f.v('data') ?? hoje}
          />
        </Campo>
        <Campo id="mov-valor" rotulo="Valor (R$)" erro={f.er.valor}>
          <Entrada
            {...aria('mov', 'valor', f.er.valor)}
            inputMode="decimal"
            defaultValue={f.v('valor')}
          />
        </Campo>
        <Campo id="mov-observacao" rotulo="Observação">
          <Entrada id="mov-observacao" name="observacao" defaultValue={f.v('observacao')} />
        </Campo>
      </div>
      <Button type="submit" size="sm" disabled={f.enviando} className="self-start">
        Registrar movimento
      </Button>
    </form>
  )
}

export function FormularioEstornoMovimento({
  speId,
  movimentoId,
}: {
  speId: string
  movimentoId: string
}) {
  const f = useForm(estornar.bind(null, speId, movimentoId))
  return (
    <form action={f.despachar} className="flex flex-wrap items-center gap-2" noValidate>
      <Entrada
        name="motivo"
        aria-label="Motivo do estorno do movimento"
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
