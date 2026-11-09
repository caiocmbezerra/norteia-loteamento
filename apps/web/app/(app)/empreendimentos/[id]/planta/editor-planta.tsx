'use client'

import type { StatusLote } from '@norteia/dominio'
import { useActionState, useMemo, useRef, useState, useTransition } from 'react'
import { COR_PLANTA, Legenda, pontosSvg } from '@/components/planta-lotes'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Selecao } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { cn } from '@/lib/utils'
import { enviarPlanta, salvarContorno } from './acoes'

type Ponto = [number, number]
const MAIOR_LADO = 4000

/** Converte a 1ª página de um PDF em PNG no próprio navegador (o arquivo original não sai daqui). */
async function pdfParaImagem(arquivo: File): Promise<File> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const pdf = await pdfjs.getDocument({ data: await arquivo.arrayBuffer() }).promise
  const pagina = await pdf.getPage(1)
  const base = pagina.getViewport({ scale: 1 })
  const escala = Math.min(4, MAIOR_LADO / Math.max(base.width, base.height))
  const viewport = pagina.getViewport({ scale: escala })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  await pagina.render({ canvas, viewport }).promise
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'))
  if (!blob) throw new Error('Falha ao converter o PDF.')
  return new File([blob], arquivo.name.replace(/\.pdf$/i, '.png'), { type: 'image/png' })
}

