'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { novoFornecedor } from './acoes'

export function FormularioFornecedor() {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(novoFornecedor, {})
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado.ok) ref.current?.reset()
  }, [estado])
  const er = estado.erros ?? {}
  const v = (k: string) => (estado.ok ? undefined : estado.valores?.[k])
  return (
    <form ref={ref} action={acao} className="flex flex-col gap-3" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {estado.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
      <Campo id="nome" rotulo="Nome" erro={er.nome}>
        <Entrada {...ariaCampo('nome', er.nome)} defaultValue={v('nome')} />
      </Campo>
      <Campo id="documento" rotulo="CPF ou CNPJ (opcional)" erro={er.documento}>
        <Entrada
          {...ariaCampo('documento', er.documento)}
          inputMode="numeric"
          defaultValue={v('documento')}
        />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="email" rotulo="E-mail (opcional)" erro={er.email}>
          <Entrada {...ariaCampo('email', er.email)} type="email" defaultValue={v('email')} />
        </Campo>
        <Campo id="telefone" rotulo="Telefone (opcional)">
          <Entrada id="telefone" name="telefone" inputMode="tel" defaultValue={v('telefone')} />
        </Campo>
      </div>
      <Button type="submit" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Cadastrar fornecedor'}
      </Button>
    </form>
  )
}
