// Tipos do banco (gerados por `pnpm db:tipos` a partir das migrations) e atalhos.
export type { Database, Json } from './tipos.gerados'
import type { Database } from './tipos.gerados'

type Public = Database['public']

/** Linha de uma tabela: `Linha<'lotes'>`. */
export type Linha<T extends keyof Public['Tables']> = Public['Tables'][T]['Row']
/** Dados para inserir: `NovaLinha<'lotes'>`. */
export type NovaLinha<T extends keyof Public['Tables']> = Public['Tables'][T]['Insert']
/** Dados para alterar: `Alteracao<'lotes'>`. */
export type Alteracao<T extends keyof Public['Tables']> = Public['Tables'][T]['Update']
/** Valores de um enum: `Enum<'lote_status'>`. */
export type Enum<T extends keyof Public['Enums']> = Public['Enums'][T]
