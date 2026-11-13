import type { Metadata } from 'next'
import Link from 'next/link'
import { BotaoGoogle } from '@/components/botao-google'
import { googleLigado } from '@/lib/provedores-login'
import { destinoSeguro } from '@/lib/redirecionamento'
import { FormularioCadastrar } from './formulario-cadastrar'

export const metadata: Metadata = { title: 'Criar conta' }

export default async function PaginaCadastrar({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string }>
}) {
  const [{ proximo }, google] = await Promise.all([searchParams, googleLigado()])
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Criar conta</h1>
        <p className="text-sm text-muted-foreground">
          Em poucos minutos seu loteamento estará organizado.
        </p>
      </div>
      {google && (
        <>
          <BotaoGoogle proximo={destinoSeguro(proximo, '/comecar')} />
          <p className="text-center text-xs text-muted-foreground">ou com e-mail e senha</p>
        </>
      )}
      <FormularioCadastrar proximo={proximo} />
      <p className="text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link
          className="font-medium text-primary underline underline-offset-4"
          href={`/entrar${proximo ? `?proximo=${encodeURIComponent(proximo)}` : ''}`}
        >
          Entrar
        </Link>
      </p>
    </div>
  )
}
