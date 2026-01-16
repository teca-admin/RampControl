
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Plane, Wrench, Clock, AlertCircle, CheckCircle2, Calendar, 
  Timer, ChevronLeft, ChevronRight, Zap, HardHat, ArrowRight, 
  Activity, ShieldAlert, UserMinus, FileText, Clock8, 
  LayoutDashboard, TrendingUp, RefreshCcw, 
  Handshake, UserPlus, Settings, Search, ExternalLink, 
  PlusSquare, Plus, Trash2, Save, Share2,
  BarChart as BarChartIcon, Truck, Menu, X, Info
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

const calculateTurnaround = (start?: any, end?: any): string => {
  const diff = getDurationMinutes(start, end);
  if (diff === 0 && !start) return '--';
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return h === 0 ? `${m}min` : `${h}h ${m}m`;
};

const isValidFlight = (v: any): boolean => {
  if (!v || typeof v !== 'object') return false;
  return !!(v.companhia && v.numero && String(v.companhia) !== 'null');
};

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'history' | 'new_report'>('dashboard');
  
  // Dashboard Controls
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedShift, setSelectedShift] = useState<'manha' | 'tarde' | 'noite'>('manha');
  
  // Analytics/History Controls
  const [analyticsShift, setAnalyticsShift] = useState<'todos' | 'manha' | 'tarde' | 'noite'>('todos');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const [report, setReport] = useState<ShiftReport | null>(null);
  const [fleetStats, setFleetStats] = useState<FleetStat[]>([]);
  const [fleetDetails, setFleetDetails] = useState<any[]>([]);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [allFlights, setAllFlights] = useState<any[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any>({ 
    monthlyFlights: 0, avgTurnaround: 0, rentalCount: 0, 
    rentalHours: 0, chartData: []
  });

  // Form State
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formShift, setFormShift] = useState<'manha' | 'tarde' | 'noite'>('manha');
  const [formLeader, setFormLeader] = useState('');
  const [formHR, setFormHR] = useState({ falta: false, atestado: false, compensacao: false, saida_antecipada: false });
  const [formPendencias, setFormPendencias] = useState('');
  const [formOcorrencias, setFormOcorrencias] = useState('');
  const [formAluguel, setFormAluguel] = useState({ ativo: false, nome: '', inicio: '', fim: '' });
  const [formGseOut, setFormGseOut] = useState({ ativo: false, prefixo: '', motivo: '' });
  const [formGseIn, setFormGseIn] = useState({ ativo: false, prefixo: '' });
  const [formFlights, setFormFlights] = useState<Partial<Flight>[]>([
    { companhia: '', numero: '', pouso: '', reboque: '' }
  ]);

  const [searchQuery, setSearchQuery] = useState('');

  const resetForm = useCallback(() => {
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormShift('manha');
    setFormLeader('');
    setFormHR({ falta: false, atestado: false, compensacao: false, saida_antecipada: false });
    setFormPendencias('');
    setFormOcorrencias('');
    setFormAluguel({ ativo: false, nome: '', inicio: '', fim: '' });
    setFormGseOut({ ativo: false, prefixo: '', motivo: '' });
    setFormGseIn({ ativo: false, prefixo: '' });
    setFormFlights([{ companhia: '', numero: '', pouso: '', reboque: '' }]);
  }, []);

  const handleAddFlight = () => setFormFlights([...formFlights, { companhia: '', numero: '', pouso: '', reboque: '' }]);
  const handleRemoveFlight = (index: number) => setFormFlights(formFlights.filter((_, i) => i !== index));
  const handleFlightChange = (index: number, field: string, value: string) => {
    const updated = [...formFlights];
    updated[index] = { ...updated[index], [field as keyof Flight]: value };
    setFormFlights(updated);
  };

  const fetchData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const dashShiftFilter = selectedShift === 'manha' ? "turno.in.(manha,manhã)" : `turno.eq.${selectedShift}`;
      
      const { data: dashboardData } = await supabase
        .from('relatorios_entrega_turno')
        .select(`*, voos (*)`)
        .eq('data', selectedDate)
        .or(dashShiftFilter)
        .order('criado_em', { ascending: false })
        .limit(1);

      setReport(dashboardData?.[0] || null);

      const { data: equips } = await supabase.from('equipamentos').select('*').order('prefixo', { ascending: true });
      if (equips) {
        setFleetDetails(equips);
        const stats: Record<string, number> = { OPERACIONAL: 0, MANUTENCAO: 0, ALUGADO: 0 };
        equips.forEach(e => { stats[e.status] = (stats[e.status] || 0) + 1; });
        setFleetStats(Object.entries(stats).map(([status, total]) => ({ status: status as any, total })));
      }

      const { data: leadersData } = await supabase.from('lideres').select('*').order('nome', { ascending: true });
      if (leadersData) setLeaders(leadersData);

      let query = supabase.from('relatorios_entrega_turno').select('*, voos(*)').gte('data', startDate).lte('data', endDate);
      if (analyticsShift !== 'todos') {
        query = query.filter('turno', analyticsShift === 'manha' ? 'in' : 'eq', analyticsShift === 'manha' ? '(manha,manhã)' : analyticsShift);
      }
      const { data: periodData } = await query.order('data', { ascending: false });

      if (periodData) {
        let fCount = 0, tMins = 0, fWithT = 0, rCount = 0, rMins = 0;
        const fList: any[] = [];
        const countsByDate: Record<string, number> = {};

        periodData.forEach((curr: any) => {
          if (curr.tem_aluguel) { rCount++; rMins += getDurationMinutes(curr.aluguel_inicio, curr.aluguel_fim); }
          let dailyCount = 0;
          curr.voos?.forEach((v: any) => {
            if (!isValidFlight(v)) return;
            fCount++; dailyCount++;
            const dur = getDurationMinutes(v.pouso, v.reboque);
            if (dur > 0) { tMins += dur; fWithT++; }
            fList.push({ ...v, parentDate: curr.data, parentShift: curr.turno, parentLider: curr.lider });
          });
          countsByDate[curr.data] = (countsByDate[curr.data] || 0) + dailyCount;
        });

        const chartData = Object.entries(countsByDate)
          .map(([date, count]) => ({ 
            name: date.split('-').reverse().slice(0, 2).join('/'), 
            voos: count,
            rawDate: date
          }))
          .sort((a, b) => a.rawDate.localeCompare(b.rawDate));

        setAnalyticsData({ 
          monthlyFlights: fCount, 
          avgTurnaround: fWithT > 0 ? Math.round(tMins / fWithT) : 0,
          rentalCount: rCount,
          rentalHours: Math.round(rMins / 60),
          chartData
        });
        setAllFlights(fList);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [selectedDate, selectedShift, startDate, endDate, analyticsShift]);

  useEffect(() => {
    fetchData();
    // Atualização automática a cada 30 segundos
    const interval = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const fleetSummary = useMemo(() => {
    const op = fleetStats.find(s => s.status === 'OPERACIONAL')?.total || 0;
    const mt = fleetStats.find(s => s.status === 'MANUTENCAO')?.total || 0;
    const al = fleetStats.find(s => s.status === 'ALUGADO')?.total || 0;
    return { op, mt, al, total: op + mt + al };
  }, [fleetStats]);

  const handleSaveReport = async () => {
    if (!formLeader) { alert("Selecione o Líder!"); return; }
    setIsSubmitting(true);
    try {
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
          descricao_pendencias: formPendencias || "Não",
          tem_ocorrencias: !!formOcorrencias && formOcorrencias.toLowerCase() !== 'não',
          descricao_ocorrencias: formOcorrencias || "Não",
          tem_aluguel: formAluguel.ativo,
          aluguel_equipamento: formAluguel.ativo ? formAluguel.nome : null,
          aluguel_inicio: formAluguel.ativo ? formAluguel.inicio : null,
          aluguel_fim: formAluguel.ativo ? formAluguel.fim : null,
          tem_equipamento_enviado: formGseOut.ativo,
          equipamento_enviado_nome: formGseOut.ativo ? formGseOut.prefixo : null,
          equipamento_enviado_motivo: formGseOut.ativo ? formGseOut.motivo : null,
          tem_equipamento_retornado: formGseIn.ativo,
          equipamento_retornado_nome: formGseIn.ativo ? formGseIn.prefixo : null,
          total_voos: formFlights.length
        }])
        .select().single();

      if (reportErr) throw reportErr;

      const voosToInsert = formFlights
        .filter(v => v.companhia && v.numero)
        .map(v => ({ ...v, relatorio_id: newReport.id }));

      if (voosToInsert.length > 0) {
        const { error: voosErr } = await supabase.from('voos').insert(voosToInsert);
        if (voosErr) throw voosErr;
      }

      alert("Relatório salvo com sucesso!");
      
      // Limpa o formulário após salvar
      resetForm();
      
      // Atualiza os controles do dashboard para mostrar o relatório recém enviado
      setSelectedDate(formDate);
      setSelectedShift(formShift);
      
      // Volta para a aba inicial
      setActiveTab('dashboard');
      
      // Recarrega os dados
      fetchData();
    } catch (err: any) { alert(err.message); }
    finally { setIsSubmitting(false); }
  };

  const generateWhatsAppMessage = () => {
    const d = formDate.split('-').reverse().join('/');
    const msg = `✅ *RELATÓRIO DE ENTREGA DE TURNO*
🗓️ ${d}
Turno: ${formShift === 'manha' ? 'manhã' : formShift}
Líder: ${formLeader}

1 - Falta: ${formHR.falta ? 'Sim' : 'Não'}
Atestado: ${formHR.atestado ? 'Sim' : 'Não'}
Compensação: ${formHR.compensacao ? 'Sim' : 'Não'}
Saída antecipada: ${formHR.saida_antecipada ? 'Sim' : 'Não'}

2 - Pendências: ${formPendencias || "Não"}
3 - Ocorrências: ${formOcorrencias || "Não"}
4 - Aluguel: ${formAluguel.ativo ? `${formAluguel.nome} (${formAluguel.inicio}-${formAluguel.fim})` : 'Não'}
5 - Voos: ${formFlights.filter(v => v.companhia).length}
6 - Enviado GSE: ${formGseOut.ativo ? formGseOut.prefixo : 'Não'}
7 - Retorno GSE: ${formGseIn.ativo ? formGseIn.prefixo : 'Não'}`;
    navigator.clipboard.writeText(msg);
    alert("Log copiado para o WhatsApp!");
  };

  return (
    <div className="h-screen bg-[#020617] text-slate-100 flex flex-col font-sans selection:bg-blue-600/30 overflow-hidden">
      {/* Header Responsivo */}
      <header className="flex-none bg-[#020617] border-b border-white/5 px-4 md:px-6 py-4 flex justify-between items-center shadow-xl">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="bg-blue-600 p-1.5 rounded shadow-lg shadow-blue-500/20">
            <Zap size={18} className="md:size-5 text-white fill-white" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-black tracking-tighter uppercase italic leading-none">Ramp<span className="text-blue-500">Controll</span></h1>
            <p className="hidden md:flex text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1 italic items-center gap-1">
              <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div> Sistema GSE
            </p>
          </div>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex bg-[#0f172a] p-1 rounded-sm border border-white/5 gap-1">
          <button onClick={() => setActiveTab('dashboard')} className={`flex items-center gap-2 px-6 py-2 text-[11px] font-black uppercase tracking-widest transition-all rounded-sm ${activeTab === 'dashboard' ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}>
             <LayoutDashboard size={14} /> RELATÓRIO
          </button>
          <button onClick={() => setActiveTab('analytics')} className={`flex items-center gap-2 px-6 py-2 text-[11px] font-black uppercase tracking-widest transition-all rounded-sm ${activeTab === 'analytics' ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}>
             <BarChartIcon size={14} /> ANÁLISES
          </button>
          <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-6 py-2 text-[11px] font-black uppercase tracking-widest transition-all rounded-sm ${activeTab === 'history' ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}>
             <Clock8 size={14} /> HISTÓRICO
          </button>
          <button onClick={() => setActiveTab('new_report')} className={`flex items-center gap-2 px-6 py-2 text-[11px] font-black uppercase tracking-widest transition-all rounded-sm ${activeTab === 'new_report' ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}>
             <PlusSquare size={14} /> LANÇAR
          </button>
        </nav>

        <div className="flex items-center gap-2 md:gap-3">
           {/* Mobile Tab Toggle (Visible only on small screens) */}
           <div className="lg:hidden flex bg-[#0f172a] p-1 rounded-sm border border-white/5 gap-1">
              <button onClick={() => setActiveTab('dashboard')} className={`p-2 rounded-sm ${activeTab === 'dashboard' ? 'bg-white text-slate-950' : 'text-slate-500'}`}><LayoutDashboard size={16}/></button>
              <button onClick={() => setActiveTab('analytics')} className={`p-2 rounded-sm ${activeTab === 'analytics' ? 'bg-white text-slate-950' : 'text-slate-500'}`}><BarChartIcon size={16}/></button>
              <button onClick={() => setActiveTab('new_report')} className={`p-2 rounded-sm ${activeTab === 'new_report' ? 'bg-white text-slate-950' : 'text-slate-500'}`}><PlusSquare size={16}/></button>
           </div>

           {(activeTab === 'dashboard' || activeTab === 'history') && (
             <div className="hidden md:flex items-center bg-[#0f172a] border border-white/10 rounded-sm divide-x divide-white/5">
                <div className="flex items-center px-3 py-1.5 gap-2">
                  <ChevronLeft size={16} className="text-slate-500 cursor-pointer hover:text-white" />
                  <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="bg-transparent border-none text-[11px] font-black text-white p-0 uppercase focus:ring-0" />
                  <ChevronRight size={16} className="text-slate-500 cursor-pointer hover:text-white" />
                </div>
                <div className="flex">
                  {(['manha', 'tarde', 'noite'] as const).map(s => (
                    <button key={s} onClick={() => setSelectedShift(s)} className={`px-4 py-1.5 text-[9px] font-black uppercase italic ${selectedShift === s ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>{s === 'manha' ? 'MANHÃ' : s === 'tarde' ? 'TARDE' : 'NOITE'}</button>
                  ))}
                </div>
             </div>
           )}
           <button onClick={() => fetchData()} className="p-2 md:p-2.5 bg-[#0f172a] border border-white/10 rounded-sm hover:border-blue-500 transition-all active:scale-95"><RefreshCcw size={16} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <div className="h-full p-4 md:p-6 w-full max-w-[1900px] mx-auto flex flex-col">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center opacity-30"><RefreshCcw size={48} className="animate-spin text-blue-500 mb-6" /><p className="text-[11px] font-black uppercase tracking-[0.5em] italic text-center">Sincronizando rampa...</p></div>
          ) : activeTab === 'dashboard' ? (
            /* ABA RELATÓRIO - DESIGN OPTIMIZED (SINGLE SCREEN) */
            <div className="animate-in fade-in duration-500 h-full flex flex-col gap-4 md:gap-6">
              {report ? (
                <div className="grid grid-cols-12 gap-4 md:gap-8 flex-1 overflow-hidden">
                  {/* Coluna Central */}
                  <div className="col-span-12 lg:col-span-9 flex flex-col gap-4 md:gap-6 overflow-hidden">
                     <div className="flex-none flex flex-col md:flex-row justify-between items-start md:items-end gap-4 md:gap-6">
                        <div className="space-y-1">
                          <p className="text-[9px] md:text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] italic">Relatório de Entrega de Turno</p>
                          <h2 className="text-3xl md:text-4xl font-black italic uppercase tracking-tighter text-white">Log de <span className="text-blue-600">Atendimentos</span></h2>
                        </div>
                        
                        <div className="bg-[#0f172a]/90 border border-white/10 p-3 md:p-4 rounded-sm shadow-xl flex items-center gap-3">
                          <div className="bg-slate-800 p-2 rounded-sm"><HardHat size={16} className="md:size-[18px] text-blue-500"/></div>
                          <div>
                            <p className="text-[6px] md:text-[7px] font-black text-slate-500 uppercase italic tracking-widest mb-0.5">Responsável</p>
                            <p className="text-[10px] md:text-xs font-black italic uppercase tracking-tighter text-blue-100">{report.lider}</p>
                          </div>
                        </div>
                     </div>

                     {/* Lista de Voos com Scroll Interno */}
                     <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                        {report.voos?.length ? report.voos.map((voo, idx) => (
                          <div key={idx} className="bg-[#020617] border border-white/5 p-4 md:p-6 flex justify-between items-center group relative hover:border-blue-500/20 transition-all rounded-sm shadow-md">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 opacity-0 group-hover:opacity-100 transition-all"></div>
                            <div className="flex items-center gap-4 md:gap-6">
                              <div className="hidden md:flex bg-[#0f172a] p-4 border border-white/5 rounded-sm text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                <Plane size={24}/>
                              </div>
                              <div>
                                <h3 className="text-xl md:text-2xl font-black italic uppercase tracking-tighter text-white">{voo.companhia} <span className="text-blue-500">{voo.numero}</span></h3>
                                <div className="flex items-center gap-3 md:gap-4 mt-1 md:mt-1.5">
                                  <div className="flex items-center gap-1.5 text-[8px] md:text-[9px] font-black uppercase text-slate-500 italic"><Clock size={10} className="text-blue-600"/> In: <span className="text-white">{voo.pouso}</span></div>
                                  <div className="flex items-center gap-1.5 text-[8px] md:text-[9px] font-black uppercase text-slate-500 italic"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Out: <span className="text-white">{voo.reboque}</span></div>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[7px] md:text-[8px] font-black text-slate-500 uppercase italic tracking-widest">Solo</p>
                              <p className="text-2xl md:text-4xl font-black italic text-white tracking-tighter tabular-nums group-hover:text-blue-500 transition-colors">{calculateTurnaround(voo.pouso, voo.reboque)}</p>
                            </div>
                          </div>
                        )) : (
                          <div className="h-full flex flex-col items-center justify-center opacity-5">
                            <Plane size={64} className="md:size-[80px] mb-4"/>
                            <p className="text-base md:text-lg font-black italic uppercase">Sem registros para este turno</p>
                          </div>
                        )}
                     </div>

                     {/* Blocos de Texto Inferiores */}
                     <div className="flex-none grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 pb-2">
                        <div className="bg-[#020617] border border-amber-500/20 p-4 md:p-6 rounded-sm min-h-[100px] md:min-h-[140px]">
                          <div className="flex items-center gap-2 mb-3 md:mb-4">
                             <div className="text-amber-500"><AlertCircle size={14} className="md:size-4"/></div>
                             <h4 className="text-[9px] md:text-[10px] font-black uppercase italic tracking-[0.2em] text-amber-500">Pendências</h4>
                          </div>
                          <p className="text-[10px] md:text-[11px] font-bold text-slate-400 italic leading-snug uppercase">{report.descricao_pendencias || "Nenhuma pendência"}</p>
                        </div>
                        <div className="bg-[#0f172a]/30 border border-white/5 p-4 md:p-6 rounded-sm min-h-[100px] md:min-h-[140px]">
                          <div className="flex items-center gap-2 mb-3 md:mb-4">
                             <div className="text-slate-500"><ShieldAlert size={14} className="md:size-4"/></div>
                             <h4 className="text-[9px] md:text-[10px] font-black uppercase italic tracking-[0.2em] text-slate-500">Ocorrências</h4>
                          </div>
                          <p className="text-[10px] md:text-[11px] font-bold text-slate-600 italic leading-snug uppercase">{report.descricao_ocorrencias || "Não"}</p>
                        </div>
                     </div>
                  </div>

                  {/* Sidebar Direita */}
                  <div className="hidden lg:flex col-span-3 flex-col gap-6 overflow-hidden">
                     <div className="bg-[#0f172a]/40 border border-white/5 p-5 rounded-sm space-y-4 flex-none">
                        <h4 className="text-[10px] font-black uppercase italic tracking-[0.2em] text-slate-300 flex items-center justify-between">Locações <Handshake size={14}/></h4>
                        {report.tem_aluguel ? (
                          <div className="bg-[#020617] p-4 border border-white/5 rounded-sm">
                            <p className="text-sm font-black italic text-blue-500 uppercase">{report.aluguel_equipamento}</p>
                            <p className="text-[9px] font-black text-slate-600 uppercase mt-1 italic">Duração: {report.aluguel_inicio} - {report.aluguel_fim}</p>
                          </div>
                        ) : (
                          <p className="text-[9px] font-black text-slate-700 uppercase italic py-2 text-center">Sem locações ativas</p>
                        )}
                     </div>

                     <div className="bg-[#0f172a]/40 border border-rose-600/30 p-5 rounded-sm space-y-4 flex-none">
                        <h4 className="text-[10px] font-black uppercase italic tracking-[0.2em] text-rose-500 flex justify-between items-center">Remoções GSE <Wrench size={14}/></h4>
                        {report.tem_equipamento_enviado ? (
                          <div className="space-y-3">
                            <p className="text-[8px] font-black text-rose-500/80 uppercase italic">Baixa Técnica</p>
                            <h5 className="text-3xl font-black italic text-white tracking-tighter uppercase leading-none">{report.equipamento_enviado_nome}</h5>
                            <div className="bg-[#020617] p-3 border border-rose-500/10 rounded-sm">
                              <p className="text-[10px] font-bold text-rose-400 italic">"{report.equipamento_enviado_motivo}"</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[9px] font-black text-slate-700 uppercase italic py-2 text-center">Toda frota operante</p>
                        )}
                     </div>

                     <div className="bg-[#0f172a]/40 border border-white/5 p-5 rounded-sm flex-1 flex flex-col min-h-0">
                        <h4 className="text-[10px] font-black uppercase italic tracking-[0.2em] text-slate-300 mb-4 flex-none">Controle de Pessoal</h4>
                        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                          {[
                            { l: 'Faltas', v: report.teve_falta, c: 'rose' },
                            { l: 'Atestados', v: report.teve_atestado, c: 'slate' },
                            { l: 'Compensação', v: report.teve_compensacao, c: 'slate' },
                            { l: 'Saída Antecipada', v: report.teve_saida_antecipada, c: 'blue' }
                          ].map(q => (
                            <div key={q.l} className={`flex justify-between items-center p-3 border-l-2 transition-all bg-[#020617]/50 ${q.v ? `border-${q.c}-500` : 'border-transparent'}`}>
                               <div className="flex items-center gap-3">
                                  <span className={`text-[9px] font-black uppercase italic ${q.v ? 'text-white' : 'text-slate-600'}`}>{q.l}</span>
                               </div>
                               <span className={`text-[9px] font-black uppercase italic ${q.v ? `text-${q.c}-500` : 'text-slate-800'}`}>{q.v ? 'SIM' : 'NÃO'}</span>
                            </div>
                          ))}
                        </div>
                     </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center opacity-10 text-center">
                  <LayoutDashboard size={80} className="mb-4" />
                  <h2 className="text-2xl font-black italic uppercase">Nenhum relatório para o turno selecionado</h2>
                  <p className="text-sm font-black uppercase mt-4">Tente selecionar outra data ou turno</p>
                </div>
              )}
            </div>
          ) : activeTab === 'analytics' ? (
            /* ABA ANÁLISES */
            <div className="animate-in slide-in-from-right-5 duration-500 h-full flex flex-col gap-4 md:gap-6">
               <div className="flex-none grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
                  {[
                    { l: 'Voos', v: analyticsData.monthlyFlights, s: 'No período', c: 'blue' },
                    { l: 'Média Solo', v: `${Math.floor(analyticsData.avgTurnaround / 60)}h ${analyticsData.avgTurnaround % 60}m`, s: 'Turnaround', c: 'white' },
                    { l: 'Operantes', v: fleetSummary.op, s: 'Frota Ativa', c: 'emerald' },
                    { l: 'Manutenção', v: fleetSummary.mt, s: 'Indisponíveis', c: 'rose' },
                    { l: 'Locações', v: analyticsData.rentalCount, s: `${analyticsData.rentalHours}h totais`, c: 'blue' }
                  ].map((k, i) => (
                    <div key={i} className="bg-[#0f172a]/30 border border-white/5 p-4 md:p-5 rounded-sm shadow-xl space-y-2 md:space-y-3 group hover:bg-white/5 transition-all">
                      <h4 className="text-[7px] md:text-[8px] font-black text-slate-500 uppercase italic tracking-widest leading-none">{k.l}</h4>
                      <p className={`text-2xl md:text-4xl font-black italic tracking-tighter tabular-nums leading-none ${k.c === 'emerald' ? 'text-emerald-500' : k.c === 'rose' ? 'text-rose-500' : 'text-white'}`}>{k.v}</p>
                      <p className="text-[7px] md:text-[8px] font-bold text-slate-700 uppercase italic leading-none">{k.s}</p>
                    </div>
                  ))}
               </div>

               <div className="flex-1 grid grid-cols-12 gap-4 md:gap-6 overflow-hidden">
                  <div className="col-span-12 lg:col-span-7 bg-[#0f172a]/30 border border-white/5 p-6 md:p-8 rounded-sm shadow-xl flex flex-col overflow-hidden">
                    <div className="flex-none flex justify-between items-start mb-6 md:mb-10">
                      <div className="space-y-1">
                        <h3 className="text-lg md:text-xl font-black italic uppercase tracking-tighter">Histórico de <span className="text-blue-600">Demanda</span></h3>
                        <p className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase italic tracking-widest">Atendimentos por dia</p>
                      </div>
                      <TrendingUp className="text-blue-500/20 md:size-[32px]" size={24} />
                    </div>
                    <div className="flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analyticsData.chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff03" vertical={false} />
                          <XAxis dataKey="name" stroke="#475569" fontSize={9} fontStyle="italic" dy={5} axisLine={false} tickLine={false} />
                          <YAxis stroke="#475569" fontSize={9} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{backgroundColor: '#020617', border: '1px solid #1e293b', fontSize: '9px'}} cursor={{fill: 'white', opacity: 0.05}} />
                          <Bar dataKey="voos" fill="#2563eb" radius={[1, 1, 0, 0]} barSize={25}>
                            <LabelList dataKey="voos" position="top" fill="#64748b" style={{fontSize: '8px', fontWeight: '900'}} dy={-5} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="col-span-12 lg:col-span-5 bg-[#0f172a]/30 border border-white/5 p-6 md:p-8 rounded-sm shadow-xl flex flex-col overflow-hidden">
                     <div className="flex-none flex justify-between items-center mb-6 md:mb-8">
                       <h3 className="text-base md:text-lg font-black italic uppercase tracking-tighter flex items-center gap-3"><Settings size={18} className="text-blue-500"/> Visão de Frota</h3>
                     </div>

                     <div className="flex-1 grid grid-cols-2 gap-4 md:gap-6 min-h-0">
                        <div className="flex flex-col gap-4 overflow-hidden">
                          <h4 className="flex-none text-[8px] md:text-[9px] font-black italic uppercase tracking-[0.2em] text-emerald-500 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Operantes</h4>
                          <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                            {fleetDetails.filter(e => e.status === 'OPERACIONAL').map(e => (
                              <div key={e.id} className="bg-[#020617]/50 border-r-2 border-emerald-500/0 hover:border-emerald-500 p-2.5 transition-all flex justify-between items-center group">
                                 <div>
                                   <p className="text-[10px] md:text-xs font-black italic text-white uppercase tracking-tighter leading-none">{e.prefixo}</p>
                                   <p className="text-[6px] md:text-[7px] font-bold text-slate-600 uppercase italic mt-1 leading-none">{e.nome}</p>
                                 </div>
                                 <div className="w-1 h-1 rounded-full bg-emerald-500/30 group-hover:bg-emerald-500 transition-all"></div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col gap-4 overflow-hidden">
                          <h4 className="flex-none text-[8px] md:text-[9px] font-black italic uppercase tracking-[0.2em] text-rose-500 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div> Manutenção</h4>
                          <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                            {fleetDetails.filter(e => e.status === 'MANUTENCAO').map(e => (
                              <div key={e.id} className="bg-[#020617]/50 border-r-2 border-rose-500/0 hover:border-rose-500 p-2.5 transition-all flex justify-between items-center group">
                                 <div>
                                   <p className="text-[10px] md:text-xs font-black italic text-white uppercase tracking-tighter leading-none">{e.prefixo}</p>
                                   <p className="text-[6px] md:text-[7px] font-bold text-slate-600 uppercase italic mt-1 leading-none">{e.nome}</p>
                                 </div>
                                 <div className="w-1 h-1 rounded-full bg-rose-500/30 group-hover:bg-rose-500 transition-all"></div>
                              </div>
                            ))}
                          </div>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          ) : activeTab === 'history' ? (
            /* ABA HISTÓRICO */
            <div className="animate-in slide-in-from-right-5 duration-500 h-full flex flex-col gap-4 md:gap-6 overflow-hidden">
               <div className="flex-none flex flex-col md:flex-row justify-between items-end gap-4 md:gap-6">
                  <div className="space-y-1">
                    <h2 className="text-3xl md:text-4xl font-black italic uppercase tracking-tighter text-white">Histórico Geral</h2>
                    <p className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest italic text-center md:text-left">Todos os voos processados na base</p>
                  </div>
                  <div className="bg-[#0f172a] border border-white/10 flex items-center px-4 py-2 gap-3 w-full md:w-[350px] shadow-xl focus-within:border-blue-500 transition-all">
                    <Search size={16} className="text-slate-600" />
                    <input type="text" placeholder="CIA, VOO OU LÍDER..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-transparent border-none focus:ring-0 text-[10px] font-black uppercase w-full italic" />
                  </div>
               </div>
               
               <div className="flex-1 bg-[#020617] border border-white/5 shadow-2xl overflow-hidden flex flex-col">
                  <div className="flex-none grid grid-cols-6 bg-[#0f172a] px-4 md:px-6 py-4 text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/10 italic">
                    <div className="col-span-2 md:col-span-1">Data / Turno</div>
                    <div className="col-span-3 md:col-span-2">Atendimento</div>
                    <div className="hidden md:block">Turnaround</div>
                    <div className="hidden md:block">Líder</div>
                    <div className="text-right">Link</div>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-white/5 custom-scrollbar">
                     {allFlights.length > 0 ? allFlights.filter(f => !searchQuery || JSON.stringify(f).toLowerCase().includes(searchQuery.toLowerCase())).map((v, i) => (
                       <div key={i} onClick={() => { setSelectedDate(v.parentDate); setSelectedShift(v.parentShift === 'manhã' ? 'manha' : v.parentShift); setActiveTab('dashboard'); }} className="grid grid-cols-6 px-4 md:px-6 py-4 md:py-5 items-center hover:bg-white/5 transition-all cursor-pointer group">
                          <div className="col-span-2 md:col-span-1"><p className="text-xs md:text-sm font-black text-white italic">{v.parentDate.split('-').reverse().join('/')}</p><p className="text-[7px] md:text-[8px] font-bold text-blue-500 uppercase italic">{String(v.parentShift).toUpperCase()}</p></div>
                          <div className="col-span-3 md:col-span-2 flex items-center gap-3 md:gap-4"><Plane size={16} className="text-slate-700 group-hover:text-blue-500 transition-colors" /><p className="text-sm md:text-lg font-black italic text-white tracking-tighter uppercase">{v.companhia} <span className="text-blue-500">{v.numero}</span></p></div>
                          <div className="hidden md:block text-lg font-black italic text-white tracking-tighter tabular-nums group-hover:text-blue-500">{calculateTurnaround(v.pouso, v.reboque)}</div>
                          <div className="hidden md:block text-[9px] font-black text-slate-500 uppercase italic truncate pr-4">{v.parentLider}</div>
                          <div className="flex justify-end"><button className="bg-slate-800 px-3 md:px-4 py-1.5 md:py-2 text-[7px] md:text-[8px] font-black text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all uppercase italic">Ver</button></div>
                       </div>
                     )) : <div className="py-20 text-center opacity-10 italic font-black uppercase text-xs">Nenhum registro encontrado</div>}
                  </div>
               </div>
            </div>
          ) : (
            /* ABA LANÇAR RELATÓRIO */
            <div className="animate-in slide-in-from-bottom-5 duration-500 h-full flex flex-col overflow-hidden pb-4">
               <div className="flex-1 overflow-y-auto pr-1 md:pr-2 custom-scrollbar space-y-6 md:space-y-8">
                 <div className="bg-[#0f172a]/30 border border-white/5 p-5 md:p-8 shadow-2xl flex flex-col md:flex-row md:flex-wrap gap-5 md:gap-8 items-stretch md:items-end rounded-sm">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest italic leading-none">Data do Turno</label>
                       <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="bg-[#020617] border border-white/10 p-4 md:p-3.5 font-black text-white rounded-sm uppercase text-xs md:text-sm focus:border-blue-500 outline-none" />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest italic leading-none">Turno</label>
                       <div className="flex bg-[#020617] p-1 border border-white/10 rounded-sm">
                          {(['manha', 'tarde', 'noite'] as const).map(t => (
                            <button key={t} onClick={() => setFormShift(t)} className={`flex-1 md:px-6 py-3 md:py-2.5 text-[10px] md:text-[9px] font-black uppercase italic rounded-sm transition-all ${formShift === t ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>{t}</button>
                          ))}
                       </div>
                    </div>
                    <div className="flex-1 space-y-2">
                       <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest italic leading-none">Líder Responsável</label>
                       <select value={formLeader} onChange={e => setFormLeader(e.target.value)} className="bg-[#020617] border border-white/10 p-4 md:p-3.5 font-black text-white w-full uppercase italic rounded-sm text-xs md:text-sm focus:border-blue-500 outline-none appearance-none">
                          <option value="">-- SELECIONE LÍDER --</option>
                          {leaders.map(l => <option key={l.id} value={l.nome}>{l.nome}</option>)}
                       </select>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                    <div className="space-y-6 md:space-y-8">
                       <div className="bg-[#0f172a]/30 border border-white/5 p-5 md:p-6 shadow-xl rounded-sm">
                          <h4 className="text-[12px] md:text-[11px] font-black italic uppercase text-blue-500 mb-5 md:mb-6">Controle de RH</h4>
                          <div className="grid grid-cols-2 gap-3">
                            {[{k: 'falta', l: 'Falta'}, {k: 'atestado', l: 'Atestado'}, {k: 'compensacao', l: 'Compens.'}, {k: 'saida_antecipada', l: 'Saída Ant.'}].map(i => (
                              <button key={i.k} onClick={() => setFormHR({...formHR, [i.k as keyof typeof formHR]: !formHR[i.k as keyof typeof formHR]})} className={`p-5 md:p-4 border-2 md:border transition-all text-center rounded-sm ${formHR[i.k as keyof typeof formHR] ? 'bg-rose-500/20 border-rose-500/50 text-rose-400' : 'bg-[#020617] border-white/5 opacity-40'}`}>
                                <span className="text-[11px] md:text-[9px] font-black uppercase italic">{i.l}</span>
                              </button>
                            ))}
                          </div>
                       </div>
                       <div className="bg-[#0f172a]/30 border border-white/5 p-5 md:p-6 shadow-xl rounded-sm space-y-6">
                          <textarea value={formPendencias} onChange={e => setFormPendencias(e.target.value)} rows={3} className="bg-[#020617] border border-white/10 p-4 font-bold text-sm md:text-xs rounded-sm text-slate-300 w-full italic uppercase outline-none focus:border-blue-500/30" placeholder="DESCREVA PENDÊNCIAS..."></textarea>
                          <textarea value={formOcorrencias} onChange={e => setFormOcorrencias(e.target.value)} rows={3} className="bg-[#020617] border border-white/10 p-4 font-bold text-sm md:text-xs rounded-sm text-slate-300 w-full italic uppercase outline-none focus:border-blue-500/30" placeholder="DESCREVA OCORRÊNCIAS..."></textarea>
                       </div>
                    </div>

                    <div className="bg-[#0f172a]/30 border border-white/5 p-5 md:p-6 shadow-xl rounded-sm flex flex-col">
                      <div className="flex justify-between items-center mb-6">
                        <h4 className="text-[12px] md:text-[11px] font-black italic uppercase text-blue-500">Log de Voos</h4>
                        <button onClick={handleAddFlight} className="bg-blue-600 px-6 md:px-4 py-3 md:py-2 text-[11px] md:text-[9px] font-black uppercase italic rounded-sm shadow-lg active:scale-95 transition-all">+ Inserir Voo</button>
                      </div>
                      <div className="space-y-4 max-h-[400px] md:max-h-[300px] overflow-y-auto pr-1 md:pr-2 custom-scrollbar">
                        {formFlights.map((v, i) => (
                          <div key={i} className="bg-[#020617] border border-white/5 p-5 md:p-4 rounded-sm grid grid-cols-2 gap-4 relative group">
                            <button onClick={() => handleRemoveFlight(i)} className="absolute -top-3 -right-3 md:-top-2 md:-right-2 bg-rose-600 p-2 md:p-1 rounded-full"><Trash2 size={16} className="md:size-3"/></button>
                            <input type="text" placeholder="CIA" value={v.companhia} onChange={e => handleFlightChange(i, 'companhia', e.target.value)} className="bg-slate-900 border-none p-3 md:p-2 font-black text-xs w-full uppercase" />
                            <input type="text" placeholder="VOO" value={v.numero} onChange={e => handleFlightChange(i, 'numero', e.target.value)} className="bg-slate-900 border-none p-3 md:p-2 font-black text-xs w-full uppercase" />
                            <input type="time" value={v.pouso} onChange={e => handleFlightChange(i, 'pouso', e.target.value)} className="bg-slate-900 border-none p-3 md:p-2 font-black text-xs w-full text-blue-400" />
                            <input type="time" value={v.reboque} onChange={e => handleFlightChange(i, 'reboque', e.target.value)} className="bg-slate-900 border-none p-3 md:p-2 font-black text-xs w-full text-emerald-400" />
                          </div>
                        ))}
                      </div>
                    </div>
                 </div>
               </div>

               <div className="flex-none pt-4 md:pt-6 border-t border-white/5 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                  <button onClick={generateWhatsAppMessage} className="bg-emerald-600 hover:bg-emerald-500 p-5 md:px-8 md:py-4 text-[13px] md:text-[11px] font-black text-white rounded-sm uppercase italic flex items-center justify-center gap-3 transition-all shadow-xl active:scale-95"><Share2 size={20}/> Log WhatsApp</button>
                  <div className="flex gap-4">
                    <button onClick={() => { resetForm(); setActiveTab('dashboard'); }} className="flex-1 px-4 text-[11px] font-black text-slate-600 uppercase italic">Cancelar</button>
                    <button disabled={isSubmitting} onClick={handleSaveReport} className="flex-[2] md:w-[250px] bg-blue-600 hover:bg-blue-500 p-5 md:px-8 md:py-4 text-[13px] md:text-[11px] font-black text-white rounded-sm uppercase italic flex items-center justify-center gap-3 transition-all shadow-2xl shadow-blue-500/20 active:scale-95">
                      {isSubmitting ? <RefreshCcw className="animate-spin" size={20}/> : <><Save size={20}/> Gravar Final</>}
                    </button>
                  </div>
               </div>
            </div>
          )}
        </div>
      </main>

      <footer className="flex-none bg-[#020617] border-t border-white/5 px-4 md:px-8 py-3 flex justify-between items-center text-[7px] md:text-[8px] font-black uppercase text-slate-600 tracking-[0.2em] italic">
        <div className="flex gap-4 md:gap-10">
           <span className="flex items-center gap-1.5 md:gap-2"><div className="w-1 h-1 rounded-full bg-emerald-500"></div> Sync</span>
           <span className="flex items-center gap-1.5 md:gap-2"><div className="w-1 h-1 rounded-full bg-blue-500"></div> Active</span>
        </div>
        <div className="flex gap-4 md:gap-10 items-center">
           <span className="hidden sm:inline">Ramp Controll Stable v12.8</span>
           <span className="flex items-center gap-1.5 md:gap-2"><Zap size={10} className="text-blue-500"/> Secure Connection</span>
        </div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(37, 99, 235, 0.2); border-radius: 10px; }
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(1) brightness(0.8); cursor: pointer; opacity: 0.2; }
        select { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23475569'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E"); background-position: right 0.6rem center; background-repeat: no-repeat; background-size: 1em; }
        @media screen and (max-width: 768px) {
          input, select, textarea { font-size: 16px !important; }
        }
      `}</style>
    </div>
  );
};

export default App;
