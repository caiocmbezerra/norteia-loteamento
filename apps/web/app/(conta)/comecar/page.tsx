import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { clientesDoUsuario, exigirUsuario } from '@/lib/contexto'
import { mesAtualSaoPaulo } from '@/lib/datas'
import { FormularioComecar } from './formulario-comecar'

export const metadata: Metadata = { title: 'Começar' }

export default async function PaginaComecar() {
  const { usuario } = await exigirUsuario()
  if ((await clientesDoUsuario()).length > 0) redirect('/painel')
  const primeiroNome = usuario.nome.split(' ')[0]
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          NorteIA Loteamento
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {primeiroNome ? `${primeiroNome}, vamos` : 'Vamos'} cadastrar seu loteamento
        </h1>
        <p className="text-sm text-muted-foreground">
          Uma tela só. Empresa e SPE são criadas automaticamente; você detalha depois, se precisar.
        </p>
      </div>
      <FormularioComecar mesPadrao={mesAtualSaoPaulo()} />
    </main>
  )
}
