'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { type EstadoAsaas, desativar, salvarAsaas } from './acoes'

export function FormularioAsaas({
  ambienteAtual,
  urlWebhook,
}: {
  ambienteAtual: string | null
  urlWebhook: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoAsaas, FormData>(salvarAsaas, {})
  const er = estado.erros ?? {}
  return (
    <div className="flex flex-col gap-4">
      {estado.token ? (
        <Alerta tipo="sucesso">
          <span className="block font-medium">{estado.ok}</span>
          <span className="mt-2 block">
            Agora, no painel do Asaas (Integrações → Webhooks), crie um webhook de{' '}
            <strong>cobranças</strong> com:
          </span>
          <span className="mt-2 block">URL:</span>
          <code className="block break-all rounded bg-background p-2 text-xs">{urlWebhook}</code>
          <span className="mt-2 block">Token de autenticação (aparece só agora):</span>
          <code
            className="block break-all rounded bg-background p-2 text-xs"
            data-testid="token-webhook"
          >
            {estado.token}
          </code>
        </Alerta>
      ) : (
        estado.erro && <Alerta>{estado.erro}</Alerta>
      )}
      <form action={acao} className="flex flex-col gap-3" noValidate>
        <Campo id="ambiente" rotulo="Ambiente">
          <Selecao
            id="ambiente"
            name="ambiente"
            defaultValue={estado.valores?.ambiente ?? ambienteAtual ?? 'sandbox'}
          >
            <option value="sandbox">Sandbox (testes)</option>
            <option value="producao">Produção</option>
          </Selecao>
        </Campo>
        <Campo
          id="chave"
          rotulo="Chave da API do Asaas"
          ajuda="Em Integrações → Chaves de API. Ela é conferida no Asaas e guardada cifrada; ninguém consegue vê-la depois."
          erro={er.chave}
        >
          <Entrada
            {...ariaCampo('chave', er.chave, 'ajuda')}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="$aact_hmlg_..."
          />
        </Campo>
        <Button type="submit" disabled={enviando} className="self-start">
          {enviando ? 'Conferindo no Asaas…' : ambienteAtual ? 'Trocar chave' : 'Conectar Asaas'}
        </Button>
      </form>
    </div>
  )
}

export function FormularioDesativarAsaas() {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(desativar, {})
  return (
    <form action={acao} className="flex flex-col gap-2">
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <Button type="submit" variant="outline" size="sm" disabled={enviando} className="self-start">
        Desativar integração
      </Button>
    </form>
  )
}
