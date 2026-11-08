'use client'

import { UFS } from '@norteia/dominio'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { cpfComprador, dadosEmpreendimento, dadosSpe } from './acoes'

function aria(p: string, nome: string, erro?: string) {
  return { ...ariaCampo(`${p}-${nome}`, erro), name: nome }
}
function Mensagens({ estado }: { estado: EstadoFormulario }) {
  return (
    <>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {estado.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
    </>
  )
}
const AJUDA_MUNICIPIO =
  'Código de 4 dígitos da tabela de municípios da Receita (aparece no programa da DIMOB). Não é o código do IBGE.'

export function FormularioDadosSpe({
  speId,
  valores,
}: {
  speId: string
  valores: {
    cnpj: string | null
    endereco: string | null
    uf: string | null
    municipio_rfb: string | null
    cpf_responsavel: string | null
  }
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    dadosSpe.bind(null, speId),
    {},
  )
  const er = estado.erros ?? {}
  const v = (k: keyof typeof valores) => estado.valores?.[k] ?? valores[k] ?? ''
  return (
    <form action={acao} className="flex flex-col gap-3" noValidate>
      <Mensagens estado={estado} />
      <Campo id="spe-cnpj" rotulo="CNPJ da SPE" erro={er.cnpj}>
        <Entrada {...aria('spe', 'cnpj', er.cnpj)} inputMode="numeric" defaultValue={v('cnpj')} />
      </Campo>
      <Campo id="spe-endereco" rotulo="Endereço completo da SPE" erro={er.endereco}>
        <Entrada {...aria('spe', 'endereco', er.endereco)} defaultValue={v('endereco')} />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo id="spe-uf" rotulo="UF da SPE" erro={er.uf}>
          <Selecao key={v('uf')} {...aria('spe', 'uf', er.uf)} defaultValue={v('uf')}>
            <option value="">—</option>
            {UFS.map((uf) => (
              <option key={uf}>{uf}</option>
            ))}
          </Selecao>
        </Campo>
        <Campo
          id="spe-municipio_rfb"
          rotulo="Município da SPE (código Receita)"
          erro={er.municipio_rfb}
          ajuda={AJUDA_MUNICIPIO}
        >
          <Entrada
            {...aria('spe', 'municipio_rfb', er.municipio_rfb)}
            inputMode="numeric"
            maxLength={4}
            defaultValue={v('municipio_rfb')}
          />
        </Campo>
        <Campo
          id="spe-cpf_responsavel"
          rotulo="CPF do responsável perante a Receita"
          erro={er.cpf_responsavel}
        >
          <Entrada
            {...aria('spe', 'cpf_responsavel', er.cpf_responsavel)}
            inputMode="numeric"
            defaultValue={v('cpf_responsavel')}
          />
        </Campo>
      </div>
      <Button type="submit" variant="outline" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Salvar dados da SPE'}
      </Button>
    </form>
  )
}

export function FormularioDadosEmpreendimento({
  speId,
  empreendimento: e,
}: {
  speId: string
  empreendimento: {
    id: string
    endereco: string | null
    cep: string | null
    municipio_rfb: string | null
    tipo_imovel: 'U' | 'R'
  }
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    dadosEmpreendimento.bind(null, speId, e.id),
    {},
  )
  const er = estado.erros ?? {}
  const p = `emp-${e.id}`
  const v = (k: 'endereco' | 'cep' | 'municipio_rfb' | 'tipo_imovel') =>
    estado.valores?.[k] ?? e[k] ?? ''
  return (
    <form action={acao} className="flex flex-col gap-3" noValidate>
      <Mensagens estado={estado} />
      <Campo id={`${p}-endereco`} rotulo="Endereço do empreendimento" erro={er.endereco}>
        <Entrada {...aria(p, 'endereco', er.endereco)} defaultValue={v('endereco')} />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo id={`${p}-cep`} rotulo="CEP" erro={er.cep}>
          <Entrada {...aria(p, 'cep', er.cep)} inputMode="numeric" defaultValue={v('cep')} />
        </Campo>
        <Campo
          id={`${p}-municipio_rfb`}
          rotulo="Município (código Receita)"
          erro={er.municipio_rfb}
          ajuda={AJUDA_MUNICIPIO}
        >
          <Entrada
            {...aria(p, 'municipio_rfb', er.municipio_rfb)}
            inputMode="numeric"
            maxLength={4}
            defaultValue={v('municipio_rfb')}
          />
        </Campo>
        <Campo id={`${p}-tipo_imovel`} rotulo="Tipo do imóvel" erro={er.tipo_imovel}>
          <Selecao
            key={v('tipo_imovel')}
            {...aria(p, 'tipo_imovel', er.tipo_imovel)}
            defaultValue={v('tipo_imovel')}
          >
            <option value="U">Urbano</option>
            <option value="R">Rural</option>
          </Selecao>
        </Campo>
      </div>
      <Button type="submit" variant="outline" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Salvar dados do empreendimento'}
      </Button>
    </form>
  )
}

export function FormularioCpf({
  speId,
  compradorId,
  nome,
}: {
  speId: string
  compradorId: string
  nome: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    cpfComprador.bind(null, speId, compradorId),
    {},
  )
  const er = estado.erros ?? {}
  const p = `cpf-${compradorId}`
  return (
    <form action={acao} className="flex flex-col gap-2 sm:flex-row sm:items-end" noValidate>
      <Campo
        id={`${p}-cpf`}
        rotulo={`CPF de ${nome}`}
        erro={er.cpf ?? estado.erro}
        className="flex-1"
      >
        <Entrada
          {...aria(p, 'cpf', er.cpf)}
          inputMode="numeric"
          defaultValue={estado.valores?.cpf ?? ''}
        />
      </Campo>
      <Button type="submit" size="sm" variant="outline" disabled={enviando}>
        Salvar CPF
      </Button>
    </form>
  )
}

/** Download do arquivo: original ou retificadora (com o recibo da declaração anterior). */
export function FormularioArquivo({
  speId,
  ano,
  bloqueado,
}: {
  speId: string
  ano: number
  bloqueado: boolean
}) {
  const [retificadora, setRetificadora] = useState(false)
  return (
    <form action={`/spes/${speId}/dimob/arquivo`} method="get" className="flex flex-col gap-3">
      <input type="hidden" name="ano" value={ano} />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="retificadora"
          value="1"
          checked={retificadora}
          onChange={(e) => setRetificadora(e.currentTarget.checked)}
        />
        Declaração retificadora
      </label>
      {retificadora && (
        <Campo id="recibo" rotulo="Número do recibo da declaração anterior">
          <Entrada id="recibo" name="recibo" inputMode="numeric" maxLength={10} required />
        </Campo>
      )}
      <Button type="submit" disabled={bloqueado}>
        Baixar arquivo para o programa da Receita
      </Button>
    </form>
  )
}
