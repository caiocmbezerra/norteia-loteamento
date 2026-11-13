'use server'

import { convidarParaPortal, enviarConvitePortal, criarDemonstracao } from '@norteia/aplicacao'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { COOKIE_TENANT, clientesDoUsuario, exigirContexto } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'

export async function trocarCliente(form: FormData) {
  const id = String(form.get('tenant') ?? '')
  const clientes = await clientesDoUsuario()
  if (clientes.some((c) => c.id === id)) {
    ;(await cookies()).set(COOKIE_TENANT, id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  redirect('/painel')
}

/** Empreendimento de demonstração com o caso de referência (Fase 2). */
export async function criarEmpreendimentoDemonstracao() {
  const ctx = await exigirContexto()
  const id = await criarDemonstracao(ctx.db, ctx.tenant.id, hojeSaoPaulo())
  redirect(`/empreendimentos/${id}`)
}

/** Convite para o portal do comprador, sócio ou permutante. Devolve o link em `ok`. */
export async function convidarPortal(
  tipo: 'comprador' | 'socio' | 'permutante',
  alvoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const { email } = z
      .object({
        email: z.email('Informe um e-mail válido.').transform((v) => v.trim().toLowerCase()),
      })
      .parse(valoresDoFormulario(form))
    const token = await convidarParaPortal(ctx.db, ctx.tenant.id, tipo, alvoId, email)
    const envio = await enviarConvitePortal(ctx.db, token).catch(() => 'falhou')
    const h = await headers()
    return {
      ok: `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}/portal-convite/${token}`,
      detalhe:
        envio === 'enviado'
          ? `Convite enviado por e-mail para ${email}.`
          : 'Não foi possível enviar o e-mail agora; envie o link abaixo por WhatsApp ou e-mail.',
    }
  } catch (e) {
    return estadoDeErro(e, form)
  }
}
