'use server'

import { clienteServidor } from '@/lib/supabase/servidor'

export interface EstadoInteresse {
  ok?: boolean
  erro?: string
  valores?: Record<string, string>
}

/** "Tenho interesse" da vitrine pública (sem login): vira lead da loteadora (D-118). */
export async function registrarInteresse(
  slug: string,
  _: EstadoInteresse,
  form: FormData,
): Promise<EstadoInteresse> {
  const v = (k: string) => String(form.get(k) ?? '').trim()
  const valores = {
    nome: v('nome'),
    telefone: v('telefone'),
    email: v('email'),
    lote: v('lote'),
    mensagem: v('mensagem'),
  }
  // Campo invisível: robôs preenchem, pessoas não.
  if (v('site')) return { ok: true }
  const db = await clienteServidor()
  const { error } = await db.rpc('registrar_interesse', {
    p_slug: slug,
    p_nome: valores.nome,
    p_email: valores.email,
    p_telefone: valores.telefone,
    // Lote opcional: a função aceita nulo (o tipo gerado não sabe disso).
    p_lote: (/^[0-9a-f-]{36}$/.test(valores.lote) ? valores.lote : null) as unknown as string,
    p_mensagem: valores.mensagem.slice(0, 1000),
    p_consentimento: form.get('consentimento') === 'sim',
  })
  if (error) {
    return {
      erro:
        error.code === '23514' ? error.message : 'Não foi possível enviar agora. Tente de novo.',
      valores,
    }
  }
  return { ok: true }
}
