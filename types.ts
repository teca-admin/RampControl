
export interface Flight {
  id: string;
  relatorio_id: string;
  companhia: string;
  numero: string;
  pouso: string;
  calco: string;
  inicio_atendimento: string;
  termino_atendimento: string;
  reboque: string;
  criado_em: string;
}

export interface FleetStat {
  status: 'OPERACIONAL' | 'MANUTENCAO' | 'ALUGADO';
  total: number;
}

export interface ShiftReport {
  id: string;
  titulo: string;
  data: string;
  turno: 'manha' | 'manhã' | 'tarde' | 'noite';
  lider: string;
  
  teve_falta: boolean;
  teve_atestado: boolean;
  teve_compensacao: boolean;
  teve_saida_antecipada: boolean;
  
  tem_pendencias: boolean;
  descricao_pendencias?: string;
  
  tem_ocorrencias: boolean;
  descricao_ocorrencias?: string;
  
  tem_aluguel: boolean;
  aluguel_equipamento?: string;
  aluguel_inicio?: string;
  aluguel_fim?: string;
  
  tem_equipamento_enviado: boolean;
  equipamento_enviado_nome?: string;
  equipamento_enviado_motivo?: string;
  tem_equipamento_retornado: boolean;
  equipamento_retornado_nome?: string;
  
  total_voos: number;
  total_voos_real?: number;
  voos?: Flight[];
  
  processado_em: string;
  mensagem_original?: string;
  criado_em: string;
  atualizado_em: string;
}
