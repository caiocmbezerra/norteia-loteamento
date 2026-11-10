import type { Metadata } from 'next'
import Link from 'next/link'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto } from '@/lib/contexto'

export const metadata: Metadata = { title: 'Configurações' }

const SECOES = [
  {
    href: '/configuracoes/implantacao',
    titulo: 'Implantação',
    texto: 'O que já está pronto na sua loteadora e o que falta configurar.',
  },
  {
    href: '/configuracoes/membros',
    titulo: 'Membros e convites',
    texto: 'Quem acessa, com qual papel e em qual escopo.',
  },
  {
    href: '/configuracoes/empresas',
    titulo: 'Empresas e SPEs',
    texto: 'Estrutura societária dos empreendimentos.',
  },
  {
    href: '/configuracoes/parametros',
    titulo: 'Parâmetros',
    texto: 'Multa, juros, reajuste, tributos e regras comerciais da sua loteadora.',
  },
  {
    href: '/configuracoes/centros-custo',
    titulo: 'Centros de custo',
    texto: 'O plano de custos: centros padrão de loteamento e os seus próprios.',
  },
  {
    href: '/configuracoes/modelos',
    titulo: 'Modelos de documentos',
    texto: 'Contrato, termo de quitação e aditivos em Word, com o seu texto.',
  },
  {
    href: '/configuracoes/contabilidade',
    titulo: 'Contabilidade',
    texto: 'Plano de contas, regras de lançamento e formato do arquivo para o seu contador.',
  },
  {
    href: '/configuracoes/integracoes',
    titulo: 'Integrações',
    texto: 'Boleto e Pix pelo Asaas, com baixa automática.',
  },
  {
    href: '/configuracoes/auditoria',
    titulo: 'Auditoria',
    texto: 'Quem alterou o quê, quando, antes e depois.',
  },
]

export default async function Configuracoes() {
  const ctx = await exigirContexto()
  return (
    <>
      <TituloPagina
        titulo="Configurações"
        subtitulo={`${ctx.tenant.nome} · plano ${ctx.tenant.plano}`}
      />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SECOES.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="block rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Cartao className="h-full transition-colors hover:border-primary/50">
                <h2 className="font-semibold">{s.titulo}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{s.texto}</p>
              </Cartao>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
