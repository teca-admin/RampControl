
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Plane, Wrench, Clock, AlertCircle, CheckCircle2, Calendar, 
  Timer, ChevronLeft, ChevronRight, Zap, HardHat, ArrowRight, 
  Activity, ShieldAlert, UserMinus, FileText, Clock8, 
  LayoutDashboard, TrendingUp, RefreshCcw, 
  Handshake, UserPlus, Settings, Search, ExternalLink, 
  X, History, Award, BarChart as BarChartIcon,
  AlertTriangle, Truck, Layers, Info, PlusSquare, Plus, Trash2, Save, Share2, Loader2
} from 'lucide-react';
import { supabase } from './supabase';
import { ShiftReport, Flight, FleetStat } from './types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, LabelList
} from 'recharts';

// --- HELPERS ---
const timeToMinutes = (time?: any): number => {
  if (typeof time !== 'string' || !time) return 0;
  try {
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  } catch { return 0; }
};

const getDurationMinutes = (start?: any, end?: any): number => {
  if (!start || !end) return 0;
  let diff = (timeToMinutes(end) as number) - (timeToMinutes(start) as number);
  if (diff < 0) diff += 1440; 
  return diff;
};

const calculateTurnaround = (pouso?: any, reboque?: any): string => {
  const diff = getDurationMinutes(pouso, reboque);
  if (diff === 0 && !pouso) return '--';
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return h === 0 ? `${m}min` : `${h}h ${m}m`;
};

const isValidFlight = (v: any): boolean => {
  if (!v || typeof v !== 'object') return false;
  return !!(v.companhia && v.numero && String(v.companhia) !== 'null');
};

