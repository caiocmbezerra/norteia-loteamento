import { carregarIntegracaoAsaas } from '@norteia/aplicacao'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { FormularioAsaas, FormularioDesativarAsaas } from './formularios'

export const metadata: Metadata = { title: 'Integrações' }

const quando = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

export default async function PaginaIntegracoes() {
  const ctx = await exigirContexto()
  if (!temPapel(ctx, 'dono')) redirect('/configuracoes')
  const integracao = await carregarIntegracaoAsaas(ctx.db, ctx.tenant.id)
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const protocolo = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const urlWebhook = `${protocolo}://${host}/api/webhooks/asaas/${ctx.tenant.id}`

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Link href="/configuracoes" className="text-sm text-muted-foreground hover:underline">
        ← Configurações
      </Link>
      <TituloPagina
        titulo="Integrações"
        subtitulo="Cobrança por boleto e Pix na conta Asaas da sua empresa."
      />
      <Cartao className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Asaas</h2>
          <span className="text-sm text-muted-foreground">
            {integracao
              ? `${integracao.ativo ? 'Ativa' : 'Desativada'} · ${integracao.ambiente === 'sandbox' ? 'sandbox' : 'produção'}${
                  integracao.ultimoWebhookEm
                    ? ` · último aviso ${quando.format(new Date(integracao.ultimoWebhookEm))}`
                    : ' · nenhum aviso recebido ainda'
                }`
              : 'Não configurada'}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          As cobranças saem da sua conta Asaas e o dinheiro cai nela. Quando o comprador paga, o
          Asaas avisa e a parcela é baixada sozinha; uma conferência a cada 6 horas cobre avisos
          perdidos.
        </p>
        <FormularioAsaas ambienteAtual={integracao?.ambiente ?? null} urlWebhook={urlWebhook} />
        {integracao?.ativo && <FormularioDesativarAsaas />}
      </Cartao>
    </div>
  )
}
