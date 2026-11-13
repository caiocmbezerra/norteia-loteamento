import type { Metadata } from 'next'
import { exigirUsuario } from '@/lib/contexto'
import { FormularioRedefinir } from './formulario'

export const metadata: Metadata = { title: 'Nova senha' }

/** Aberta pelo link de redefinição (sessão criada em /auth/confirmar) ou por quem está logado. */
export default async function PaginaRedefinirSenha() {
  const { usuario } = await exigirUsuario()
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Nova senha</h1>
        <p className="text-sm text-muted-foreground">Conta {usuario.email}.</p>
      </div>
      <FormularioRedefinir />
    </div>
  )
}
