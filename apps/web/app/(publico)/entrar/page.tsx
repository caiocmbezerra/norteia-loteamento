import type { Metadata } from 'next'
import Link from 'next/link'
import { destinoSeguro } from '@/lib/redirecionamento'
import { FormularioEntrar } from './formulario-entrar'

export const metadata: Metadata = { title: 'Entrar' }

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string; erro?: string }>
}) {
  const { proximo, erro } = await searchParams
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
        <p className="text-sm text-muted-foreground">Acesse a gestão dos seus loteamentos.</p>
      </div>
      {erro === 'link' && (
        <p role="alert" className="text-sm text-destructive">
          O link de acesso expirou ou já foi usado. Peça outro.
        </p>
      )}
      <FormularioEntrar proximo={destinoSeguro(proximo)} />
      <p className="text-sm text-muted-foreground">
        Ainda não tem conta?{' '}
        <Link
          className="font-medium text-primary underline underline-offset-4"
          href={`/cadastrar${proximo ? `?proximo=${encodeURIComponent(proximo)}` : ''}`}
        >
          Criar conta
        </Link>
      </p>
    </div>
  )
}
