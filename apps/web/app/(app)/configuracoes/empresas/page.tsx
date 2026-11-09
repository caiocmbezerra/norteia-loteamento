import type { Metadata } from 'next'
import Link from 'next/link'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { FormularioEstrutura } from './formulario-estrutura'

export const metadata: Metadata = { title: 'Empresas e SPEs' }

const cnpj = (v: string | null) =>
  v ? v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : 'sem CNPJ'

export default async function Empresas() {
  const ctx = await exigirContexto()
  const { data: empresas } = await ctx.db
    .from('empresas')
    .select('id, razao_social, cnpj, spes(id, razao_social, cnpj, empreendimentos(id))')
    .eq('tenant_id', ctx.tenant.id)
    .order('criado_em')
  return (
    <>
      <TituloPagina
        titulo="Empresas e SPEs"
        subtitulo="Cada empreendimento pertence a uma SPE; cada SPE a uma empresa."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-4">
          {(empresas ?? []).map((e) => (
            <Cartao key={e.id} className="flex flex-col gap-3">
              <div>
                <h2 className="font-semibold">{e.razao_social}</h2>
                <p className="text-sm text-muted-foreground">Empresa · {cnpj(e.cnpj)}</p>
              </div>
              <ul className="flex flex-col gap-2">
                {e.spes.map((s) => (
                  <li key={s.id} className="rounded-lg border bg-background px-3 py-2 text-sm">
                    <Link
                      href={`/spes/${s.id}`}
                      className="font-medium text-primary underline underline-offset-4"
                    >
                      {s.razao_social}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      SPE · {cnpj(s.cnpj)} · {s.empreendimentos.length} empreendimento(s)
                    </span>
                  </li>
                ))}
              </ul>
            </Cartao>
          ))}
        </div>
        {temPapel(ctx, 'dono', 'financeiro') && (
          <Cartao className="flex h-fit flex-col gap-3">
            <h2 className="font-semibold">Adicionar</h2>
            <FormularioEstrutura
              empresas={(empresas ?? []).map((e) => ({ id: e.id, razao_social: e.razao_social }))}
            />
          </Cartao>
        )}
      </div>
    </>
  )
}
