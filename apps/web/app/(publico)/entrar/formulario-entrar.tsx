'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada } from '@/components/ui/formulario'
import { type EstadoAuth, entrar, enviarLinkMagico } from '../acoes'

export function FormularioEntrar({ proximo }: { proximo?: string }) {
  const [estado, acaoEntrar, entrando] = useActionState<EstadoAuth, FormData>(entrar, {})
  const [estadoLink, acaoLink, enviando] = useActionState<EstadoAuth, FormData>(
    enviarLinkMagico,
    {},
  )

  return (
    <form className="flex flex-col gap-4" action={acaoEntrar}>
      <input type="hidden" name="proximo" value={proximo ?? ''} />
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {estadoLink.erro && <Alerta>{estadoLink.erro}</Alerta>}
      {estadoLink.mensagem && <Alerta tipo="sucesso">{estadoLink.mensagem}</Alerta>}
      <Campo id="email" rotulo="E-mail">
        <Entrada
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={estado.email}
        />
      </Campo>
      <Campo id="senha" rotulo="Senha">
        <Entrada id="senha" name="senha" type="password" autoComplete="current-password" />
      </Campo>
      <Button type="submit" size="lg" disabled={entrando}>
        {entrando ? 'Entrando…' : 'Entrar'}
      </Button>
      <Button type="submit" variant="outline" formAction={acaoLink} disabled={enviando}>
        {enviando ? 'Enviando…' : 'Receber link de acesso por e-mail'}
      </Button>
    </form>
  )
}
