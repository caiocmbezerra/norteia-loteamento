import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { Conversa } from './conversa'

export const metadata: Metadata = { title: 'Assistente' }

export default async function PaginaAssistente() {
  const ctx = await exigirContexto()
  if (!temPapel(ctx, 'dono', 'financeiro', 'contador', 'comercial_gestor', 'socio_leitura'))
    redirect('/painel')
  const ativo = Boolean(process.env.ANTHROPIC_API_KEY)
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <TituloPagina
        titulo="Assistente"
        subtitulo="Pergunte em português. As respostas usam os números do motor e da carteira, com as suas permissões, e dizem de onde veio cada número."
      />
      {!ativo && <Alerta tipo="aviso">O assistente ainda não foi ativado nesta instalação.</Alerta>}
      <Cartao>
        <Conversa />
      </Cartao>
      <p className="text-xs text-muted-foreground">
        O assistente só consulta; não altera nada. Pode errar ao interpretar a pergunta: confira nas
        telas antes de decidir. Questões jurídicas e tributárias ficam com o seu advogado e o seu
        contador.
      </p>
    </div>
  )
}
