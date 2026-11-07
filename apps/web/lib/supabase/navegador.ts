'use client'
import type { Database } from '@norteia/db'
import { createBrowserClient } from '@supabase/ssr'
import { configSupabase } from '@/lib/env'

export function clienteNavegador() {
  const { url, chave } = configSupabase()
  return createBrowserClient<Database>(url, chave)
}
