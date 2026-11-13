'use client'

import { useActionState } from 'react'
import { EntradaSenha } from '@/components/entrada-senha'
import { Button } from '@/components/ui/button'
import { Alerta, Campo } from '@/components/ui/formulario'
import { type EstadoAuth, redefinirSenha } from '../acoes'

export function FormularioRedefinir() {
  const [estado, acao, salvando] = useActionState<EstadoAuth, FormData>(redefinirSenha, {})
  return (
    <form action={acao} className="flex flex-col gap-4">
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <Campo id="senha" rotulo="Nova senha" ajuda="Mínimo de 8 caracteres.">
        <EntradaSenha
          id="senha"
          name="senha"
          autoComplete="new-password"
          minLength={8}
          required
          aria-describedby="senha-ajuda"
        />
      </Campo>
      <Campo id="confirmacao" rotulo="Repita a nova senha">
        <EntradaSenha id="confirmacao" name="confirmacao" autoComplete="new-password" required />
      </Campo>
      <Button type="submit" size="lg" disabled={salvando}>
        {salvando ? 'Salvando…' : 'Salvar nova senha'}
      </Button>
    </form>
  )
}
