'use client'

import { useActionState, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { alternarItem, criarItem } from './acoes'

export function FormularioItem() {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(criarItem, {})
  const [enquadramento, setEnquadramento] = useState('dentro')
  const er = estado.erros ?? {}
  return (
    <form action={acao} className="flex flex-col gap-3" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {estado.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
      <Campo id="nome" rotulo="Nome do custo" erro={er.nome}>
        <Entrada {...ariaCampo('nome', er.nome)} placeholder="Ex.: Documentação" />
      </Campo>
      <Campo
        id="enquadramento"
        rotulo="Como conta"
        ajuda="Despesas administrativas entram no teto junto com a cláusula penal (art. 32-A, II). IPTU e taxas de associação ficam fora."
      >
        <Selecao
          {...ariaCampo('enquadramento', undefined, 'ajuda')}
          name={undefined}
          value={enquadramento}
          onChange={(e) => setEnquadramento(e.target.value)}
        >
          <option value="dentro">Dentro do teto (despesa administrativa)</option>
          <option value="fora">Fora do teto</option>
        </Selecao>
      </Campo>
      {/* O React limpa o formulário após o envio; o enquadramento vai pelo campo oculto. */}
      <input type="hidden" name="enquadramento" value={enquadramento} />
      <Campo
        id="valor"
        rotulo="Valor sugerido (R$, opcional)"
        ajuda="Vem preenchido no distrato; dá para mudar em cada caso."
        erro={er.valor}
      >
        <Entrada
          {...ariaCampo('valor', er.valor, 'ajuda')}
          inputMode="decimal"
          placeholder="800,00"
        />
      </Campo>
      <Button type="submit" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Cadastrar custo'}
      </Button>
    </form>
  )
}

export function AlternarItem({ id, nome, ativo }: { id: string; nome: string; ativo: boolean }) {
  const [pendente, iniciar] = useTransition()
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pendente}
      aria-label={`${ativo ? 'Desativar' : 'Reativar'} ${nome}`}
      onClick={() => iniciar(() => alternarItem(id, !ativo))}
    >
      {ativo ? 'Desativar' : 'Reativar'}
    </Button>
  )
}
