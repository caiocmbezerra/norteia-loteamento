import { carregarMeuPortal, temPortal } from '@norteia/aplicacao'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { clientesDoUsuario, exigirUsuario } from '@/lib/contexto'
import { hojeSaoPaulo, mesAtualSaoPaulo } from '@/lib/datas'
import { FormularioComecar } from './formulario-comecar'

export const metadata: Metadata = { title: 'Começar' }

export default async function PaginaComecar() {
  const { db, usuario } = await exigirUsuario()
  if ((await clientesDoUsuario()).length > 0) redirect('/painel')
  // Convite de portal pendente para o próprio e-mail (entrou sem o link): aceita e vai ao portal.
  const { data: aceitos } = await db.rpc('aceitar_convites_pendentes')
  // Comprador, sócio ou permutante convidado: vai direto para o portal.
  if ((aceitos ?? 0) > 0 || temPortal(await carregarMeuPortal(db, hojeSaoPaulo())))
    redirect('/portal')
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
      <p className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
        É comprador, sócio ou permutante? Peça à loteadora um convite para o portal, enviado para{' '}
        <strong>{usuario.email}</strong>, e abra o link do e-mail. Esta tela é para cadastrar uma
        loteadora.
      </p>
      <FormularioComecar mesPadrao={mesAtualSaoPaulo()} />
    </main>
  )
}
