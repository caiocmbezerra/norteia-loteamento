'use client'

import { useActionState } from 'react'
import { EntradaSenha } from '@/components/entrada-senha'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada } from '@/components/ui/formulario'
import { type EstadoAuth, cadastrar } from '../acoes'

export function FormularioCadastrar({ proximo }: { proximo?: string | undefined }) {
  const [estado, acao, enviando] = useActionState<EstadoAuth, FormData>(cadastrar, {})
  if (estado.mensagem) return <Alerta tipo="sucesso">{estado.mensagem}</Alerta>

  return (
    <form className="flex flex-col gap-4" action={acao}>
      <input type="hidden" name="proximo" value={proximo ?? ''} />
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <Campo id="nome" rotulo="Seu nome">
        <Entrada id="nome" name="nome" autoComplete="name" required />
      </Campo>
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
      <Campo id="senha" rotulo="Senha" ajuda="Mínimo de 8 caracteres.">
        <EntradaSenha
          id="senha"
          name="senha"
          autoComplete="new-password"
          minLength={8}
          required
          aria-describedby="senha-ajuda"
        />
      </Campo>
      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? 'Criando conta…' : 'Criar conta'}
      </Button>
    </form>
  )
}