const App: React.FC = () => {
  // Estado de Inicialização
  const [bootstrapped, setBootstrapped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtros e Navegação
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'history' | 'new_report'>('dashboard');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedShift, setSelectedShift] = useState<'manha' | 'tarde' | 'noite'>('manha');

  // Dados do Dashboard
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [fleetStats, setFleetStats] = useState<FleetStat[]>([]);
  const [fleetDetails, setFleetDetails] = useState<any[]>([]);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [allFlights, setAllFlights] = useState<any[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any>({ 
    monthlyFlights: 0, avgTurnaround: 0, rentalCount: 0, 
    rentalHours: 0, chartData: [], rentalHistory: [], rentalRanking: []
  });

  // Estado do Novo Relatório (Formulário)
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formShift, setFormShift] = useState<'manha' | 'tarde' | 'noite'>('manha');
  const [formLeader, setFormLeader] = useState('');
  const [formHR, setFormHR] = useState({ falta: false, atestado: false, compensacao: false, saida_antecipada: false });
  const [formPendencias, setFormPendencias] = useState('');
  const [formOcorrencias, setFormOcorrencias] = useState('');
  const [formAluguel, setFormAluguel] = useState({ ativo: false, nome: '', inicio: '', fim: '' });
  const [formGseOut, setFormGseOut] = useState({ ativo: false, nome: '', motivo: '' });
  const [formGseIn, setFormGseIn] = useState({ ativo: false, nome: '' });
  const [formFlights, setFormFlights] = useState<Partial<Flight>[]>([
    { companhia: '', numero: '', pouso: '', calco: '', inicio_atendimento: '', termino_atendimento: '', reboque: '' }
  ]);

  // UI
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showRentalModal, setShowRentalModal] = useState(false);

  // --- LÓGICA DE PERSISTÊNCIA ---
  const handleAddFlight = () => {
    setFormFlights([...formFlights, { companhia: '', numero: '', pouso: '', calco: '', inicio_atendimento: '', termino_atendimento: '', reboque: '' }]);
  };

  const handleRemoveFlight = (index: number) => {
    setFormFlights(formFlights.filter((_, i) => i !== index));
  };

  const handleFlightChange = (index: number, field: keyof Flight, value: string) => {
    const updated = [...formFlights];
    updated[index] = { ...updated[index], [field]: value };
    setFormFlights(updated);
  };

  const handleSaveReport = async () => {
    if (!formLeader) {
      alert("Por favor, informe o nome do Líder.");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Inserir Relatório Principal
      const { data: newReport, error: reportErr } = await supabase
        .from('relatorios_entrega_turno')
        .insert([{
          data: formDate,
          turno: formShift === 'manha' ? 'manhã' : formShift,
          lider: formLeader,
          teve_falta: formHR.falta,
          teve_atestado: formHR.atestado,
          teve_compensacao: formHR.compensacao,
          teve_saida_antecipada: formHR.saida_antecipada,
          tem_pendencias: !!formPendencias && formPendencias.toLowerCase() !== 'não',
          descricao_pendencias: formPendencias,
          tem_ocorrencias: !!formOcorrencias && formOcorrencias.toLowerCase() !== 'não',
          descricao_ocorrencias: formOcorrencias,
          tem_aluguel: formAluguel.ativo,
          aluguel_equipamento: formAluguel.ativo ? formAluguel.nome : null,
          aluguel_inicio: formAluguel.ativo ? formAluguel.inicio : null,
          aluguel_fim: formAluguel.ativo ? formAluguel.fim : null,
          tem_equipamento_enviado: formGseOut.ativo,
          equipamento_enviado_nome: formGseOut.ativo ? formGseOut.nome : null,
          equipamento_enviado_motivo: formGseOut.ativo ? formGseOut.motivo : null,
          tem_equipamento_retornado: formGseIn.ativo,
          equipamento_retornado_nome: formGseIn.ativo ? formGseIn.nome : null,
          total_voos: formFlights.length
        }])
        .select()
        .single();

      if (reportErr) throw reportErr;

      // 2. Inserir Voos Relacionados
      if (formFlights.length > 0) {
        const voosToInsert = formFlights
          .filter(v => v.companhia && v.numero)
          .map(v => ({
            ...v,
            relatorio_id: newReport.id
          }));

        if (voosToInsert.length > 0) {
          const { error: voosErr } = await supabase.from('voos').insert(voosToInsert);
          if (voosErr) throw voosErr;
        }
      }

      alert("Relatório salvo com sucesso!");
      
      // Resetar formulário e voltar pro dashboard
      setActiveTab('dashboard');
      setSelectedDate(formDate);
      setSelectedShift(formShift);
      
    } catch (err: any) {
      alert(`Erro ao salvar: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateWhatsAppMessage = () => {
    const header = `✅ *RELATÓRIO DE ENTREGA DE TURNO*\n🗓️ ${formDate.split('-').reverse().join('/')}\nTurno: ${formShift}\nLíder: ${formLeader}\n\n`;
    const hr = `1 - Falta: ${formHR.falta ? 'Sim' : 'Não'}\nAtestado: ${formHR.atestado ? 'Sim' : 'Não'}\nCompensação: ${formHR.compensacao ? 'Sim' : 'Não'}\nSaída antecipada: ${formHR.saida_antecipada ? 'Sim' : 'Não'}\n\n`;
    const pendencias = `2 - Relatar todas as pendências importantes que ficaram para o turno seguinte:\n${formPendencias || 'Não'}\n\n`;
    const ocorrencias = `3 - Relatar todas ocorrências importantes:\n${formOcorrencias || 'Não'}\n\n`;
    const aluguel = `4 - Aluguel: ${formAluguel.ativo ? 'Sim' : 'Não'}\n${formAluguel.ativo ? `${formAluguel.nome}\nInício: ${formAluguel.inicio}\nFim: ${formAluguel.fim}` : ''}\n\n`;
    
    let voos = `5 - Voos atendidos:\n`;
    formFlights.forEach(v => {
      if (v.companhia) {
        voos += `*${v.companhia} ${v.numero}*\nPouso: ${v.pouso || '--'}\nReboque: ${v.reboque || '--'}\n\n`;
      }
    });

    const gse = `6 - Algum equipamento enviado para o GSE?\n${formGseOut.ativo ? `Sim\n${formGseOut.nome}\nMotivo: ${formGseOut.motivo}` : 'Não'}\n\n7 - Algum equipamento retornou do GSE?\n${formGseIn.ativo ? formGseIn.nome : 'Não'}`;

    const fullMessage = header + hr + pendencias + ocorrencias + aluguel + voos + gse;
    navigator.clipboard.writeText(fullMessage);
    alert("Texto copiado para o WhatsApp!");
  };

  // --- BUSCADORES DE DADOS ---
  const fetchData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      
      if (activeTab === 'dashboard') {
        const { data } = await supabase
          .from('vw_relatorios_completos')
          .select('*')
          .eq('data', selectedDate)
          .or(`turno.eq.${selectedShift},turno.eq.${selectedShift === 'manha' ? 'manhã' : selectedShift}`)
          .order('criado_em', { ascending: false })
          .limit(1);

        if (data?.[0]) {
          const raw = data[0];
          if (raw.voos) raw.voos = raw.voos.filter(isValidFlight);
          setReport(raw);
        } else {
          setReport(null);
        }
      }

      // Buscar Frota
      const { data: fStats } = await supabase.from('vw_resumo_frota').select('*');
      if (fStats) setFleetStats(fStats);

      const { data: allEquips } = await supabase.from('equipamentos').select('*').order('prefixo', { ascending: true });
      if (allEquips) setFleetDetails(allEquips);

      // Buscar Líderes
      const { data: leadersData } = await supabase.from('lideres').select('*').order('nome', { ascending: true });
      if (leadersData) setLeaders(leadersData);

      if (activeTab === 'analytics' || activeTab === 'history') {
        const { data: periodData } = await supabase
          .from('vw_relatorios_completos')
          .select('*')
          .gte('data', startDate)
          .lte('data', endDate)
          .order('data', { ascending: false });

        if (periodData) {
          let fCount = 0, tMins = 0, fWithT = 0, rCount = 0, rMins = 0;
          const fList: any[] = [], rList: any[] = [];
          const rMap: Record<string, number> = {};

          periodData.forEach((curr: any) => {
            if (curr.tem_aluguel) {
               rCount++;
               const dur = getDurationMinutes(curr.aluguel_inicio, curr.aluguel_fim);
               rMins += dur;
               rMap[curr.aluguel_equipamento || 'N/A'] = (rMap[curr.aluguel_equipamento || 'N/A'] || 0) + 1;
               rList.push({ data: curr.data, turno: curr.turno, equipamento: curr.aluguel_equipamento, duracao: Math.round(dur/60) });
            }
            if (curr.voos) {
              curr.voos.forEach((v: any) => {
                if (!isValidFlight(v)) return;
                fCount++;
                const dur = getDurationMinutes(v.pouso, v.reboque);
                if (dur > 0) { tMins += dur; fWithT++; }
                fList.push({ ...v, parentDate: curr.data, parentShift: curr.turno, parentLider: curr.lider });
              });
            }
          });

          setAnalyticsData({ 
            monthlyFlights: fCount, 
            avgTurnaround: fWithT > 0 ? Math.round(tMins / fWithT) : 0,
            rentalCount: rCount,
            rentalHours: Math.round(rMins / 60),
            chartData: [], 
            rentalHistory: rList,
            rentalRanking: Object.entries(rMap).map(([name, count]) => ({ name, count })).sort((a: any, b: any) => b.count - a.count)
          });
          setAllFlights(fList);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!isSilent) setLoading(false);
      setBootstrapped(true);
      const loader = document.getElementById('fallback-loader');
      if (loader) loader.style.display = 'none';
    }
  }, [selectedDate, selectedShift, activeTab, startDate, endDate]);

  useEffect(() => {
    if (bootstrapped) fetchData();
  }, [selectedDate, selectedShift, activeTab, startDate, endDate]);

  useEffect(() => {
    const init = async () => {
      fetchData();
    };
    init();
  }, []);

  const fleetSummary = useMemo(() => {
    const op = fleetStats.find(s => s.status === 'OPERACIONAL')?.total || 0;
    const mt = fleetStats.find(s => s.status === 'MANUTENCAO')?.total || 0;
    return { op, mt, total: op + mt };
  }, [fleetStats]);

  const filteredHistory = useMemo(() => {
    if (!searchQuery) return allFlights;
    const q = searchQuery.toLowerCase();
    return allFlights.filter(f => 
      String(f.numero || '').toLowerCase().includes(q) || 
      String(f.companhia || '').toLowerCase().includes(q)
    );
  }, [allFlights, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased font-sans overflow-hidden">
      <div 
        className="origin-top-left flex flex-col"
        style={{ transform: 'scale(0.75)', width: '133.3333%', height: '133.3333%', position: 'absolute', top: 0, left: 0 }}
      >
        {/* Header */}
        <header className="bg-slate-900/50 border-b border-white/5 px-8 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-sm"><Zap size={18} className="text-white fill-white" /></div>
              <div><h1 className="text-lg font-black tracking-tighter uppercase italic leading-none">Ramp<span className="text-blue-500">Controll</span></h1><div className="flex items-center gap-2 mt-1"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div><p className="text-[7px] font-black text-slate-500 uppercase tracking-widest">SISTEMA GSE</p></div></div>
            </div>
            <nav className="flex bg-white/5 p-1 rounded-sm border border-white/5">
              {[
                { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
                { id: 'analytics', label: 'Análises', icon: BarChartIcon },
                { id: 'history', label: 'Histórico', icon: Clock8 },
                { id: 'new_report', label: 'Lançar Turno', icon: PlusSquare },
              ].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-6 py-2 text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}><tab.icon size={12} /> {tab.label}</button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {activeTab === 'dashboard' ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-slate-800/50 border border-white/5 rounded-sm overflow-hidden">
                    <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d.toISOString().split('T')[0]); }} className="p-2 hover:bg-white/10 text-slate-400"><ChevronLeft size={14}/></button>
                    <div className="px-3 flex items-center gap-2 border-x border-white/5"><Calendar size={12} className="text-blue-500" /><input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent border-none font-black text-[10px] focus:ring-0 text-white w-28 uppercase cursor-pointer" /></div>
                    <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d.toISOString().split('T')[0]); }} className="p-2 hover:bg-white/10 text-slate-400"><ChevronRight size={14}/></button>
                </div>
                <div className="flex bg-slate-800/50 p-1 border border-white/5 rounded-sm gap-1">
                    {(['manha', 'tarde', 'noite'] as const).map(t => (
                      <button key={t} onClick={() => setSelectedShift(t)} className={`px-4 py-1.5 text-[8px] font-black uppercase tracking-tighter transition-all ${selectedShift === t ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t === 'manha' ? 'Manhã' : t === 'tarde' ? 'Tarde' : 'Noite'}</button>
                    ))}
                </div>
              </div>
            ) : activeTab === 'new_report' ? null : (
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-slate-800/50 border border-white/5 rounded-sm overflow-hidden px-4 py-2 gap-4">
                    <div className="flex items-center gap-2"><Calendar size={12} className="text-blue-500" /><span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">DE</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent border-none font-black text-[10px] focus:ring-0 text-white w-28 cursor-pointer" /></div>
                    <div className="w-px h-4 bg-white/10"></div>
                    <div className="flex items-center gap-2"><span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">ATÉ</span><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent border-none font-black text-[10px] focus:ring-0 text-white w-28 cursor-pointer" /></div>
                </div>
              </div>
            )}
            <button onClick={() => fetchData()} className="p-2 bg-white/5 border border-white/5 hover:bg-white/10 text-slate-400 transition-all rounded-sm"><RefreshCcw size={14} className={loading ? 'animate-spin text-blue-500' : ''} /></button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-6 flex flex-col gap-6 overflow-hidden">
          {activeTab === 'new_report' ? (
            <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 pb-10 animate-in slide-in-from-bottom-5 duration-500">
              
              {/* Form Header */}
              <div className="bg-slate-900/40 border border-white/5 p-8 shadow-2xl flex flex-wrap gap-10 items-end">
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest italic">Data do Turno</p>
                  <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="bg-slate-950 border border-white/5 p-3 font-black text-sm rounded-sm text-white focus:ring-1 focus:ring-blue-500 w-48" />
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest italic">Turno</p>
                  <div className="flex bg-slate-950 p-1 border border-white/5 rounded-sm gap-1">
                    {(['manha', 'tarde', 'noite'] as const).map(t => (
                      <button key={t} onClick={() => setFormShift(t)} className={`px-6 py-2 text-[9px] font-black uppercase transition-all ${formShift === t ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 space-y-3">
                  <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest italic">Líder do Plantão</p>
                  <div className="relative">
                    <HardHat className="absolute left-3 top-3.5 text-slate-600" size={16} />
                    <select 
                      value={formLeader} 
                      onChange={e => setFormLeader(e.target.value)} 
                      className="bg-slate-950 border border-white/5 p-3 pl-10 font-black text-sm rounded-sm text-white focus:ring-1 focus:ring-blue-500 w-full appearance-none cursor-pointer"
                    >
                      <option value="">SELECIONE O LÍDER...</option>
                      {leaders.map(l => (
                        <option key={l.id} value={l.nome}>{l.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Seção RH e Operacional */}
                <div className="lg:col-span-1 flex flex-col gap-6">
                  {/* RH */}
                  <div className="bg-slate-900/40 border border-white/5 p-6 shadow-xl space-y-4">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-3"><UserPlus size={16} className="text-blue-500" /><h4 className="text-[11px] font-black text-white uppercase italic">1 - Equipe (RH)</h4></div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: 'falta', label: 'Falta' },
                        { key: 'atestado', label: 'Atestado' },
                        { key: 'compensacao', label: 'Compensação' },
                        { key: 'saida_antecipada', label: 'Saída Ant.' }
                      ].map(item => (
                        <button key={item.key} onClick={() => setFormHR({ ...formHR, [item.key]: !formHR[item.key as keyof typeof formHR] })} className={`p-4 border transition-all flex flex-col items-center justify-center gap-2 group ${formHR[item.key as keyof typeof formHR] ? 'bg-rose-500/10 border-rose-500/50' : 'bg-slate-950 border-white/5 hover:border-white/10'}`}>
                           {item.key === 'falta' ? <UserMinus size={20} className={formHR[item.key as keyof typeof formHR] ? 'text-rose-500' : 'text-slate-700'} /> : <FileText size={20} className={formHR[item.key as keyof typeof formHR] ? 'text-rose-500' : 'text-slate-700'} />}
                           <span className={`text-[8px] font-black uppercase ${formHR[item.key as keyof typeof formHR] ? 'text-rose-400' : 'text-slate-600'}`}>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pendências e Ocorrências */}
                  <div className="bg-slate-900/40 border border-white/5 p-6 shadow-xl space-y-6">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center"><p className="text-[10px] font-black text-amber-500 uppercase italic">2 - Pendências</p><button onClick={() => setFormPendencias('Não')} className="text-[8px] font-black text-slate-600 hover:text-white uppercase underline">Não houve</button></div>
                      <textarea value={formPendencias} onChange={e => setFormPendencias(e.target.value)} rows={3} className="bg-slate-950 border border-white/5 p-4 font-bold text-[11px] rounded-sm text-slate-300 focus:ring-1 focus:ring-amber-500 w-full" placeholder="DESCREVA AS PENDÊNCIAS..."></textarea>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center"><p className="text-[10px] font-black text-rose-500 uppercase italic">3 - Ocorrências</p><button onClick={() => setFormOcorrencias('Não')} className="text-[8px] font-black text-slate-600 hover:text-white uppercase underline">Não houve</button></div>
                      <textarea value={formOcorrencias} onChange={e => setFormOcorrencias(e.target.value)} rows={3} className="bg-slate-950 border border-white/5 p-4 font-bold text-[11px] rounded-sm text-slate-300 focus:ring-1 focus:ring-rose-500 w-full" placeholder="DESCREVA AS OCORRÊNCIAS..."></textarea>
                    </div>
                  </div>

                   {/* GSE (Entrada/Saída) */}
                   <div className="bg-slate-900/40 border border-white/5 p-6 shadow-xl space-y-6">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <p className="text-[10px] font-black text-rose-500 uppercase italic">6 - Envio para GSE</p>
                          <button onClick={() => setFormGseOut({ ...formGseOut, ativo: !formGseOut.ativo })} className={`text-[8px] font-black uppercase px-2 py-1 border ${formGseOut.ativo ? 'bg-rose-600 text-white' : 'text-slate-600 border-white/5'}`}>{formGseOut.ativo ? 'ATIVO' : 'DESATIVADO'}</button>
                        </div>
                        {formGseOut.ativo && (
                          <div className="space-y-2 animate-in fade-in duration-300">
                             <select value={formGseOut.nome} onChange={e => setFormGseOut({ ...formGseOut, nome: e.target.value })} className="bg-slate-950 border border-white/5 p-2 font-black text-[10px] rounded-sm text-white w-full focus:ring-1 focus:ring-rose-500">
                                <option value="">SELECIONE O EQUIPAMENTO...</option>
                                {fleetDetails.map(eq => (
                                  <option key={eq.id} value={eq.prefixo}>[{eq.prefixo}] {eq.nome} ({eq.status})</option>
                                ))}
                             </select>
                             <input type="text" placeholder="MOTIVO DO ENVIO..." value={formGseOut.motivo} onChange={e => setFormGseOut({ ...formGseOut, motivo: e.target.value })} className="bg-slate-950 border border-white/5 p-2 font-black text-[10px] rounded-sm text-white w-full" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-4 pt-4 border-t border-white/5">
                        <div className="flex justify-between items-center">
                          <p className="text-[10px] font-black text-emerald-500 uppercase italic">7 - Retorno do GSE</p>
                          <button onClick={() => setFormGseIn({ ...formGseIn, ativo: !formGseIn.ativo })} className={`text-[8px] font-black uppercase px-2 py-1 border ${formGseIn.ativo ? 'bg-emerald-600 text-white' : 'text-slate-600 border-white/5'}`}>{formGseIn.ativo ? 'ATIVO' : 'DESATIVADO'}</button>
                        </div>
                        {formGseIn.ativo && (
                          <select value={formGseIn.nome} onChange={e => setFormGseIn({ ...formGseIn, nome: e.target.value })} className="bg-slate-950 border border-white/5 p-2 font-black text-[10px] rounded-sm text-white w-full animate-in fade-in duration-300 focus:ring-1 focus:ring-emerald-500">
                            <option value="">SELECIONE O EQUIPAMENTO...</option>
                            {fleetDetails.map(eq => (
                              <option key={eq.id} value={eq.prefixo}>[{eq.prefixo}] {eq.nome} ({eq.status})</option>
                            ))}
                          </select>
                        )}
                      </div>
                   </div>
                </div>

                {/* Seção Voos (Principal) */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                   <div className="bg-slate-900/40 border border-white/5 p-8 shadow-2xl flex flex-col h-full min-h-[600px]">
                      <div className="flex justify-between items-center mb-8 shrink-0">
                        <div className="flex items-center gap-3"><Plane size={20} className="text-blue-500" /><h4 className="text-[14px] font-black text-white uppercase italic tracking-widest">5 - Voos Atendidos</h4></div>
                        <button onClick={handleAddFlight} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-6 py-2.5 text-[9px] font-black text-white transition-all rounded-sm uppercase tracking-widest italic shadow-lg shadow-blue-500/10"><Plus size={14}/> Adicionar Voo</button>
                      </div>
                      <div className="flex-1 overflow-y-auto custom-scrollbar pr-3 space-y-4">
                        {formFlights.map((voo, idx) => (
                          <div key={idx} className="bg-slate-950 border border-white/5 p-6 rounded-sm relative group animate-in slide-in-from-right-5 duration-300">
                             <button onClick={() => handleRemoveFlight(idx)} className="absolute top-4 right-4 text-slate-700 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100"><Trash2 size={16} /></button>
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                               <div className="space-y-2">
                                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest italic">Companhia</p>
                                  <input type="text" placeholder="LATAM, AZUL..." value={voo.companhia} onChange={e => handleFlightChange(idx, 'companhia', e.target.value)} className="bg-slate-900 border border-white/5 p-2 font-black text-[12px] rounded-sm text-white w-full" />
                               </div>
                               <div className="space-y-2">
                                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest italic">Nº Voo</p>
                                  <input type="text" placeholder="LA3200..." value={voo.numero} onChange={e => handleFlightChange(idx, 'numero', e.target.value)} className="bg-slate-900 border border-white/5 p-2 font-black text-[12px] rounded-sm text-white w-full" />
                               </div>
                               <div className="space-y-2">
                                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest italic">Pouso</p>
                                  <input type="time" value={voo.pouso} onChange={e => handleFlightChange(idx, 'pouso', e.target.value)} className="bg-slate-900 border border-white/5 p-2 font-black text-[12px] rounded-sm text-blue-400 w-full" />
                               </div>
                               <div className="space-y-2">
                                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest italic">Reboque</p>
                                  <input type="time" value={voo.reboque} onChange={e => handleFlightChange(idx, 'reboque', e.target.value)} className="bg-slate-900 border border-white/5 p-2 font-black text-[12px] rounded-sm text-emerald-400 w-full" />
                               </div>
                               <div className="space-y-2">
                                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest italic">Calço</p>
                                  <input type="time" value={voo.calco} onChange={e => handleFlightChange(idx, 'calco', e.target.value)} className="bg-slate-900 border border-white/5 p-2 font-black text-[12px] rounded-sm text-slate-400 w-full" />
                               </div>
                               <div className="space-y-2">
                                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest italic">Início</p>
                                  <input type="time" value={voo.inicio_atendimento} onChange={e => handleFlightChange(idx, 'inicio_atendimento', e.target.value)} className="bg-slate-900 border border-white/5 p-2 font-black text-[12px] rounded-sm text-slate-400 w-full" />
                               </div>
                               <div className="space-y-2">
                                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest italic">Término</p>
                                  <input type="time" value={voo.termino_atendimento} onChange={e => handleFlightChange(idx, 'termino_atendimento', e.target.value)} className="bg-slate-900 border border-white/5 p-2 font-black text-[12px] rounded-sm text-slate-400 w-full" />
                               </div>
                               <div className="flex items-end justify-end">
                                  <div className="text-right">
                                    <p className="text-[7px] font-black text-slate-600 uppercase tracking-widest mb-1 italic">Solo Calc.</p>
                                    <p className="text-[14px] font-black italic text-slate-100 tabular-nums">{calculateTurnaround(voo.pouso, voo.reboque)}</p>
                                  </div>
                               </div>
                             </div>
                          </div>
                        ))}
                      </div>
                   </div>

                   {/* Locação (Footer do Form) */}
                   <div className="bg-slate-900/40 border border-white/5 p-8 shadow-2xl flex flex-col gap-6">
                      <div className="flex justify-between items-center"><div className="flex items-center gap-3"><Handshake size={20} className="text-blue-500" /><h4 className="text-[12px] font-black text-white uppercase italic tracking-widest">4 - Locação de Equipamentos</h4></div><button onClick={() => setFormAluguel({ ...formAluguel, ativo: !formAluguel.ativo })} className={`text-[8px] font-black uppercase px-4 py-1.5 border ${formAluguel.ativo ? 'bg-blue-600 text-white' : 'text-slate-600 border-white/5'}`}>{formAluguel.ativo ? 'ATIVO' : 'SEM ALUGUEL'}</button></div>
                      {formAluguel.ativo && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-300">
                           <div className="space-y-2">
                             <p className="text-[8px] font-black text-slate-500 uppercase italic">Equipamento</p>
                             <input type="text" placeholder="MODELO/TIPO..." value={formAluguel.nome} onChange={e => setFormAluguel({ ...formAluguel, nome: e.target.value })} className="bg-slate-950 border border-white/5 p-2 font-black text-[10px] rounded-sm text-white w-full" />
                           </div>
                           <div className="space-y-2"><p className="text-[8px] font-black text-slate-500 uppercase italic">Início</p><input type="time" value={formAluguel.inicio} onChange={e => setFormAluguel({ ...formAluguel, inicio: e.target.value })} className="bg-slate-950 border border-white/5 p-2 font-black text-[10px] rounded-sm text-white w-full" /></div>
                           <div className="space-y-2"><p className="text-[8px] font-black text-slate-500 uppercase italic">Fim</p><input type="time" value={formAluguel.fim} onChange={e => setFormAluguel({ ...formAluguel, fim: e.target.value })} className="bg-slate-950 border border-white/5 p-2 font-black text-[10px] rounded-sm text-white w-full" /></div>
                        </div>
                      )}
                   </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="sticky bottom-0 bg-slate-950/90 backdrop-blur-md border-t border-white/10 p-8 flex justify-between items-center z-50 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-4">
                  <button onClick={generateWhatsAppMessage} className="flex items-center gap-3 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 px-8 py-3.5 text-[10px] font-black text-emerald-500 transition-all rounded-sm uppercase tracking-[0.2em] italic"><Share2 size={16}/> Copiar Resumo WhatsApp</button>
                  <p className="text-[8px] font-bold text-slate-600 max-w-[200px] uppercase leading-relaxed">O resumo formatado permite compartilhamento instantâneo com a coordenação.</p>
                </div>
                <div className="flex items-center gap-6">
                   <button onClick={() => setActiveTab('dashboard')} className="text-[10px] font-black text-slate-500 uppercase hover:text-white transition-all">Cancelar</button>
                   <button disabled={isSubmitting} onClick={handleSaveReport} className="flex items-center gap-3 bg-blue-600 hover:bg-blue-500 px-12 py-3.5 text-[10px] font-black text-white transition-all rounded-sm uppercase tracking-[0.3em] italic shadow-2xl shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
                     {isSubmitting ? 'Salvando...' : <><Save size={16}/> Finalizar & Salvar</>}
                   </button>
                </div>
              </div>

            </div>
          ) : loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-50"><RefreshCcw size={40} className="animate-spin text-blue-500" /><p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-400 italic">CARREGANDO DADOS...</p></div>
          ) : activeTab === 'dashboard' ? (
            <div className="flex-1 flex flex-col gap-6 animate-in fade-in duration-500">
              {report ? (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[55%] min-h-[400px]">
                      <div className="lg:col-span-3 bg-slate-900/40 border border-white/5 p-10 flex flex-col shadow-2xl relative group overflow-hidden">
                        <div className="absolute top-0 right-0 p-10 opacity-[0.03] scale-150 rotate-12 pointer-events-none group-hover:opacity-[0.05] transition-opacity duration-1000"><Plane size={240} /></div>
                        <div className="flex justify-between items-start mb-10 shrink-0 relative z-10">
                            <div><span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em] mb-3 block italic">Relatório de Entrega de Turno</span><h2 className="text-4xl font-black tracking-tighter italic uppercase text-white leading-none">LOG DE <span className="text-blue-600">ATENDIMENTOS</span></h2></div>
                            <div className="bg-slate-800/80 px-5 py-4 border border-white/5 shadow-lg"><p className="text-[8px] font-black text-slate-500 uppercase mb-1">Responsável</p><div className="flex items-center gap-3 text-blue-100 font-black italic uppercase text-base"><HardHat size={20} className="text-blue-500" /> {String(report.lider || 'N/A')}</div></div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-3 space-y-4 relative z-10">
                            {report.voos && report.voos.length > 0 ? report.voos.map((voo, idx) => (
                              <div key={idx} className="bg-slate-950/50 border border-white/5 p-6 hover:border-blue-500/40 transition-all flex justify-between items-center group/voo shadow-sm">
                                <div className="flex items-center gap-8"><div className="bg-blue-600/10 p-4 group-hover/voo:bg-blue-600 transition-all"><Plane size={24} className="text-blue-500 group-hover/voo:text-white" /></div><div><p className="text-2xl font-black italic tracking-tighter uppercase text-white">{String(voo.companhia)} <span className="text-blue-500">{String(voo.numero)}</span></p><div className="flex items-center gap-4 mt-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest"><span className="flex items-center gap-1.5"><Clock size={12} className="text-blue-400"/> POUSO {String(voo.pouso)}</span><ArrowRight size={10} className="text-slate-700" /><span className="flex items-center gap-1.5"><Timer size={12} className="text-emerald-400"/> REBOQUE {String(voo.reboque)}</span></div></div></div>
                                <div className="text-right"><p className="text-[9px] font-black text-blue-500/50 uppercase mb-1 tracking-widest italic">Tempo de Solo</p><p className="text-3xl font-black tabular-nums text-white italic tracking-tighter">{calculateTurnaround(voo.pouso, voo.reboque)}</p></div>
                              </div>
                            )) : <div className="flex-1 flex flex-col items-center justify-center opacity-10 border border-dashed border-white/10 h-full py-16"><Activity size={60} className="mb-6" /><p className="text-[12px] font-black uppercase tracking-[0.5em]">Sem atendimentos no turno</p></div>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-6">
                        <div className={`flex-1 bg-slate-900/40 border p-8 flex flex-col justify-between shadow-xl transition-all ${report.tem_aluguel ? 'border-blue-500/40 bg-blue-950/10' : 'border-white/5 opacity-60'}`}>
                            <div className="flex items-center gap-3 mb-6"><Handshake size={24} className={report.tem_aluguel ? 'text-blue-500' : 'text-slate-600'} /><h4 className="text-[12px] font-black text-white uppercase tracking-widest italic uppercase">Locações do Turno</h4></div>
                            {report.tem_aluguel ? (
                              <div className="space-y-4"><p className="text-[9px] font-black text-slate-500 uppercase">Equipamento</p><p className="text-2xl font-black text-white italic leading-tight uppercase">{String(report.aluguel_equipamento)}</p><div className="grid grid-cols-2 gap-2 pt-4 border-t border-white/5"><div><p className="text-[8px] text-slate-500 font-bold uppercase">Início</p><p className="text-base font-black text-blue-400">{String(report.aluguel_inicio)}</p></div><div><p className="text-[8px] text-slate-500 font-bold uppercase">Término</p><p className="text-base font-black text-blue-400">{String(report.aluguel_fim)}</p></div></div></div>
                            ) : <p className="text-[10px] font-bold text-slate-700 uppercase italic">Sem locações ativas</p>}
                        </div>
                        <div className={`flex-1 bg-slate-900/40 border p-8 flex flex-col justify-between shadow-xl transition-all ${report.tem_equipamento_enviado ? 'border-rose-500/40 bg-rose-950/10' : 'border-white/5 opacity-60'}`}>
                            <div className="flex justify-between items-center mb-6"><h4 className="text-[12px] font-black text-white uppercase tracking-widest italic uppercase">Remoções GSE</h4><Wrench size={24} className={report.tem_equipamento_enviado ? 'text-rose-500' : 'text-slate-600'} /></div>
                            {report.tem_equipamento_enviado ? (
                              <div className="space-y-3"><div><p className="text-[9px] font-black text-rose-500 uppercase">Retirado da Operação</p><h3 className="text-2xl font-black text-white italic uppercase leading-tight">{String(report.equipamento_enviado_nome)}</h3></div><div className="bg-black/40 p-3 border border-rose-500/10 italic text-[10px] font-bold text-rose-100/70 line-clamp-2">"{String(report.equipamento_enviado_motivo)}"</div></div>
                            ) : <p className="text-[10px] font-bold text-slate-700 uppercase italic">Frota operacional íntegra</p>}
                        </div>
                      </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-[150px]">
                      <div className="lg:col-span-3 bg-slate-900/40 border border-white/5 p-8 flex gap-10 shadow-xl overflow-hidden">
                        <div className={`flex-1 p-6 border transition-all ${report.tem_pendencias ? 'bg-amber-950/10 border-amber-500/30' : 'bg-slate-950/50 border-white/5 opacity-40'}`}><div className="flex items-center gap-4 mb-4"><ShieldAlert size={20} className={report.tem_pendencias ? 'text-amber-500' : 'text-slate-600'} /><h4 className="text-[11px] font-black text-white uppercase tracking-widest uppercase">Pendências</h4></div><p className="text-[12px] font-bold text-slate-300 leading-relaxed italic line-clamp-3">{String(report.descricao_pendencias || 'Sem pendências registradas.')}</p></div>
                        <div className={`flex-1 p-6 border transition-all ${report.tem_ocorrencias ? 'bg-rose-950/10 border-rose-500/30' : 'bg-slate-950/50 border-white/5 opacity-40'}`}><div className="flex items-center gap-4 mb-4"><AlertCircle size={20} className={report.tem_ocorrencias ? 'text-rose-500' : 'text-slate-600'} /><h4 className="text-[11px] font-black text-white uppercase tracking-widest uppercase">Ocorrências</h4></div><p className="text-[12px] font-bold text-slate-300 leading-relaxed italic line-clamp-3">{String(report.descricao_ocorrencias || 'Shift finalizado sem ocorrências.')}</p></div>
                      </div>
                      <div className="bg-slate-900/40 border border-white/5 p-8 shadow-xl flex flex-col justify-center gap-3"><h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2 italic uppercase">Quadro de Pessoal</h4><div className="space-y-2">{[{ label: 'Faltas', val: report.teve_falta, Icon: UserMinus, color: 'rose' },{ label: 'Atestados', val: report.teve_atestado, Icon: FileText, color: 'amber' },{ label: 'Compensação', val: report.teve_compensacao, Icon: UserPlus, color: 'emerald' },{ label: 'Saída Antecipada', val: report.teve_saida_antecipada, Icon: Clock8, color: 'blue' }].map((item, i) => (<div key={i} className={`flex items-center justify-between p-2.5 border transition-all ${item.val ? `bg-${item.color}-500/10 border-${item.color}-500/40 text-${item.color}-400` : 'bg-slate-950/50 border-white/5 text-slate-700'}`}><div className="flex items-center gap-3">{React.createElement(item.Icon, { size: 12 })}<span className="text-[8px] font-black uppercase tracking-tighter">{item.label}</span></div><span className="text-[9px] font-black italic">{item.val ? 'SIM' : 'NÃO'}</span></div>))}</div></div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center opacity-10 border border-dashed border-white/10 h-full py-16"><FileText size={80} className="mb-6 stroke-[1px]" /><h2 className="text-5xl font-black uppercase italic tracking-tighter">SISTEMA VAZIO</h2></div>
              )}
            </div>
          ) : activeTab === 'analytics' ? (
            <div className="flex-1 flex flex-col gap-6 animate-in slide-in-from-right-10 duration-700 overflow-y-auto custom-scrollbar pr-2 pb-10">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                  <div className="bg-slate-900/40 border border-white/5 p-8 shadow-xl hover:border-blue-500/30 transition-all flex flex-col justify-between"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Volume de Voos</p><p className="text-5xl font-black italic text-white tracking-tighter leading-none">{Number(analyticsData.monthlyFlights)}</p></div>
                  <div className="bg-slate-900/40 border border-white/5 p-8 shadow-xl hover:border-emerald-500/30 transition-all flex flex-col justify-between"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 uppercase">media solo</p><p className="text-5xl font-black italic text-white tracking-tighter leading-none">{Math.floor(analyticsData.avgTurnaround / 60)}h {analyticsData.avgTurnaround % 60}m</p></div>
                  <div className="bg-slate-900/40 border border-white/5 p-8 shadow-xl hover:border-emerald-500/30 transition-all flex flex-col justify-between"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Operantes</p><p className="text-5xl font-black italic text-white tracking-tighter leading-none">{Number(fleetSummary.op)}</p></div>
                  <div className="bg-slate-900/40 border border-white/5 p-8 shadow-xl hover:border-rose-500/30 transition-all flex flex-col justify-between"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Indisponíveis</p><p className="text-5xl font-black italic text-white tracking-tighter leading-none">{Number(fleetSummary.mt)}</p></div>
                  <div onClick={() => setShowRentalModal(true)} className="bg-slate-900/40 border border-white/5 p-8 shadow-xl hover:border-blue-400/30 transition-all flex flex-col justify-between group cursor-pointer relative overflow-hidden"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Locações</p><div className="flex items-baseline gap-2"><p className="text-5xl font-black italic text-white tracking-tighter leading-none">{Number(analyticsData.rentalCount)}</p><p className="text-xl font-black text-blue-400">({Number(analyticsData.rentalHours)}h)</p></div></div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 bg-slate-900/40 border border-white/5 p-10 h-[500px] shadow-2xl">
                    <div className="flex justify-between items-center mb-10"><div><h4 className="text-[14px] font-black text-white uppercase tracking-[0.4em] italic uppercase">Historico de voos</h4></div><TrendingUp size={24} className="text-blue-500 opacity-30" /></div>
                    <div className="h-[330px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={analyticsData.chartData || []}><CartesianGrid strokeDasharray="10 10" stroke="#ffffff05" vertical={false} /><XAxis dataKey="name" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} dy={15} fontStyle="italic" fontWeight="bold" /><YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: '#ffffff05' }} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '0px' }} /><Bar dataKey="voos" fill="#2563eb" barSize={30} radius={[2, 2, 0, 0]}><LabelList dataKey="voos" position="insideTop" fill="#fff" style={{ fontSize: '10px', fontWeight: '900', fontStyle: 'italic' }} offset={10} /></Bar></BarChart></ResponsiveContainer></div>
                  </div>
                  <div className="bg-slate-900/40 border border-white/5 p-8 shadow-2xl flex flex-col h-[500px]">
                    <div className="flex items-center gap-3 mb-6 shrink-0"><Settings size={20} className="text-blue-500" /><h4 className="text-[12px] font-black text-white uppercase tracking-widest italic uppercase">Frota Atual</h4></div>
                    <div className="flex-1 flex gap-4 overflow-hidden">
                        <div className="flex-1 flex flex-col border-r border-white/5 pr-4 overflow-hidden"><p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2 mb-4 shrink-0"><CheckCircle2 size={12}/> Operantes</p><div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 pb-4">{fleetDetails.filter(e => e.status === 'OPERACIONAL').map((e, idx) => (<div key={idx} className="bg-slate-950/40 border-l-2 border-emerald-500/30 p-2.5 flex justify-between items-center group hover:bg-emerald-500/5 transition-all"><div className="overflow-hidden"><p className="text-[10px] font-black text-white italic truncate">{String(e.prefixo)}</p></div><div className="w-1 h-1 bg-emerald-500 rounded-full shrink-0 ml-2"></div></div>))}</div></div>
                        <div className="flex-1 flex flex-col overflow-hidden"><p className="text-[9px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-2 mb-4 shrink-0"><Wrench size={12}/> Manutenção</p><div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 pb-4">{fleetDetails.filter(e => e.status === 'MANUTENCAO').map((e, idx) => (<div key={idx} className="bg-slate-950/40 border-l-2 border-rose-500/30 p-2.5 flex justify-between items-center group hover:bg-rose-500/5 transition-all"><div className="overflow-hidden"><p className="text-[10px] font-black text-white italic truncate">{String(e.prefixo)}</p></div><div className="w-1 h-1 bg-rose-500 animate-pulse rounded-full shrink-0 ml-2"></div></div>))}</div></div>
                    </div>
                  </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-6 animate-in slide-in-from-right-10 duration-700 overflow-hidden">
              <div className="flex justify-between items-end shrink-0"><div><h4 className="text-[14px] font-black text-white uppercase tracking-[0.4em] italic uppercase">Histórico Geral de Voos</h4></div><div className="flex items-center bg-slate-900 border border-white/5 rounded-sm px-4 py-2 gap-3 w-80"><Search size={14} className="text-slate-500" /><input type="text" placeholder="BUSCAR VOO OU CIA..." className="bg-transparent border-none text-[10px] font-black text-white focus:ring-0 uppercase w-full placeholder:text-slate-700" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div></div>
              <div className="flex-1 bg-slate-900/40 border border-white/5 overflow-hidden flex flex-col shadow-2xl">
                  <div className="grid grid-cols-7 bg-slate-950/80 px-8 py-4 border-b border-white/5 text-[9px] font-black text-slate-500 uppercase tracking-widest shrink-0 italic"><div>Data / Turno</div><div>Companhia</div><div>Voo</div><div>Pouso</div><div>Reboque</div><div>Turnaround</div><div className="text-right">Ações</div></div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {filteredHistory.map((v, i) => (
                        <div key={i} onClick={() => { setSelectedDate(v.parentDate); setSelectedShift(v.parentShift === 'manhã' ? 'manha' : v.parentShift); setActiveTab('dashboard'); }} className="grid grid-cols-7 px-8 py-5 border-b border-white/5 hover:bg-blue-600/5 transition-all cursor-pointer group items-center"><div><p className="text-[10px] font-black text-white italic">{v.parentDate.split('-').reverse().join('/')}</p><p className="text-[8px] font-bold text-blue-500 uppercase tracking-widest mt-0.5">{String(v.parentShift).toUpperCase()}</p></div><div className="text-[11px] font-black text-slate-300 uppercase italic tracking-tighter">{v.companhia}</div><div className="text-[12px] font-black text-white italic tracking-tighter">{v.numero}</div><div className="text-[10px] font-bold text-slate-400 font-mono">{v.pouso}</div><div className="text-[10px] font-bold text-slate-400 font-mono">{v.reboque}</div><div className="text-[11px] font-black text-blue-400 italic tabular-nums">{calculateTurnaround(v.pouso, v.reboque)}</div><div className="flex justify-end"><button className="flex items-center gap-2 bg-white/5 px-4 py-2 text-[8px] font-black text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all rounded-sm uppercase tracking-widest italic border border-white/5 group-hover:border-blue-400">Ver Dashboard <ExternalLink size={10} /></button></div></div>
                    ))}
                  </div>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="bg-slate-900 border-t border-white/5 px-8 py-3 flex justify-between items-center shrink-0">
          <div className="flex gap-10">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 italic">SYSTEM READY</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 italic">Cloud GSE v9.1</span>
            </div>
          </div>
          <div className="flex items-center gap-5 text-[9px] font-black uppercase tracking-tighter italic text-slate-700"><span>RAMP CONTROLL STABLE</span></div>
        </footer>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(59, 130, 246, 0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59, 130, 246, 0.3); }
      `}</style>
    </div>
  );
};

export default App;
