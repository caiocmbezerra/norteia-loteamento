export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      aditivos: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          condicoes: NonNullable<Json>
          contrato_id: string
          criado_em: string
          criado_por: string | null
          data: string
          desconto_centavos: number
          encargos_incorporados_centavos: number
          id: string
          motivo: string
          novo_saldo_centavos: number
          parcelas_anteriores: NonNullable<Json>
          saldo_anterior_centavos: number
          tenant_id: string
          tipo: string
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          condicoes: NonNullable<Json>
          contrato_id: string
          criado_em?: string
          criado_por?: string | null
          data: string
          desconto_centavos?: number
          encargos_incorporados_centavos?: number
          id?: string
          motivo: string
          novo_saldo_centavos: number
          parcelas_anteriores: NonNullable<Json>
          saldo_anterior_centavos: number
          tenant_id: string
          tipo: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          condicoes?: NonNullable<Json>
          contrato_id?: string
          criado_em?: string
          criado_por?: string | null
          data?: string
          desconto_centavos?: number
          encargos_incorporados_centavos?: number
          id?: string
          motivo?: string
          novo_saldo_centavos?: number
          parcelas_anteriores?: NonNullable<Json>
          saldo_anterior_centavos?: number
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: 'aditivos_tenant_id_contrato_id_fkey'
            columns: ['tenant_id', 'contrato_id']
            isOneToOne: false
            referencedRelation: 'contratos'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      asaas_clientes: {
        Row: {
          asaas_id: string
          atualizado_em: string
          atualizado_por: string | null
          comprador_id: string
          criado_em: string
          criado_por: string | null
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          asaas_id: string
          atualizado_em?: string
          atualizado_por?: string | null
          comprador_id: string
          criado_em?: string
          criado_por?: string | null
          tenant_id: string
        }
        Update: {
          asaas_id?: string
          atualizado_em?: string
          atualizado_por?: string | null
          comprador_id?: string
          criado_em?: string
          criado_por?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'asaas_clientes_tenant_id_comprador_id_fkey'
            columns: ['tenant_id', 'comprador_id']
            isOneToOne: true
            referencedRelation: 'compradores'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      asaas_eventos: {
        Row: {
          asaas_evento_id: string | null
          asaas_pagamento_id: string | null
          evento: string
          id: string
          payload: NonNullable<Json>
          recebido_em: string
          resultado: string
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          asaas_evento_id?: string | null
          asaas_pagamento_id?: string | null
          evento: string
          id?: string
          payload: NonNullable<Json>
          recebido_em?: string
          resultado: string
          tenant_id: string
        }
        Update: {
          asaas_evento_id?: string | null
          asaas_pagamento_id?: string | null
          evento?: string
          id?: string
          payload?: NonNullable<Json>
          recebido_em?: string
          resultado?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'asaas_eventos_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      atribuicoes_papel: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          criado_em: string
          criado_por: string | null
          escopo_id: string | null
          escopo_tipo: Database['public']['Enums']['escopo']
          id: string
          membro_id: string
          papel: Database['public']['Enums']['papel']
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          escopo_id?: string | null
          escopo_tipo?: Database['public']['Enums']['escopo']
          id?: string
          membro_id: string
          papel: Database['public']['Enums']['papel']
          tenant_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          escopo_id?: string | null
          escopo_tipo?: Database['public']['Enums']['escopo']
          id?: string
          membro_id?: string
          papel?: Database['public']['Enums']['papel']
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'atribuicoes_papel_tenant_id_membro_id_fkey'
            columns: ['tenant_id', 'membro_id']
            isOneToOne: false
            referencedRelation: 'membros'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      auditoria: {
        Row: {
          antes: Json | null
          campos_alterados: string[] | null
          depois: Json | null
          id: number
          motivo: string | null
          ocorrido_em: string
          operacao: string
          registro_id: string | null
          tabela: string
          tenant_id: string | null
          usuario_id: string | null
        }
        ComputedFields: never
        Insert: {
          antes?: Json | null
          campos_alterados?: string[] | null
          depois?: Json | null
          id?: never
          motivo?: string | null
          ocorrido_em?: string
          operacao: string
          registro_id?: string | null
          tabela: string
          tenant_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          antes?: Json | null
          campos_alterados?: string[] | null
          depois?: Json | null
          id?: never
          motivo?: string | null
          ocorrido_em?: string
          operacao?: string
          registro_id?: string | null
          tabela?: string
          tenant_id?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      centros_custo: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          codigo: string
          criado_em: string
          criado_por: string | null
          id: string
          nome: string
          ordem: number
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          codigo: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome: string
          ordem?: number
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          codigo?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome?: string
          ordem?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'centros_custo_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      cobrancas: {
        Row: {
          asaas_id: string
          atualizado_em: string
          atualizado_por: string | null
          criado_em: string
          criado_por: string | null
          id: string
          link_boleto: string | null
          link_fatura: string | null
          motivo: string | null
          parcela_id: string
          recebimento_id: string | null
          retorno: Json | null
          situacao: string
          tenant_id: string
          valor_centavos: number
          vencimento: string
          verificado_em: string | null
        }
        ComputedFields: never
        Insert: {
          asaas_id: string
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          link_boleto?: string | null
          link_fatura?: string | null
          motivo?: string | null
          parcela_id: string
          recebimento_id?: string | null
          retorno?: Json | null
          situacao?: string
          tenant_id: string
          valor_centavos: number
          vencimento: string
          verificado_em?: string | null
        }
        Update: {
          asaas_id?: string
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          link_boleto?: string | null
          link_fatura?: string | null
          motivo?: string | null
          parcela_id?: string
          recebimento_id?: string | null
          retorno?: Json | null
          situacao?: string
          tenant_id?: string
          valor_centavos?: number
          vencimento?: string
          verificado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'cobrancas_tenant_id_parcela_id_fkey'
            columns: ['tenant_id', 'parcela_id']
            isOneToOne: false
            referencedRelation: 'parcelas'
            referencedColumns: ['tenant_id', 'id']
          },
          {
            foreignKeyName: 'cobrancas_tenant_id_recebimento_id_fkey'
            columns: ['tenant_id', 'recebimento_id']
            isOneToOne: false
            referencedRelation: 'recebimentos'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      compradores: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          cpf: string | null
          criado_em: string
          criado_por: string | null
          email: string | null
          id: string
          nome: string
          telefone: string | null
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          cpf?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string | null
          id?: string
          nome: string
          telefone?: string | null
          tenant_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          cpf?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'compradores_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      contas_pagar: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          cancelada_em: string | null
          centro_codigo: string
          contrato_id: string | null
          criado_em: string
          criado_por: string | null
          descricao: string
          documento_numero: string | null
          empreendimento_id: string
          fornecedor_id: string | null
          id: string
          motivo_cancelamento: string | null
          tenant_id: string
          valor_centavos: number
          vencimento: string
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          cancelada_em?: string | null
          centro_codigo: string
          contrato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          descricao: string
          documento_numero?: string | null
          empreendimento_id: string
          fornecedor_id?: string | null
          id?: string
          motivo_cancelamento?: string | null
          tenant_id: string
          valor_centavos: number
          vencimento: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          cancelada_em?: string | null
          centro_codigo?: string
          contrato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          descricao?: string
          documento_numero?: string | null
          empreendimento_id?: string
          fornecedor_id?: string | null
          id?: string
          motivo_cancelamento?: string | null
          tenant_id?: string
          valor_centavos?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: 'contas_pagar_tenant_id_centro_codigo_fkey'
            columns: ['tenant_id', 'centro_codigo']
            isOneToOne: false
            referencedRelation: 'centros_custo'
            referencedColumns: ['tenant_id', 'codigo']
          },
          {
            foreignKeyName: 'contas_pagar_tenant_id_empreendimento_id_contrato_id_fkey'
            columns: ['tenant_id', 'empreendimento_id', 'contrato_id']
            isOneToOne: false
            referencedRelation: 'contratos_fornecedor'
            referencedColumns: ['tenant_id', 'empreendimento_id', 'id']
          },
          {
            foreignKeyName: 'contas_pagar_tenant_id_empreendimento_id_fkey'
            columns: ['tenant_id', 'empreendimento_id']
            isOneToOne: false
            referencedRelation: 'empreendimentos'
            referencedColumns: ['tenant_id', 'id']
          },
          {
            foreignKeyName: 'contas_pagar_tenant_id_fornecedor_id_fkey'
            columns: ['tenant_id', 'fornecedor_id']
            isOneToOne: false
            referencedRelation: 'fornecedores'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      contratos: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          comprador_id: string
          criado_em: string
          criado_por: string | null
          empreendimento_id: string
          id: string
          indice_reajuste: string | null
          juros_mora_mensal: number
          lote_id: string
          multa_atraso: number
          quitado_em: string | null
          reajuste_defasagem_meses: number
          reajuste_negativo: string
          reajuste_periodicidade_meses: number
          situacao: string
          tenant_id: string
          venda_id: string
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          comprador_id: string
          criado_em?: string
          criado_por?: string | null
          empreendimento_id: string
          id?: string
          indice_reajuste?: string | null
          juros_mora_mensal: number
          lote_id: string
          multa_atraso: number
          quitado_em?: string | null
          reajuste_defasagem_meses: number
          reajuste_negativo: string
          reajuste_periodicidade_meses: number
          situacao?: string
          tenant_id: string
          venda_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          comprador_id?: string
          criado_em?: string
          criado_por?: string | null
          empreendimento_id?: string
          id?: string
          indice_reajuste?: string | null
          juros_mora_mensal?: number
          lote_id?: string
          multa_atraso?: number
          quitado_em?: string | null
          reajuste_defasagem_meses?: number
          reajuste_negativo?: string
          reajuste_periodicidade_meses?: number
          situacao?: string
          tenant_id?: string
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'contratos_indice_reajuste_fkey'
            columns: ['indice_reajuste']
            isOneToOne: false
            referencedRelation: 'indices_economicos'
            referencedColumns: ['codigo']
          },
          {
            foreignKeyName: 'contratos_tenant_id_comprador_id_fkey'
            columns: ['tenant_id', 'comprador_id']
            isOneToOne: false
            referencedRelation: 'compradores'
            referencedColumns: ['tenant_id', 'id']
          },
          {
            foreignKeyName: 'contratos_tenant_id_empreendimento_id_fkey'
            columns: ['tenant_id', 'empreendimento_id']
            isOneToOne: false
            referencedRelation: 'empreendimentos'
            referencedColumns: ['tenant_id', 'id']
          },
          {
            foreignKeyName: 'contratos_tenant_id_lote_id_fkey'
            columns: ['tenant_id', 'lote_id']
            isOneToOne: false
            referencedRelation: 'lotes'
            referencedColumns: ['tenant_id', 'id']
          },
          {
            foreignKeyName: 'contratos_tenant_id_venda_id_fkey'
            columns: ['tenant_id', 'venda_id']
            isOneToOne: false
            referencedRelation: 'vendas'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      contratos_fornecedor: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          centro_codigo: string
          criado_em: string
          criado_por: string | null
          data_fim_prevista: string
          data_inicio: string
          descricao: string
          empreendimento_id: string
          fornecedor_id: string
          id: string
          situacao: string
          tenant_id: string
          valor_centavos: number
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          centro_codigo: string
          criado_em?: string
          criado_por?: string | null
          data_fim_prevista: string
          data_inicio: string
          descricao: string
          empreendimento_id: string
          fornecedor_id: string
          id?: string
          situacao?: string
          tenant_id: string
          valor_centavos: number
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          centro_codigo?: string
          criado_em?: string
          criado_por?: string | null
          data_fim_prevista?: string
          data_inicio?: string
          descricao?: string
          empreendimento_id?: string
          fornecedor_id?: string
          id?: string
          situacao?: string
          tenant_id?: string
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: 'contratos_fornecedor_tenant_id_centro_codigo_fkey'
            columns: ['tenant_id', 'centro_codigo']
            isOneToOne: false
            referencedRelation: 'centros_custo'
            referencedColumns: ['tenant_id', 'codigo']
          },
          {
            foreignKeyName: 'contratos_fornecedor_tenant_id_empreendimento_id_fkey'
            columns: ['tenant_id', 'empreendimento_id']
            isOneToOne: false
            referencedRelation: 'empreendimentos'
            referencedColumns: ['tenant_id', 'id']
          },
          {
            foreignKeyName: 'contratos_fornecedor_tenant_id_fornecedor_id_fkey'
            columns: ['tenant_id', 'fornecedor_id']
            isOneToOne: false
            referencedRelation: 'fornecedores'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      convites: {
        Row: {
          aceito_em: string | null
          aceito_por: string | null
          atualizado_em: string
          atualizado_por: string | null
          cancelado_em: string | null
          criado_em: string
          criado_por: string | null
          email: string
          escopo_id: string | null
          escopo_tipo: Database['public']['Enums']['escopo']
          expira_em: string
          id: string
          papel: Database['public']['Enums']['papel']
          tenant_id: string
          token_hash: string
        }
        ComputedFields: never
        Insert: {
          aceito_em?: string | null
          aceito_por?: string | null
          atualizado_em?: string
          atualizado_por?: string | null
          cancelado_em?: string | null
          criado_em?: string
          criado_por?: string | null
          email: string
          escopo_id?: string | null
          escopo_tipo?: Database['public']['Enums']['escopo']
          expira_em: string
          id?: string
          papel: Database['public']['Enums']['papel']
          tenant_id: string
          token_hash: string
        }
        Update: {
          aceito_em?: string | null
          aceito_por?: string | null
          atualizado_em?: string
          atualizado_por?: string | null
          cancelado_em?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string
          escopo_id?: string | null
          escopo_tipo?: Database['public']['Enums']['escopo']
          expira_em?: string
          id?: string
          papel?: Database['public']['Enums']['papel']
          tenant_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: 'convites_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      corretores: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          comissao_modo: string
          comissao_percentual: number
          creci: string | null
          criado_em: string
          criado_por: string | null
          id: string
          imobiliaria_id: string | null
          nome: string
          tenant_id: string
          usuario_id: string | null
        }
        ComputedFields: never
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          comissao_modo?: string
          comissao_percentual?: number
          creci?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          imobiliaria_id?: string | null
          nome: string
          tenant_id: string
          usuario_id?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          comissao_modo?: string
          comissao_percentual?: number
          creci?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          imobiliaria_id?: string | null
          nome?: string
          tenant_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'corretores_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'corretores_tenant_id_imobiliaria_id_fkey'
            columns: ['tenant_id', 'imobiliaria_id']
            isOneToOne: false
            referencedRelation: 'imobiliarias'
            referencedColumns: ['tenant_id', 'id']
          },
          {
            foreignKeyName: 'corretores_usuario_id_fkey'
            columns: ['usuario_id']
            isOneToOne: false
            referencedRelation: 'perfis'
            referencedColumns: ['id']
          },
        ]
      }
      devolucoes: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          criado_em: string
          criado_por: string | null
          distrato_id: string
          id: string
          numero: number
          pago_em: string | null
          tenant_id: string
          valor_centavos: number
          vencimento: string
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          distrato_id: string
          id?: string
          numero: number
          pago_em?: string | null
          tenant_id: string
          valor_centavos: number
          vencimento: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          distrato_id?: string
          id?: string
          numero?: number
          pago_em?: string | null
          tenant_id?: string
          valor_centavos?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: 'devolucoes_tenant_id_distrato_id_fkey'
            columns: ['tenant_id', 'distrato_id']
            isOneToOne: false
            referencedRelation: 'distratos'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      distratos: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          contrato_id: string
          criado_em: string
          criado_por: string | null
          data: string
          devolucao_centavos: number
          id: string
          motivo: string
          resumo: NonNullable<Json>
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          contrato_id: string
          criado_em?: string
          criado_por?: string | null
          data: string
          devolucao_centavos: number
          id?: string
          motivo: string
          resumo: NonNullable<Json>
          tenant_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          contrato_id?: string
          criado_em?: string
          criado_por?: string | null
          data?: string
          devolucao_centavos?: number
          id?: string
          motivo?: string
          resumo?: NonNullable<Json>
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'distratos_tenant_id_contrato_id_fkey'
            columns: ['tenant_id', 'contrato_id']
            isOneToOne: false
            referencedRelation: 'contratos'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      empreendimentos: {
        Row: {
          area_total_m2: number | null
          area_vendavel_m2: number | null
          atualizado_em: string
          atualizado_por: string | null
          criado_em: string
          criado_por: string | null
          data_base: string
          data_registro: string | null
          gleba_id: string | null
          id: string
          municipio: string | null
          nome: string
          observacao: string | null
          registro_matricula: string | null
          situacao: Database['public']['Enums']['empreendimento_situacao']
          spe_id: string
          tenant_id: string
          tipo: Database['public']['Enums']['empreendimento_tipo']
          uf: string | null
        }
        ComputedFields: never
        Insert: {
          area_total_m2?: number | null
          area_vendavel_m2?: number | null
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          data_base: string
          data_registro?: string | null
          gleba_id?: string | null
          id?: string
          municipio?: string | null
          nome: string
          observacao?: string | null
          registro_matricula?: string | null
          situacao?: Database['public']['Enums']['empreendimento_situacao']
          spe_id: string
          tenant_id: string
          tipo?: Database['public']['Enums']['empreendimento_tipo']
          uf?: string | null
        }
        Update: {
          area_total_m2?: number | null
          area_vendavel_m2?: number | null
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          data_base?: string
          data_registro?: string | null
          gleba_id?: string | null
          id?: string
          municipio?: string | null
          nome?: string
          observacao?: string | null
          registro_matricula?: string | null
          situacao?: Database['public']['Enums']['empreendimento_situacao']
          spe_id?: string
          tenant_id?: string
          tipo?: Database['public']['Enums']['empreendimento_tipo']
          uf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'empreendimentos_tenant_id_gleba_id_fkey'
            columns: ['tenant_id', 'gleba_id']
            isOneToOne: false
            referencedRelation: 'glebas'
            referencedColumns: ['tenant_id', 'id']
          },
          {
            foreignKeyName: 'empreendimentos_tenant_id_spe_id_fkey'
            columns: ['tenant_id', 'spe_id']
            isOneToOne: false
            referencedRelation: 'spes'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      empresas: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          cnpj: string | null
          criado_em: string
          criado_por: string | null
          id: string
          nome_fantasia: string | null
          razao_social: string
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          cnpj?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome_fantasia?: string | null
          razao_social: string
          tenant_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          cnpj?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome_fantasia?: string | null
          razao_social?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'empresas_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      etapas: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          criado_em: string
          criado_por: string | null
          empreendimento_id: string
          id: string
          nome: string
          ordem: number
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          empreendimento_id: string
          id?: string
          nome: string
          ordem?: number
          tenant_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          empreendimento_id?: string
          id?: string
          nome?: string
          ordem?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'etapas_tenant_id_empreendimento_id_fkey'
            columns: ['tenant_id', 'empreendimento_id']
            isOneToOne: false
            referencedRelation: 'empreendimentos'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      fornecedores: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          criado_em: string
          criado_por: string | null
          documento: string | null
          email: string | null
          id: string
          nome: string
          telefone: string | null
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          documento?: string | null
          email?: string | null
          id?: string
          nome: string
          telefone?: string | null
          tenant_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          documento?: string | null
          email?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fornecedores_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      funcionalidades: {
        Row: {
          chave: string
          descricao: string
        }
        ComputedFields: never
        Insert: {
          chave: string
          descricao: string
        }
        Update: {
          chave?: string
          descricao?: string
        }
        Relationships: []
      }
      glebas: {
        Row: {
          area_m2: number | null
          atualizado_em: string
          atualizado_por: string | null
          criado_em: string
          criado_por: string | null
          id: string
          matriculas: string[]
          municipio: string | null
          nome: string
          observacao: string | null
          poligono: unknown
          ponto: unknown
          situacao: Database['public']['Enums']['gleba_situacao']
          tenant_id: string
          uf: string | null
        }
        ComputedFields: never
        Insert: {
          area_m2?: number | null
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          matriculas?: string[]
          municipio?: string | null
          nome: string
          observacao?: string | null
          poligono?: unknown
          ponto?: unknown
          situacao?: Database['public']['Enums']['gleba_situacao']
          tenant_id: string
          uf?: string | null
        }
        Update: {
          area_m2?: number | null
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          matriculas?: string[]
          municipio?: string | null
          nome?: string
          observacao?: string | null
          poligono?: unknown
          ponto?: unknown
          situacao?: Database['public']['Enums']['gleba_situacao']
          tenant_id?: string
          uf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'glebas_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      imobiliarias: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          cnpj: string | null
          criado_em: string
          criado_por: string | null
          id: string
          nome: string
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          cnpj?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome: string
          tenant_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          cnpj?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'imobiliarias_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      indice_valores: {
        Row: {
          codigo: string
          competencia: string
          importado_em: string
          variacao_mensal: number
        }
        ComputedFields: never
        Insert: {
          codigo: string
          competencia: string
          importado_em?: string
          variacao_mensal: number
        }
        Update: {
          codigo?: string
          competencia?: string
          importado_em?: string
          variacao_mensal?: number
        }
        Relationships: [
          {
            foreignKeyName: 'indice_valores_codigo_fkey'
            columns: ['codigo']
            isOneToOne: false
            referencedRelation: 'indices_economicos'
            referencedColumns: ['codigo']
          },
        ]
      }
      indices_economicos: {
        Row: {
          codigo: string
          fonte: string
          nome: string
          serie_sgs: number | null
        }
        ComputedFields: never
        Insert: {
          codigo: string
          fonte: string
          nome: string
          serie_sgs?: number | null
        }
        Update: {
          codigo?: string
          fonte?: string
          nome?: string
          serie_sgs?: number | null
        }
        Relationships: []
      }
      integracoes_asaas: {
        Row: {
          ambiente: string
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          criado_em: string
          criado_por: string | null
          segredo_id: string
          tenant_id: string
          ultimo_webhook_em: string | null
          webhook_token_hash: string
        }
        ComputedFields: never
        Insert: {
          ambiente: string
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          segredo_id: string
          tenant_id: string
          ultimo_webhook_em?: string | null
          webhook_token_hash: string
        }
        Update: {
          ambiente?: string
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          segredo_id?: string
          tenant_id?: string
          ultimo_webhook_em?: string | null
          webhook_token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: 'integracoes_asaas_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: true
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      lotes: {
        Row: {
          area_m2: number
          atualizado_em: string
          atualizado_por: string | null
          criado_em: string
          criado_por: string | null
          empreendimento_id: string
          id: string
          numero: string
          observacao: string | null
          preco_base_centavos: number | null
          quadra_id: string
          status: Database['public']['Enums']['lote_status']
          tenant_id: string
          testada_m: number | null
        }
        ComputedFields: never
        Insert: {
          area_m2: number
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          empreendimento_id: string
          id?: string
          numero: string
          observacao?: string | null
          preco_base_centavos?: number | null
          quadra_id: string
          status?: Database['public']['Enums']['lote_status']
          tenant_id: string
          testada_m?: number | null
        }
        Update: {
          area_m2?: number
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          empreendimento_id?: string
          id?: string
          numero?: string
          observacao?: string | null
          preco_base_centavos?: number | null
          quadra_id?: string
          status?: Database['public']['Enums']['lote_status']
          tenant_id?: string
          testada_m?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'lotes_empreendimento_fkey'
            columns: ['tenant_id', 'empreendimento_id']
            isOneToOne: false
            referencedRelation: 'empreendimentos'
            referencedColumns: ['tenant_id', 'id']
          },
          {
            foreignKeyName: 'lotes_tenant_id_empreendimento_id_quadra_id_fkey'
            columns: ['tenant_id', 'empreendimento_id', 'quadra_id']
            isOneToOne: false
            referencedRelation: 'quadras'
            referencedColumns: ['tenant_id', 'empreendimento_id', 'id']
          },
        ]
      }
      membros: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          criado_em: string
          criado_por: string | null
          id: string
          tenant_id: string
          usuario_id: string
        }
        ComputedFields: never
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          tenant_id: string
          usuario_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          tenant_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'membros_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'membros_usuario_id_fkey'
            columns: ['usuario_id']
            isOneToOne: false
            referencedRelation: 'perfis'
            referencedColumns: ['id']
          },
        ]
      }
      modelos_documento: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          conteudo_base64: string
          criado_em: string
          criado_por: string | null
          id: string
          nome_arquivo: string
          tenant_id: string
          tipo: string
        }
        ComputedFields: never
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          conteudo_base64: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome_arquivo: string
          tenant_id: string
          tipo: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          conteudo_base64?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome_arquivo?: string
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: 'modelos_documento_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      orcamento_itens: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          centro_codigo: string
          criado_em: string
          criado_por: string | null
          descricao: string
          empreendimento_id: string
          id: string
          mes_fim: number
          mes_inicio: number
          tenant_id: string
          tipo: string
          valor_centavos: number
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          centro_codigo: string
          criado_em?: string
          criado_por?: string | null
          descricao: string
          empreendimento_id: string
          id?: string
          mes_fim: number
          mes_inicio: number
          tenant_id: string
          tipo?: string
          valor_centavos: number
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          centro_codigo?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string
          empreendimento_id?: string
          id?: string
          mes_fim?: number
          mes_inicio?: number
          tenant_id?: string
          tipo?: string
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: 'orcamento_itens_tenant_id_centro_codigo_fkey'
            columns: ['tenant_id', 'centro_codigo']
            isOneToOne: false
            referencedRelation: 'centros_custo'
            referencedColumns: ['tenant_id', 'codigo']
          },
          {
            foreignKeyName: 'orcamento_itens_tenant_id_empreendimento_id_fkey'
            columns: ['tenant_id', 'empreendimento_id']
            isOneToOne: false
            referencedRelation: 'empreendimentos'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      pagamentos: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          conta_id: string
          criado_em: string
          criado_por: string | null
          data_pagamento: string
          estornado_em: string | null
          id: string
          motivo_estorno: string | null
          tenant_id: string
          valor_centavos: number
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          conta_id: string
          criado_em?: string
          criado_por?: string | null
          data_pagamento: string
          estornado_em?: string | null
          id?: string
          motivo_estorno?: string | null
          tenant_id: string
          valor_centavos: number
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          conta_id?: string
          criado_em?: string
          criado_por?: string | null
          data_pagamento?: string
          estornado_em?: string | null
          id?: string
          motivo_estorno?: string | null
          tenant_id?: string
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: 'pagamentos_tenant_id_conta_id_fkey'
            columns: ['tenant_id', 'conta_id']
            isOneToOne: false
            referencedRelation: 'contas_pagar'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      papel_permissoes: {
        Row: {
          papel: Database['public']['Enums']['papel']
          permissao: string
        }
        ComputedFields: never
        Insert: {
          papel: Database['public']['Enums']['papel']
          permissao: string
        }
        Update: {
          papel?: Database['public']['Enums']['papel']
          permissao?: string
        }
        Relationships: []
      }
      parametro_valores: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          chave: string
          criado_em: string
          criado_por: string | null
          escopo: string
          escopo_id: string | null
          id: string
          motivo: string | null
          tenant_id: string | null
          valor: NonNullable<Json>
          vigencia: unknown
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave: string
          criado_em?: string
          criado_por?: string | null
          escopo: string
          escopo_id?: string | null
          id?: string
          motivo?: string | null
          tenant_id?: string | null
          valor: NonNullable<Json>
          vigencia: unknown
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave?: string
          criado_em?: string
          criado_por?: string | null
          escopo?: string
          escopo_id?: string | null
          id?: string
          motivo?: string | null
          tenant_id?: string | null
          valor?: NonNullable<Json>
          vigencia?: unknown
        }
        Relationships: [
          {
            foreignKeyName: 'parametro_valores_chave_fkey'
            columns: ['chave']
            isOneToOne: false
            referencedRelation: 'parametros'
            referencedColumns: ['chave']
          },
          {
            foreignKeyName: 'parametro_valores_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      parametros: {
        Row: {
          chave: string
          descricao: string
          pendencia_legal: string | null
          tipo: Database['public']['Enums']['parametro_tipo']
          unidade: string | null
          valores_permitidos: string[] | null
        }
        ComputedFields: never
        Insert: {
          chave: string
          descricao: string
          pendencia_legal?: string | null
          tipo: Database['public']['Enums']['parametro_tipo']
          unidade?: string | null
          valores_permitidos?: string[] | null
        }
        Update: {
          chave?: string
          descricao?: string
          pendencia_legal?: string | null
          tipo?: Database['public']['Enums']['parametro_tipo']
          unidade?: string | null
          valores_permitidos?: string[] | null
        }
        Relationships: []
      }
      parcelas: {
        Row: {
          aditivo_cancelamento_id: string | null
          aditivo_origem_id: string | null
          amortizacao_centavos: number
          atualizado_em: string
          atualizado_por: string | null
          contrato_id: string
          correcao_centavos: number
          criado_em: string
          criado_por: string | null
          id: string
          juros_centavos: number
          numero: number
          pago_centavos: number
          situacao: string
          tenant_id: string
          valor_centavos: number
          vencimento: string
        }
        ComputedFields: never
        Insert: {
          aditivo_cancelamento_id?: string | null
          aditivo_origem_id?: string | null
          amortizacao_centavos: number
          atualizado_em?: string
          atualizado_por?: string | null
          contrato_id: string
          correcao_centavos?: number
          criado_em?: string
          criado_por?: string | null
          id?: string
          juros_centavos: number
          numero: number
          pago_centavos?: number
          situacao?: string
          tenant_id: string
          valor_centavos: number
          vencimento: string
        }
        Update: {
          aditivo_cancelamento_id?: string | null
          aditivo_origem_id?: string | null
          amortizacao_centavos?: number
          atualizado_em?: string
          atualizado_por?: string | null
          contrato_id?: string
          correcao_centavos?: number
          criado_em?: string
          criado_por?: string | null
          id?: string
          juros_centavos?: number
          numero?: number
          pago_centavos?: number
          situacao?: string
          tenant_id?: string
          valor_centavos?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: 'parcelas_aditivo_cancelamento_fk'
            columns: ['tenant_id', 'aditivo_cancelamento_id']
            isOneToOne: false
            referencedRelation: 'aditivos'
            referencedColumns: ['tenant_id', 'id']
          },
          {
            foreignKeyName: 'parcelas_aditivo_origem_fk'
            columns: ['tenant_id', 'aditivo_origem_id']
            isOneToOne: false
            referencedRelation: 'aditivos'
            referencedColumns: ['tenant_id', 'id']
          },
          {
            foreignKeyName: 'parcelas_tenant_id_contrato_id_fkey'
            columns: ['tenant_id', 'contrato_id']
            isOneToOne: false
            referencedRelation: 'contratos'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      perfis: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          criado_em: string
          criado_por: string | null
          email: string
          id: string
          nome: string
          pessoa_global_id: string
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          email: string
          id: string
          nome?: string
          pessoa_global_id?: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string
          id?: string
          nome?: string
          pessoa_global_id?: string
        }
        Relationships: []
      }
      plano_funcionalidades: {
        Row: {
          funcionalidade: string
          plano_id: string
        }
        ComputedFields: never
        Insert: {
          funcionalidade: string
          plano_id: string
        }
        Update: {
          funcionalidade?: string
          plano_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'plano_funcionalidades_funcionalidade_fkey'
            columns: ['funcionalidade']
            isOneToOne: false
            referencedRelation: 'funcionalidades'
            referencedColumns: ['chave']
          },
          {
            foreignKeyName: 'plano_funcionalidades_plano_id_fkey'
            columns: ['plano_id']
            isOneToOne: false
            referencedRelation: 'planos'
            referencedColumns: ['id']
          },
        ]
      }
      plano_versoes: {
        Row: {
          aprovado_em: string
          aprovado_por: string
          empreendimento_id: string
          id: string
          motivo: string | null
          premissas: NonNullable<Json>
          resumo: NonNullable<Json>
          tenant_id: string
          tma_mensal: number
          versao: number
          viabilidade_id: string
        }
        ComputedFields: never
        Insert: {
          aprovado_em?: string
          aprovado_por: string
          empreendimento_id: string
          id?: string
          motivo?: string | null
          premissas: NonNullable<Json>
          resumo: NonNullable<Json>
          tenant_id: string
          tma_mensal: number
          versao: number
          viabilidade_id: string
        }
        Update: {
          aprovado_em?: string
          aprovado_por?: string
          empreendimento_id?: string
          id?: string
          motivo?: string | null
          premissas?: NonNullable<Json>
          resumo?: NonNullable<Json>
          tenant_id?: string
          tma_mensal?: number
          versao?: number
          viabilidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'plano_versoes_tenant_id_empreendimento_id_fkey'
            columns: ['tenant_id', 'empreendimento_id']
            isOneToOne: false
            referencedRelation: 'empreendimentos'
            referencedColumns: ['tenant_id', 'id']
          },
          {
            foreignKeyName: 'plano_versoes_tenant_id_viabilidade_id_fkey'
            columns: ['tenant_id', 'viabilidade_id']
            isOneToOne: false
            referencedRelation: 'viabilidades'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      planos: {
        Row: {
          id: string
          max_lotes: number | null
          nome: string
          ordem: number
        }
        ComputedFields: never
        Insert: {
          id: string
          max_lotes?: number | null
          nome: string
          ordem?: number
        }
        Update: {
          id?: string
          max_lotes?: number | null
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      quadras: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          codigo: string
          criado_em: string
          criado_por: string | null
          empreendimento_id: string
          etapa_id: string | null
          id: string
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          codigo: string
          criado_em?: string
          criado_por?: string | null
          empreendimento_id: string
          etapa_id?: string | null
          id?: string
          tenant_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          codigo?: string
          criado_em?: string
          criado_por?: string | null
          empreendimento_id?: string
          etapa_id?: string | null
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'quadras_tenant_id_empreendimento_id_etapa_id_fkey'
            columns: ['tenant_id', 'empreendimento_id', 'etapa_id']
            isOneToOne: false
            referencedRelation: 'etapas'
            referencedColumns: ['tenant_id', 'empreendimento_id', 'id']
          },
          {
            foreignKeyName: 'quadras_tenant_id_empreendimento_id_fkey'
            columns: ['tenant_id', 'empreendimento_id']
            isOneToOne: false
            referencedRelation: 'empreendimentos'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      reajustes: {
        Row: {
          aniversario: string
          atualizado_em: string
          atualizado_por: string | null
          competencia_final: string
          competencia_inicial: string
          contrato_id: string
          criado_em: string
          criado_por: string | null
          diferenca_centavos: number
          fator: number
          fator_aplicado: number
          id: string
          indice: string
          parcelas: number
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          aniversario: string
          atualizado_em?: string
          atualizado_por?: string | null
          competencia_final: string
          competencia_inicial: string
          contrato_id: string
          criado_em?: string
          criado_por?: string | null
          diferenca_centavos: number
          fator: number
          fator_aplicado: number
          id?: string
          indice: string
          parcelas: number
          tenant_id: string
        }
        Update: {
          aniversario?: string
          atualizado_em?: string
          atualizado_por?: string | null
          competencia_final?: string
          competencia_inicial?: string
          contrato_id?: string
          criado_em?: string
          criado_por?: string | null
          diferenca_centavos?: number
          fator?: number
          fator_aplicado?: number
          id?: string
          indice?: string
          parcelas?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'reajustes_indice_fkey'
            columns: ['indice']
            isOneToOne: false
            referencedRelation: 'indices_economicos'
            referencedColumns: ['codigo']
          },
          {
            foreignKeyName: 'reajustes_tenant_id_contrato_id_fkey'
            columns: ['tenant_id', 'contrato_id']
            isOneToOne: false
            referencedRelation: 'contratos'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      recebimentos: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          criado_em: string
          criado_por: string | null
          data_pagamento: string
          desconto_centavos: number
          estornado_em: string | null
          estornado_por: string | null
          id: string
          juros_mora_centavos: number
          motivo_estorno: string | null
          multa_centavos: number
          observacao: string | null
          origem: string
          parcela_id: string
          principal_centavos: number
          referencia_externa: string | null
          tenant_id: string
          valor_centavos: number
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          data_pagamento: string
          desconto_centavos?: number
          estornado_em?: string | null
          estornado_por?: string | null
          id?: string
          juros_mora_centavos?: number
          motivo_estorno?: string | null
          multa_centavos?: number
          observacao?: string | null
          origem?: string
          parcela_id: string
          principal_centavos: number
          referencia_externa?: string | null
          tenant_id: string
          valor_centavos: number
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          data_pagamento?: string
          desconto_centavos?: number
          estornado_em?: string | null
          estornado_por?: string | null
          id?: string
          juros_mora_centavos?: number
          motivo_estorno?: string | null
          multa_centavos?: number
          observacao?: string | null
          origem?: string
          parcela_id?: string
          principal_centavos?: number
          referencia_externa?: string | null
          tenant_id?: string
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: 'recebimentos_tenant_id_parcela_id_fkey'
            columns: ['tenant_id', 'parcela_id']
            isOneToOne: false
            referencedRelation: 'parcelas'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      reservas: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          cliente_nome: string
          corretor_id: string | null
          criado_em: string
          criado_por: string | null
          empreendimento_id: string
          expira_em: string
          id: string
          lote_id: string
          motivo_encerramento: string | null
          situacao: string
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          cliente_nome: string
          corretor_id?: string | null
          criado_em?: string
          criado_por?: string | null
          empreendimento_id: string
          expira_em: string
          id?: string
          lote_id: string
          motivo_encerramento?: string | null
          situacao?: string
          tenant_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          cliente_nome?: string
          corretor_id?: string | null
          criado_em?: string
          criado_por?: string | null
          empreendimento_id?: string
          expira_em?: string
          id?: string
          lote_id?: string
          motivo_encerramento?: string | null
          situacao?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'reservas_tenant_id_corretor_id_fkey'
            columns: ['tenant_id', 'corretor_id']
            isOneToOne: false
            referencedRelation: 'corretores'
            referencedColumns: ['tenant_id', 'id']
          },
          {
            foreignKeyName: 'reservas_tenant_id_empreendimento_id_fkey'
            columns: ['tenant_id', 'empreendimento_id']
            isOneToOne: false
            referencedRelation: 'empreendimentos'
            referencedColumns: ['tenant_id', 'id']
          },
          {
            foreignKeyName: 'reservas_tenant_id_lote_id_fkey'
            columns: ['tenant_id', 'lote_id']
            isOneToOne: false
            referencedRelation: 'lotes'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      spes: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          cnpj: string | null
          criado_em: string
          criado_por: string | null
          empresa_id: string
          id: string
          razao_social: string
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          cnpj?: string | null
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          id?: string
          razao_social: string
          tenant_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          cnpj?: string | null
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          id?: string
          razao_social?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'spes_tenant_id_empresa_id_fkey'
            columns: ['tenant_id', 'empresa_id']
            isOneToOne: false
            referencedRelation: 'empresas'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      tenants: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          criado_em: string
          criado_por: string | null
          id: string
          nome: string
          plano_id: string
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome: string
          plano_id?: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome?: string
          plano_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tenants_plano_id_fkey'
            columns: ['plano_id']
            isOneToOne: false
            referencedRelation: 'planos'
            referencedColumns: ['id']
          },
        ]
      }
      vendas: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          comissao_modo: string
          comissao_percentual: number
          comprador_id: string
          corretor_id: string | null
          criado_em: string
          criado_por: string | null
          data_venda: string
          empreendimento_id: string
          entrada_centavos: number
          id: string
          juros_mensal: number
          justificativa_sem_registro: string | null
          lote_id: string
          parcelas: number
          preco_centavos: number
          primeira_parcela_em: string | null
          reserva_id: string | null
          sistema: string
          situacao: string
          tenant_id: string
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          comissao_modo?: string
          comissao_percentual?: number
          comprador_id: string
          corretor_id?: string | null
          criado_em?: string
          criado_por?: string | null
          data_venda: string
          empreendimento_id: string
          entrada_centavos: number
          id?: string
          juros_mensal: number
          justificativa_sem_registro?: string | null
          lote_id: string
          parcelas: number
          preco_centavos: number
          primeira_parcela_em?: string | null
          reserva_id?: string | null
          sistema: string
          situacao?: string
          tenant_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          comissao_modo?: string
          comissao_percentual?: number
          comprador_id?: string
          corretor_id?: string | null
          criado_em?: string
          criado_por?: string | null
          data_venda?: string
          empreendimento_id?: string
          entrada_centavos?: number
          id?: string
          juros_mensal?: number
          justificativa_sem_registro?: string | null
          lote_id?: string
          parcelas?: number
          preco_centavos?: number
          primeira_parcela_em?: string | null
          reserva_id?: string | null
          sistema?: string
          situacao?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'vendas_tenant_id_comprador_id_fkey'
            columns: ['tenant_id', 'comprador_id']
            isOneToOne: false
            referencedRelation: 'compradores'
            referencedColumns: ['tenant_id', 'id']
          },
          {
            foreignKeyName: 'vendas_tenant_id_corretor_id_fkey'
            columns: ['tenant_id', 'corretor_id']
            isOneToOne: false
            referencedRelation: 'corretores'
            referencedColumns: ['tenant_id', 'id']
          },
          {
            foreignKeyName: 'vendas_tenant_id_empreendimento_id_fkey'
            columns: ['tenant_id', 'empreendimento_id']
            isOneToOne: false
            referencedRelation: 'empreendimentos'
            referencedColumns: ['tenant_id', 'id']
          },
          {
            foreignKeyName: 'vendas_tenant_id_lote_id_fkey'
            columns: ['tenant_id', 'lote_id']
            isOneToOne: false
            referencedRelation: 'lotes'
            referencedColumns: ['tenant_id', 'id']
          },
          {
            foreignKeyName: 'vendas_tenant_id_reserva_id_fkey'
            columns: ['tenant_id', 'reserva_id']
            isOneToOne: false
            referencedRelation: 'reservas'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
      viabilidades: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          criado_em: string
          criado_por: string | null
          empreendimento_id: string
          id: string
          nome: string
          premissas: NonNullable<Json>
          situacao: Database['public']['Enums']['viabilidade_situacao']
          tenant_id: string
          tma_mensal: number
        }
        ComputedFields: never
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          empreendimento_id: string
          id?: string
          nome: string
          premissas: NonNullable<Json>
          situacao?: Database['public']['Enums']['viabilidade_situacao']
          tenant_id: string
          tma_mensal: number
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          criado_por?: string | null
          empreendimento_id?: string
          id?: string
          nome?: string
          premissas?: NonNullable<Json>
          situacao?: Database['public']['Enums']['viabilidade_situacao']
          tenant_id?: string
          tma_mensal?: number
        }
        Relationships: [
          {
            foreignKeyName: 'viabilidades_tenant_id_empreendimento_id_fkey'
            columns: ['tenant_id', 'empreendimento_id']
            isOneToOne: false
            referencedRelation: 'empreendimentos'
            referencedColumns: ['tenant_id', 'id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aceitar_convite: { Args: { p_token: string }; Returns: string }
      antecipar_parcelas: {
        Args: { p_contrato: string; p_data: string; p_itens: Json }
        Returns: number
      }
      aprovar_viabilidade: {
        Args: { p_motivo?: string; p_resumo: Json; p_viabilidade: string }
        Returns: number
      }
      cancelar_cobranca: { Args: { p_cobranca: string; p_motivo: string }; Returns: undefined }
      cancelar_reserva: { Args: { p_motivo: string; p_reserva: string }; Returns: undefined }
      ceder_contrato: {
        Args: { p_cessionario: string; p_contrato: string; p_data: string; p_motivo: string }
        Returns: string
      }
      conciliar_cobrancas: { Args: { p_limite?: number }; Returns: number }
      configurar_asaas: {
        Args: { p_ambiente: string; p_chave: string; p_tenant: string }
        Returns: string
      }
      criar_contrato: {
        Args: { p_indice?: string; p_parcelas: Json; p_venda: string }
        Returns: string
      }
      criar_convite: {
        Args: {
          p_email: string
          p_escopo_id?: string
          p_escopo_tipo?: Database['public']['Enums']['escopo']
          p_papel: Database['public']['Enums']['papel']
          p_tenant: string
          p_validade_dias?: number
        }
        Returns: string
      }
      criar_empreendimento_com_lotes: {
        Args: {
          p_data_base: string
          p_lotes: Json
          p_municipio: string
          p_nome: string
          p_spe: string
          p_tenant: string
          p_uf: string
        }
        Returns: string
      }
      criar_tenant: {
        Args: { p_cnpj?: string; p_nome: string; p_razao_social?: string }
        Returns: string
      }
      definir_parametro: {
        Args: {
          p_chave: string
          p_escopo?: string
          p_escopo_id?: string
          p_inicio: string
          p_motivo: string
          p_tenant: string
          p_valor: Json
        }
        Returns: string
      }
      desativar_asaas: { Args: { p_tenant: string }; Returns: undefined }
      estornar_recebimento: {
        Args: { p_motivo: string; p_recebimento: string }
        Returns: undefined
      }
      executar_distrato: {
        Args: {
          p_contrato: string
          p_data: string
          p_devolucoes: Json
          p_motivo: string
          p_resumo: Json
        }
        Returns: string
      }
      executar_reajustes: { Args: { p_data?: string }; Returns: number }
      expirar_reservas: { Args: Record<PropertyKey, never>; Returns: number }
      gerar_cobranca: { Args: { p_parcela: string }; Returns: string }
      importar_indices: { Args: Record<PropertyKey, never>; Returns: number }
      pagar_devolucao: { Args: { p_data: string; p_devolucao: string }; Returns: undefined }
      parametro_vigente: {
        Args: {
          p_chave: string
          p_data: string
          p_escopo?: Database['public']['Enums']['escopo']
          p_escopo_id?: string
          p_tenant: string
        }
        Returns: Json
      }
      publicar_modelo: {
        Args: { p_conteudo: string; p_nome: string; p_tenant: string; p_tipo: string }
        Returns: string
      }
      reajustar_contrato: { Args: { p_contrato: string }; Returns: number }
      registrar_recebimento: {
        Args: {
          p_data: string
          p_desconto?: number
          p_juros_mora?: number
          p_multa?: number
          p_observacao?: string
          p_origem?: string
          p_parcela: string
          p_principal: number
          p_referencia?: string
        }
        Returns: string
      }
      renegociar_contrato: {
        Args: {
          p_condicoes: Json
          p_contrato: string
          p_data: string
          p_desconto: number
          p_encargos: number
          p_motivo: string
          p_parcelas: Json
        }
        Returns: string
      }
      reservar_lote: {
        Args: { p_cliente_nome: string; p_corretor?: string; p_horas?: number; p_lote: string }
        Returns: string
      }
      trocar_lote: {
        Args: {
          p_condicoes: Json
          p_contrato: string
          p_data: string
          p_lote_novo: string
          p_motivo: string
          p_parcelas: Json
          p_preco_novo: number
        }
        Returns: string
      }
      usar_modelo_padrao: { Args: { p_tenant: string; p_tipo: string }; Returns: undefined }
      vender_lote: {
        Args: { p_justificativa?: string; p_lote: string; p_venda: Json }
        Returns: string
      }
      webhook_asaas: {
        Args: { p_evento: Json; p_tenant: string; p_token: string }
        Returns: string
      }
    }
    Enums: {
      empreendimento_situacao: 'estudo' | 'aprovacao' | 'registrado' | 'em_vendas' | 'encerrado'
      empreendimento_tipo: 'loteamento' | 'desmembramento' | 'condominio_lotes'
      escopo: 'tenant' | 'empresa' | 'spe' | 'empreendimento'
      gleba_situacao: 'identificada' | 'em_analise' | 'negociando' | 'adquirida' | 'descartada'
      lote_status: 'disponivel' | 'reservado' | 'vendido' | 'bloqueado' | 'permuta'
      papel:
        | 'dono'
        | 'financeiro'
        | 'engenharia'
        | 'comercial_gestor'
        | 'corretor'
        | 'contador'
        | 'socio_leitura'
        | 'permutante_leitura'
      parametro_tipo: 'decimal' | 'inteiro' | 'centavos' | 'texto' | 'booleano'
      viabilidade_situacao: 'rascunho' | 'aprovada' | 'arquivada'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      empreendimento_situacao: ['estudo', 'aprovacao', 'registrado', 'em_vendas', 'encerrado'],
      empreendimento_tipo: ['loteamento', 'desmembramento', 'condominio_lotes'],
      escopo: ['tenant', 'empresa', 'spe', 'empreendimento'],
      gleba_situacao: ['identificada', 'em_analise', 'negociando', 'adquirida', 'descartada'],
      lote_status: ['disponivel', 'reservado', 'vendido', 'bloqueado', 'permuta'],
      papel: [
        'dono',
        'financeiro',
        'engenharia',
        'comercial_gestor',
        'corretor',
        'contador',
        'socio_leitura',
        'permutante_leitura',
      ],
      parametro_tipo: ['decimal', 'inteiro', 'centavos', 'texto', 'booleano'],
      viabilidade_situacao: ['rascunho', 'aprovada', 'arquivada'],
    },
  },
} as const
