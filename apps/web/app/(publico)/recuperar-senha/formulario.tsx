'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada } from '@/components/ui/formulario'
import { type EstadoAuth, recuperarSenha } from '../acoes'

export function FormularioRecuperar() {
  const [estado, acao, enviando] = useActionState<EstadoAuth, FormData>(recuperarSenha, {})
  return (
    <form action={acao} className="flex flex-col gap-4">
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {estado.mensagem && <Alerta tipo="sucesso">{estado.mensagem}</Alerta>}
      <Campo id="email" rotulo="E-mail">
        <Entrada
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
        />
      </Campo>
      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Enviar link para nova senha'}
      </Button>
    </form>
  )
}
