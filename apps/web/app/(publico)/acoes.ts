'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { destinoSeguro } from '@/lib/redirecionamento'
import { clienteServidor } from '@/lib/supabase/servidor'

export interface EstadoAuth {
  erro?: string
  mensagem?: string
  email?: string
}

const email = z.email('Informe um e-mail válido.').transform((v) => v.trim().toLowerCase())
const senha = z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.')

async function origem() {
  const h = await headers()
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
}

export async function entrar(_: EstadoAuth, form: FormData): Promise<EstadoAuth> {
  const dados = z.object({ email, senha: z.string().min(1, 'Informe a senha.') }).safeParse({
    email: form.get('email'),
    senha: form.get('senha'),
  })
  if (!dados.success)
    return { erro: dados.error.issues[0]!.message, email: String(form.get('email') ?? '') }

  const db = await clienteServidor()
  const { error } = await db.auth.signInWithPassword({
    email: dados.data.email,
    password: dados.data.senha,
  })
  if (error) return { erro: 'E-mail ou senha incorretos.', email: dados.data.email }
  redirect(destinoSeguro(form.get('proximo')))
}

export async function enviarLinkMagico(_: EstadoAuth, form: FormData): Promise<EstadoAuth> {
  const dados = email.safeParse(form.get('email'))
  if (!dados.success) return { erro: dados.error.issues[0]!.message }
  const db = await clienteServidor()
  const proximo = destinoSeguro(form.get('proximo'))
  const { error } = await db.auth.signInWithOtp({
    email: dados.data,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${await origem()}/auth/confirmar?proximo=${encodeURIComponent(proximo)}`,
    },
  })
  // Mesma resposta exista ou não a conta (não revela quem é cliente).
  if (error && error.status !== 400 && error.status !== 422) {
    return { erro: 'Não foi possível enviar o link agora. Tente novamente em instantes.' }
  }
  return { mensagem: `Se houver uma conta para ${dados.data}, enviamos um link de acesso.` }
}

export async function cadastrar(_: EstadoAuth, form: FormData): Promise<EstadoAuth> {
  const dados = z
    .object({ nome: z.string().trim().min(2, 'Informe seu nome.'), email, senha })
    .safeParse({ nome: form.get('nome'), email: form.get('email'), senha: form.get('senha') })
  if (!dados.success)
    return { erro: dados.error.issues[0]!.message, email: String(form.get('email') ?? '') }

  const db = await clienteServidor()
  const proximo = destinoSeguro(form.get('proximo'), '/comecar')
  const { data, error } = await db.auth.signUp({
    email: dados.data.email,
    password: dados.data.senha,
    options: {
      data: { nome: dados.data.nome },
      emailRedirectTo: `${await origem()}/auth/confirmar?proximo=${encodeURIComponent(proximo)}`,
    },
  })
  if (error) {
    return {
      erro:
        error.code === 'weak_password'
          ? 'Escolha uma senha mais forte.'
          : 'Não foi possível criar a conta.',
      email: dados.data.email,
    }
  }
  if (!data.session) {
    return { mensagem: `Enviamos um e-mail para ${dados.data.email}. Confirme para continuar.` }
  }
  redirect(proximo)
}