function medir(arquivo: File): Promise<{ largura: number; altura: number }> {
  return new Promise((ok, falha) => {
    const img = new Image()
    const url = URL.createObjectURL(arquivo)
    img.onload = () => {
      ok({ largura: img.naturalWidth, altura: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => falha(new Error('Imagem inválida.'))
    img.src = url
  })
}

export function EnvioPlanta({
  empreendimentoId,
  temPlanta,
}: {
  empreendimentoId: string
  temPlanta: boolean
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    enviarPlanta.bind(null, empreendimentoId),
    {},
  )
  const entrada = useRef<HTMLInputElement>(null)
  const [tamanho, setTamanho] = useState<{ largura: number; altura: number } | null>(null)
  const [preparo, setPreparo] = useState<string | null>(null)
  const [convertendo, setConvertendo] = useState(false)

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    setTamanho(null)
    setPreparo(null)
    let arquivo = e.target.files?.[0]
    if (!arquivo) return
    try {
      if (arquivo.type === 'application/pdf') {
        setConvertendo(true)
        arquivo = await pdfParaImagem(arquivo)
        const dt = new DataTransfer()
        dt.items.add(arquivo)
        if (entrada.current) entrada.current.files = dt.files
      }
      const t = await medir(arquivo)
      setTamanho(t)
      setPreparo(`Pronta para enviar: ${t.largura} × ${t.altura} px.`)
    } catch {
      setPreparo('Não foi possível ler este arquivo. Tente outra imagem ou PDF.')
    } finally {
      setConvertendo(false)
    }
  }

  const erro = estado.erros?.planta
  return (
    <form action={acao} className="flex flex-col gap-3" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {estado.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
      <Campo
        id="planta"
        rotulo={temPlanta ? 'Trocar a planta' : 'Imagem ou PDF da planta'}
        ajuda="PNG, JPG, WebP ou PDF (1ª página), até 20 MB. Trocar a planta mantém os contornos."
        erro={erro}
      >
        <input
          ref={entrada}
          id="planta"
          name="planta"
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          onChange={escolher}
          aria-describedby={erro ? 'planta-erro' : 'planta-ajuda'}
          aria-invalid={erro ? true : undefined}
          className="text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
        />
      </Campo>
      {preparo && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {preparo}
        </p>
      )}
      <input type="hidden" name="largura" value={tamanho?.largura ?? ''} />
      <input type="hidden" name="altura" value={tamanho?.altura ?? ''} />
      <Button type="submit" disabled={!tamanho || enviando || convertendo}>
        {convertendo ? 'Convertendo o PDF…' : enviando ? 'Enviando…' : 'Enviar planta'}
      </Button>
    </form>
  )
}

export interface LoteEditor {
  id: string
  rotulo: string
  status: StatusLote
  pontos: Ponto[] | null
}

export function EditorPlanta({
  empreendimentoId,
  url,
  largura,
  altura,
  lotes: iniciais,
}: {
  empreendimentoId: string
  url: string
  largura: number
  altura: number
  lotes: LoteEditor[]
}) {
  const [lotes, setLotes] = useState(iniciais)
  const [selecionado, setSelecionado] = useState(
    () => (iniciais.find((l) => !l.pontos) ?? iniciais[0])?.id ?? '',
  )
  const [pontos, setPontos] = useState<Ponto[]>([])
  const [mensagem, setMensagem] = useState<{ tipo: 'erro' | 'sucesso'; texto: string } | null>(null)
  const [salvando, iniciar] = useTransition()
  const svg = useRef<SVGSVGElement>(null)
  const traco = Math.max(largura, altura) / 600
  const desenhados = lotes.filter((l) => l.pontos).length
  const atual = useMemo(() => lotes.find((l) => l.id === selecionado), [lotes, selecionado])

  function clicar(e: React.MouseEvent<SVGSVGElement>) {
    const el = svg.current
    const m = el?.getScreenCTM()
    if (!el || !m) return
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    const x = Math.min(1, Math.max(0, p.x / largura))
    const y = Math.min(1, Math.max(0, p.y / altura))
    setPontos((ps) => [...ps, [x, y]])
  }

  function gravar(novos: Ponto[] | null) {
    if (!atual) return
    iniciar(async () => {
      const r = await salvarContorno(empreendimentoId, atual.id, novos)
      if (r.erro) {
        setMensagem({ tipo: 'erro', texto: r.erro })
        return
      }
      const proximos = lotes.map((l) => (l.id === atual.id ? { ...l, pontos: novos } : l))
      setLotes(proximos)
      setPontos([])
      setMensagem({
        tipo: 'sucesso',
        texto: novos
          ? `Contorno de ${atual.rotulo} salvo.`
          : `Contorno de ${atual.rotulo} apagado.`,
      })
      const seguinte = novos && proximos.find((l) => !l.pontos)
      if (seguinte) setSelecionado(seguinte.id)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Campo id="lote" rotulo="Lote a desenhar" className="sm:w-72">
          <Selecao
            id="lote"
            value={selecionado}
            onChange={(e) => {
              setSelecionado(e.target.value)
              setPontos([])
              setMensagem(null)
            }}
          >
            {lotes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.pontos ? '✓ ' : ''}
                {l.rotulo}
              </option>
            ))}
          </Selecao>
        </Campo>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setPontos((ps) => ps.slice(0, -1))}
            disabled={pontos.length === 0 || salvando}
          >
            Desfazer ponto
          </Button>
          <Button
            type="button"
            onClick={() => gravar(pontos)}
            disabled={pontos.length < 3 || salvando}
          >
            {salvando ? 'Salvando…' : 'Salvar contorno'}
          </Button>
          {atual?.pontos && (
            <Button
              type="button"
              variant="outline"
              onClick={() => gravar(null)}
              disabled={salvando}
            >
              Apagar contorno
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {desenhados} de {lotes.length} lotes desenhados. Toque nos cantos do lote na planta, em
        ordem; com 3 pontos ou mais, salve.{pontos.length > 0 && ` Pontos: ${pontos.length}.`}
      </p>
      {mensagem && <Alerta tipo={mensagem.tipo}>{mensagem.texto}</Alerta>}
      <Legenda />
      <div className="max-h-[75vh] overflow-auto rounded-md border" tabIndex={0}>
        <svg
          ref={svg}
          viewBox={`0 0 ${largura} ${altura}`}
          className="block h-auto w-full cursor-crosshair"
          onClick={clicar}
          role="img"
          aria-label="Planta para desenhar os contornos dos lotes"
          data-testid="planta-editor"
        >
          <image href={url} width={largura} height={altura} />
          {lotes.map(
            (l) =>
              l.pontos &&
              l.id !== selecionado && (
                <polygon
                  key={l.id}
                  points={pontosSvg(l.pontos, largura, altura)}
                  strokeWidth={traco}
                  className={cn(COR_PLANTA[l.status], 'opacity-60')}
                />
              ),
          )}
          {atual?.pontos && pontos.length === 0 && (
            <polygon
              points={pontosSvg(atual.pontos, largura, altura)}
              strokeWidth={traco * 2}
              className="fill-primary/30 stroke-primary"
            />
          )}
          {pontos.length > 0 && (
            <polyline
              points={pontosSvg(
                pontos.length > 2 ? [...pontos, pontos[0]!] : pontos,
                largura,
                altura,
              )}
              strokeWidth={traco * 2}
              className="fill-primary/20 stroke-primary"
            />
          )}
          {pontos.map(([x, y], i) => (
            <circle
              key={i}
              cx={x * largura}
              cy={y * altura}
              r={traco * 3}
              className="fill-primary"
            />
          ))}
        </svg>
      </div>
    </div>
  )
}
