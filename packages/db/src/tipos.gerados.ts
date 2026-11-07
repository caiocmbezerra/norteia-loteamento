export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
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
      aprovar_viabilidade: {
        Args: { p_motivo?: string; p_resumo: Json; p_viabilidade: string }
        Returns: number
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
