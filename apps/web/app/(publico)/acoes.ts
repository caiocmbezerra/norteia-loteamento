'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { mensagemErroCadastro } from '@/lib/erros-auth'
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
  if (error) return { erro: mensagemErroCadastro(error.code), email: dados.data.email }
  if (!data.session) {
    return { mensagem: `Enviamos um e-mail para ${dados.data.email}. Confirme para continuar.` }
  }
  redirect(proximo)
}

/** Login com o Google: o Supabase devolve a URL de consentimento; a volta passa por /auth/confirmar. */
export async function entrarComGoogle(_: EstadoAuth, form: FormData): Promise<EstadoAuth> {
  const proximo = destinoSeguro(form.get('proximo'))
  const db = await clienteServidor()
  const { data, error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${await origem()}/auth/confirmar?proximo=${encodeURIComponent(proximo)}`,
    },
  })
  if (error || !data.url) return { erro: 'Não foi possível abrir o login do Google agora.' }
  redirect(data.url)
}

/** Esqueci a senha: envia o link de redefinição (mesma resposta exista ou não a conta). */
export async function recuperarSenha(_: EstadoAuth, form: FormData): Promise<EstadoAuth> {
  const dados = email.safeParse(form.get('email'))
  if (!dados.success) return { erro: dados.error.issues[0]!.message }
  const db = await clienteServidor()
  const { error } = await db.auth.resetPasswordForEmail(dados.data, {
    redirectTo: `${await origem()}/auth/confirmar?proximo=${encodeURIComponent('/redefinir-senha')}`,
  })
  if (error && error.status === 429) {
    return { erro: 'Muitos pedidos seguidos. Aguarde um minuto e tente de novo.' }
  }
  return {
    mensagem: `Se houver uma conta para ${dados.data}, enviamos um link para criar uma nova senha. Confira também o spam.`,
  }
}

/** Nova senha, depois de entrar pelo link de redefinição. */
export async function redefinirSenha(_: EstadoAuth, form: FormData): Promise<EstadoAuth> {
  const dados = z
    .object({ senha, confirmacao: z.string() })
    .refine((d) => d.senha === d.confirmacao, { message: 'As senhas não conferem.' })
    .safeParse({ senha: form.get('senha'), confirmacao: form.get('confirmacao') })
  if (!dados.success) return { erro: dados.error.issues[0]!.message }
  const db = await clienteServidor()
  const { error } = await db.auth.updateUser({ password: dados.data.senha })
  if (error) {
    // Só sessão ausente ou vencida significa link expirado; o resto é sobre a senha escolhida.
    const expirou =
      error.code === 'session_not_found' ||
      error.code === 'session_expired' ||
      error.status === 401 ||
      error.status === 403
    return {
      erro:
        error.code === 'same_password'
          ? 'A nova senha precisa ser diferente da atual.'
          : error.code === 'weak_password' || error.status === 422
            ? 'Essa senha é muito comum ou já apareceu em vazamentos de dados na internet. Escolha outra, misturando letras, números e símbolos.'
            : expirou
              ? 'O link expirou. Peça outro em "Esqueci minha senha".'
              : 'Não foi possível salvar a senha agora. Tente de novo.',
    }
  }
  redirect('/painel?senha=1')
}
