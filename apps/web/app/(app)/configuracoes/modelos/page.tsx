import { MARCADORES, carregarModelos } from '@norteia/aplicacao'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { FormularioModelo } from './formularios'

export const metadata: Metadata = { title: 'Modelos de documentos' }

const quando = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

export default async function PaginaModelos() {
  const ctx = await exigirContexto()
  const modelos = await carregarModelos(ctx.db, ctx.tenant.id)
  const podeEditar = temPapel(ctx, 'dono')
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/configuracoes" className="text-sm text-muted-foreground hover:underline">
        ← Configurações
      </Link>
      <TituloPagina
        titulo="Modelos de documentos"
        subtitulo="Contrato, termo de quitação e aditivos em Word, com o texto do seu advogado. O sistema preenche os dados de cada contrato."
      />
      <ol className="list-decimal pl-5 text-sm text-muted-foreground">
        <li>Baixe o modelo em uso e edite no Word mantendo os marcadores entre chaves.</li>
        <li>Envie o arquivo: o sistema confere se ele preenche sem erro antes de publicar.</li>
        <li>
          Os documentos dos contratos passam a sair com o seu texto; versões antigas ficam
          guardadas.
        </li>
      </ol>
      {modelos.map((m) => (
        <Cartao key={m.tipo} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">{m.nome}</h2>
            <span className="text-sm text-muted-foreground">
              {m.proprio ? (
                `Seu modelo: ${m.proprio.nomeArquivo} (${quando.format(new Date(m.proprio.enviadoEm))})`
              ) : (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                  modelo padrão provisório
                </span>
              )}
              {m.versoes > 1 && ` · ${m.versoes} versões`}
            </span>
          </div>
          <a
            href={`/configuracoes/modelos/${m.tipo}`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Baixar modelo em uso (.docx)
          </a>
          {podeEditar && <FormularioModelo tipo={m.tipo} proprio={!!m.proprio} />}
        </Cartao>
      ))}
      <Cartao className="flex flex-col gap-2">
        <h2 className="font-semibold">Marcadores disponíveis</h2>
        <table className="w-full text-sm">
          <tbody>
            {MARCADORES.map((m) => (
              <tr key={m.marcador} className="border-t first:border-t-0">
                <td className="py-1.5 pr-3 font-mono text-xs">{`{${m.marcador}}`}</td>
                <td className="py-1.5 text-muted-foreground">{m.descricao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Cartao>
    </div>
  )
}
