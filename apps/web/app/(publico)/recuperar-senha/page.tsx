import type { Metadata } from 'next'
import Link from 'next/link'
import { FormularioRecuperar } from './formulario'

export const metadata: Metadata = { title: 'Esqueci minha senha' }

export default function PaginaRecuperarSenha() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Esqueci minha senha</h1>
        <p className="text-sm text-muted-foreground">
          Informe o e-mail da sua conta. Enviamos um link para você criar uma nova senha.
        </p>
      </div>
      <FormularioRecuperar />
      <Link href="/entrar" className="text-sm text-primary underline underline-offset-4">
        Voltar para entrar
      </Link>
    </div>
  )
}
