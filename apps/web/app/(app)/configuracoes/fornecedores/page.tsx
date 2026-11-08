import type { Metadata } from 'next'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { FormularioFornecedor } from './formulario'

export const metadata: Metadata = { title: 'Fornecedores' }

const documento = (d: string | null) =>
  !d
    ? 'sem documento'
    : d.length === 14
      ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
      : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')

export default async function Fornecedores() {
  const ctx = await exigirContexto()
  const { data: fornecedores } = await ctx.db
    .from('fornecedores')
    .select('id, nome, documento, email, telefone')
    .eq('tenant_id', ctx.tenant.id)
    .order('nome')
  return (
    <>
      <TituloPagina
        titulo="Fornecedores"
        subtitulo="Empreiteiras, prestadores e fornecedores de materiais."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <Cartao>
          {(fornecedores ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum fornecedor cadastrado.</p>
          )}
          <ul className="divide-y">
            {(fornecedores ?? []).map((f) => (
              <li key={f.id} className="py-3 text-sm">
                <p className="font-medium">{f.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {[documento(f.documento), f.email, f.telefone].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </Cartao>
        {temPapel(ctx, 'dono', 'financeiro', 'engenharia') && (
          <Cartao className="flex h-fit flex-col gap-3">
            <h2 className="font-semibold">Novo fornecedor</h2>
            <FormularioFornecedor />
          </Cartao>
        )}
      </div>
    </>
  )
}
