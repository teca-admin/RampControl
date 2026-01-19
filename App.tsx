
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Plane, Wrench, Clock, AlertCircle, CheckCircle2, Calendar, 
  Timer, ChevronLeft, ChevronRight, Zap, HardHat, ArrowRight, 
  Activity, ShieldAlert, UserMinus, FileText, Clock8, 
  LayoutDashboard, TrendingUp, RefreshCcw, 
  Handshake, UserPlus, Settings, Search, ExternalLink, 
  PlusSquare, Plus, Trash2, Save, Share2,
  BarChart as BarChartIcon, Truck, Menu, X, Info,
  Sun, Moon, Edit3, Send
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
  return !!(v.companhia && String(v.companhia) !== 'null');
};

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'history' | 'new_report'>('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  // Theme management logic
  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  // Mobile Lock Logic - Trava apenas para mobile na tela de lançar
  useEffect(() => {
    const checkMobile = () => {
      if (window.innerWidth < 1024) {
        setActiveTab('new_report');
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Dashboard Controls
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedShift, setSelectedShift] = useState<'manha' | 'tarde' | 'noite'>('manha');
  
  // Analytics/History Controls
  const [analyticsShift, setAnalyticsShift] = useState<'todos' | 'manha' | 'tarde' | 'noite'>('todos');
  const [analyticsAirline, setAnalyticsAirline] = useState<string>('todos');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const [report, setReport] = useState<ShiftReport | null>(null);
  const [fleetStats, setFleetStats] = useState<FleetStat[]>([]);
  const [fleetDetails, setFleetDetails] = useState<any[]>([]);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [airlines, setAirlines] = useState<string[]>([]);
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
  const [formFlights, setFormFlights] = useState<(Partial<Flight> & { manual_name?: string })[]>([
    { companhia: '', numero: 'S/N', pouso: '', reboque: '', manual_name: '' }
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
    setFormFlights([{ companhia: '', numero: 'S/N', pouso: '', reboque: '', manual_name: '' }]);
  }, []);

  const handleAddFlight = () => setFormFlights([...formFlights, { companhia: '', numero: 'S/N', pouso: '', reboque: '', manual_name: '' }]);
  const handleRemoveFlight = (index: number) => setFormFlights(formFlights.filter((_, i) => i !== index));
  const handleFlightChange = (index: number, field: string, value: string) => {
    const updated = [...formFlights];
    updated[index] = { ...updated[index], [field]: value };
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

      const { data: airlinesData } = await supabase.from('companhias_aereas').select('nome').order('nome', { ascending: true });
      if (airlinesData) setAirlines(airlinesData.map(a => a.nome));

      let query = supabase.from('relatorios_entrega_turno').select('*, voos(*)').gte('data', startDate).lte('data', endDate);
      if (analyticsShift !== 'todos') {
        query = query.filter('turno', analyticsShift === 'manha' ? 'in' : 'eq', analyticsShift === 'manha' ? '(manha,manhã)' : analyticsShift);
      }
      const { data: periodData = [] } = await query.order('data', { ascending: false });

      if (periodData) {
        let fCount = 0, tMins = 0, fWithT = 0, rCount = 0, rMins = 0;
        const fList: any[] = [];
        const countsByDate: Record<string, number> = {};

        periodData.forEach((curr: any) => {
          if (curr.tem_aluguel) { rCount++; rMins += getDurationMinutes(curr.aluguel_inicio, curr.aluguel_fim); }
          let dailyCountForThisReport = 0;
          curr.voos?.forEach((v: any) => {
            if (!isValidFlight(v)) return;
            // Filtro de Cia na analise
            if (analyticsAirline !== 'todos' && v.companhia !== analyticsAirline) return;

            fCount++; dailyCountForThisReport++;
            const dur = getDurationMinutes(v.pouso, v.reboque);
            if (dur > 0) { tMins += dur; fWithT++; }
            fList.push({ ...v, parentDate: curr.data, parentShift: curr.turno, parentLider: curr.lider });
          });
          countsByDate[curr.data] = (countsByDate[curr.data] || 0) + dailyCountForThisReport;
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
  }, [selectedDate, selectedShift, startDate, endDate, analyticsShift, analyticsAirline]);

  // Sincronização em tempo real via Canais do Supabase
  useEffect(() => {
    fetchData();
    
    // Inscrição para mudanças instantâneas
    const channel = supabase
      .channel('realtime-groundops')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'relatorios_entrega_turno' },
        () => fetchData(true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voos' },
        () => fetchData(true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'companhias_aereas' },
        () => fetchData(true)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
        .filter(v => (v.companhia === 'OUTROS' ? v.manual_name : v.companhia))
        .map(v => {
          const { manual_name, ...rest } = v;
          return { 
            ...rest, 
            companhia: v.companhia === 'OUTROS' ? (manual_name?.toUpperCase() || 'OUTROS') : v.companhia,
            relatorio_id: newReport.id 
          };
        });

      if (voosToInsert.length > 0) {
        const { error: voosErr } = await supabase.from('voos').insert(voosToInsert);
        if (voosErr) throw voosErr;
      }

      alert("Relatório salvo com sucesso!");
      resetForm();
      if (window.innerWidth >= 1024) {
        setSelectedDate(formDate);
        setSelectedShift(formShift);
        setActiveTab('dashboard');
      }
      fetchData();
    } catch (err: any) { alert(err.message); }
    finally { setIsSubmitting(false); }
  };

  // Dinamic classes based on theme
  const themeClasses = {
    bgMain: isDarkMode ? 'bg-[#020617]' : 'bg-[#f8fafc]',
    bgCard: isDarkMode ? 'bg-[#0f172a]' : 'bg-white',
    bgInput: isDarkMode ? 'bg-[#020617]' : 'bg-[#f1f5f9]',
    border: isDarkMode ? 'border-white/5' : 'border-slate-200',
    textMain: isDarkMode ? 'text-slate-100' : 'text-slate-900',
    textMuted: isDarkMode ? 'text-slate-500' : 'text-slate-400',
    textHeader: isDarkMode ? 'text-white' : 'text-slate-900',
    navActive: isDarkMode ? 'bg-white text-slate-950 shadow-lg' : 'bg-blue-600 text-white shadow-lg',
    navInactive: isDarkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-600',
    shadow: isDarkMode ? 'shadow-2xl' : 'shadow-md border border-slate-200/50'
  };

  return (
    <div className={`h-screen ${themeClasses.bgMain} ${themeClasses.textMain} flex flex-col font-sans selection:bg-blue-600/30 overflow-hidden transition-colors duration-300`}>
      <header className={`flex-none ${isDarkMode ? 'bg-[#020617] border-white/5' : 'bg-white border-slate-200'} border-b px-4 md:px-6 py-4 flex justify-between items-center shadow-xl z-20`}>
        <div className="flex items-center gap-3 md:gap-4">
          <div className="bg-blue-600 p-1.5 rounded shadow-lg shadow-blue-500/20">
            <Zap size={18} className="md:size-5 text-white fill-white" />
          </div>
          <div>
            <h1 className={`text-lg md:text-xl font-black tracking-tighter uppercase italic leading-none ${themeClasses.textHeader}`}>Ramp<span className="text-blue-500">Controll</span></h1>
            <p className="hidden md:flex text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1 italic items-center gap-1">
              <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div> Sincronismo Real
            </p>
          </div>
        </div>

        <nav className={`hidden lg:flex ${isDarkMode ? 'bg-[#0f172a]' : 'bg-slate-100'} p-1 rounded-sm border ${themeClasses.border} gap-1`}>
          <button onClick={() => setActiveTab('dashboard')} className={`flex items-center gap-2 px-6 py-2 text-[11px] font-black uppercase tracking-widest transition-all rounded-sm ${activeTab === 'dashboard' ? themeClasses.navActive : themeClasses.navInactive}`}>
             <LayoutDashboard size={14} /> RELATÓRIO
          </button>
          <button onClick={() => setActiveTab('analytics')} className={`flex items-center gap-2 px-6 py-2 text-[11px] font-black uppercase tracking-widest transition-all rounded-sm ${activeTab === 'analytics' ? themeClasses.navActive : themeClasses.navInactive}`}>
             <BarChartIcon size={14} /> ANÁLISES
          </button>
          <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-6 py-2 text-[11px] font-black uppercase tracking-widest transition-all rounded-sm ${activeTab === 'history' ? themeClasses.navActive : themeClasses.navInactive}`}>
             <Clock8 size={14} /> HISTÓRICO
          </button>
          <button onClick={() => setActiveTab('new_report')} className={`flex items-center gap-2 px-6 py-2 text-[11px] font-black uppercase tracking-widest transition-all rounded-sm ${activeTab === 'new_report' ? themeClasses.navActive : themeClasses.navInactive}`}>
             <PlusSquare size={14} /> LANÇAR
          </button>
        </nav>

        <div className="flex items-center gap-2 md:gap-3">
           <div className="lg:hidden flex ${isDarkMode ? 'bg-[#0f172a]' : 'bg-slate-100'} p-1 rounded-sm border ${themeClasses.border} gap-1">
              <button disabled className={`p-2 rounded-sm ${activeTab === 'new_report' ? 'bg-white text-slate-950' : 'text-slate-500'}`}><PlusSquare size={16}/></button>
           </div>

           {(activeTab === 'dashboard' || activeTab === 'history') && window.innerWidth >= 1024 && (
             <div className={`hidden md:flex items-center ${isDarkMode ? 'bg-[#0f172a]' : 'bg-slate-100'} border ${themeClasses.border} rounded-sm divide-x ${isDarkMode ? 'divide-white/5' : 'divide-slate-200'}`}>
                <div className="flex items-center px-3 py-1.5 gap-2">
                  <ChevronLeft size={16} className={`${themeClasses.textMuted} cursor-pointer hover:text-blue-500 transition-colors`} />
                  <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className={`bg-transparent border-none text-[11px] font-black ${isDarkMode ? 'text-white' : 'text-slate-900'} p-0 uppercase focus:ring-0`} />
                  <ChevronRight size={16} className={`${themeClasses.textMuted} cursor-pointer hover:text-blue-500 transition-colors`} />
                </div>
                <div className="flex">
                  {(['manha', 'tarde', 'noite'] as const).map(s => (
                    <button key={s} onClick={() => setSelectedShift(s)} className={`px-4 py-1.5 text-[9px] font-black uppercase italic ${selectedShift === s ? 'bg-blue-600 text-white' : `${themeClasses.textMuted} hover:text-blue-500 transition-colors`}`}>{s === 'manha' ? 'MANHÃ' : s === 'tarde' ? 'TARDE' : 'NOITE'}</button>
                  ))}
                </div>
             </div>
           )}

           <div className="flex items-center gap-1.5">
              <button onClick={toggleTheme} className={`p-2 md:p-2.5 ${isDarkMode ? 'bg-[#0f172a]' : 'bg-slate-100'} border ${themeClasses.border} rounded-sm hover:border-blue-500 transition-all text-slate-400 hover:text-blue-500`}>
                {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button onClick={() => fetchData()} className={`p-2 md:p-2.5 ${isDarkMode ? 'bg-[#0f172a]' : 'bg-slate-100'} border ${themeClasses.border} rounded-sm hover:border-blue-500 transition-all text-slate-400 hover:text-blue-500`}>
                <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
           </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        <div className="h-full p-4 md:p-6 w-full max-w-[1900px] mx-auto flex flex-col">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center opacity-30"><RefreshCcw size={48} className="animate-spin text-blue-500 mb-6" /><p className="text-[11px] font-black uppercase tracking-[0.5em] italic text-center">Sincronizando rampa...</p></div>
          ) : activeTab === 'dashboard' ? (
            /* ABA RELATÓRIO */
            <div className="animate-in fade-in duration-500 h-full flex flex-col gap-4 md:gap-6">
              {report ? (
                <div className="grid grid-cols-12 gap-4 md:gap-8 flex-1 overflow-hidden">
                  <div className="col-span-12 lg:col-span-9 flex flex-col gap-4 md:gap-6 overflow-hidden">
                     <div className="flex-none flex flex-col md:flex-row justify-between items-start md:items-end gap-4 md:gap-6">
                        <div className="space-y-1">
                          <p className="text-[9px] md:text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] italic">Relatório de Entrega de Turno</p>
                          <h2 className={`text-3xl md:text-4xl font-black italic uppercase tracking-tighter ${themeClasses.textHeader}`}>Log de <span className="text-blue-600">Atendimentos</span></h2>
                        </div>
                        <div className={`${isDarkMode ? 'bg-[#0f172a]/90' : 'bg-white'} border ${themeClasses.border} p-3 md:p-4 rounded-sm shadow-xl flex items-center gap-3 transition-colors duration-300`}>
                          <div className={`${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'} p-2 rounded-sm transition-colors duration-300`}><HardHat size={16} className="md:size-[18px] text-blue-500"/></div>
                          <div>
                            <p className={`text-[6px] md:text-[7px] font-black ${themeClasses.textMuted} uppercase italic tracking-widest mb-0.5`}>Responsável</p>
                            <p className={`text-[10px] md:text-xs font-black italic uppercase tracking-tighter ${isDarkMode ? 'text-blue-100' : 'text-slate-900'}`}>{report.lider}</p>
                          </div>
                        </div>
                     </div>
                     <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                        {report.voos?.length ? report.voos.map((voo, idx) => (
                          <div key={idx} className={`${isDarkMode ? 'bg-[#020617] border-white/5' : 'bg-white border-slate-200'} border p-4 md:p-6 flex justify-between items-center group relative hover:border-blue-500/50 transition-all rounded-sm shadow-md duration-300`}>
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 opacity-0 group-hover:opacity-100 transition-all"></div>
                            <div className="flex items-center gap-4 md:gap-6">
                              <div className={`${isDarkMode ? 'bg-[#0f172a]' : 'bg-slate-100'} p-4 border ${themeClasses.border} rounded-sm text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-all`}><Plane size={24}/></div>
                              <div>
                                <h3 className={`text-xl md:text-2xl font-black italic uppercase tracking-tighter ${themeClasses.textHeader}`}>{voo.companhia}</h3>
                                <div className="flex items-center gap-3 md:gap-4 mt-1 md:mt-1.5">
                                  <div className={`flex items-center gap-1.5 text-[8px] md:text-[9px] font-black uppercase ${themeClasses.textMuted} italic`}><Clock size={10} className="text-blue-600"/> In: <span className={isDarkMode ? 'text-white' : 'text-slate-900'}>{voo.pouso}</span></div>
                                  <div className={`flex items-center gap-1.5 text-[8px] md:text-[9px] font-black uppercase ${themeClasses.textMuted} italic`}><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Out: <span className={isDarkMode ? 'text-white' : 'text-slate-900'}>{voo.reboque}</span></div>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`text-[7px] md:text-[8px] font-black ${themeClasses.textMuted} uppercase italic tracking-widest`}>Solo</p>
                              <p className={`text-2xl md:text-4xl font-black italic tracking-tighter tabular-nums group-hover:text-blue-500 transition-colors ${themeClasses.textHeader}`}>{calculateTurnaround(voo.pouso, voo.reboque)}</p>
                            </div>
                          </div>
                        )) : (
                          <div className="h-full flex flex-col items-center justify-center opacity-10">
                            <Plane size={64} className="md:size-[80px] mb-4"/><p className="text-base md:text-lg font-black italic uppercase">Sem registros para este turno</p>
                          </div>
                        )}
                     </div>
                     <div className="flex-none grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 pb-2">
                        <div className={`${isDarkMode ? 'bg-[#020617] border-amber-500/20' : 'bg-white border-amber-200'} border p-4 md:p-6 rounded-sm min-h-[100px] md:min-h-[140px] shadow-sm`}>
                          <div className="flex items-center gap-2 mb-3 md:mb-4">
                             <div className="text-amber-500"><AlertCircle size={14} className="md:size-4"/></div>
                             <h4 className="text-[9px] md:text-[10px] font-black uppercase italic tracking-[0.2em] text-amber-500">Pendências</h4>
                          </div>
                          <p className={`text-[10px] md:text-[11px] font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-600'} italic leading-snug uppercase`}>{report.descricao_pendencias || "Nenhuma pendência"}</p>
                        </div>
                        <div className={`${isDarkMode ? 'bg-[#0f172a]/30 border-white/5' : 'bg-white border-slate-200'} border p-4 md:p-6 rounded-sm min-h-[100px] md:min-h-[140px] shadow-sm`}>
                          <div className="flex items-center gap-2 mb-3 md:mb-4">
                             <div className="text-slate-500"><ShieldAlert size={14} className="md:size-4"/></div>
                             <h4 className={`text-[9px] md:text-[10px] font-black uppercase italic tracking-[0.2em] ${themeClasses.textMuted}`}>Ocorrências</h4>
                          </div>
                          <p className={`text-[10px] md:text-[11px] font-bold ${isDarkMode ? 'text-slate-600' : 'text-slate-500'} italic leading-snug uppercase`}>{report.descricao_ocorrencias || "Não"}</p>
                        </div>
                     </div>
                  </div>
                  <div className="hidden lg:flex col-span-3 flex-col gap-6 overflow-hidden">
                     <div className={`${isDarkMode ? 'bg-[#0f172a]/40 border-white/5' : 'bg-white border-slate-200'} border p-5 rounded-sm space-y-4 flex-none shadow-sm`}>
                        <h4 className={`text-[10px] font-black uppercase italic tracking-[0.2em] ${isDarkMode ? 'text-slate-300' : 'text-slate-500'} flex items-center justify-between`}>Locações <Handshake size={14}/></h4>
                        {report.tem_aluguel ? (
                          <div className={`${isDarkMode ? 'bg-[#020617] border-white/5' : 'bg-slate-50 border-slate-100'} p-4 border rounded-sm`}>
                            <p className="text-sm font-black italic text-blue-500 uppercase">{report.aluguel_equipamento}</p>
                            <p className={`text-[9px] font-black ${themeClasses.textMuted} uppercase mt-1 italic`}>Duração: {report.aluguel_inicio} - {report.aluguel_fim}</p>
                          </div>
                        ) : ( <p className={`text-[9px] font-black ${isDarkMode ? 'text-slate-700' : 'text-slate-300'} uppercase italic py-2 text-center`}>Sem locações ativas</p> )}
                     </div>
                     <div className={`${isDarkMode ? 'bg-[#0f172a]/40 border-rose-600/30' : 'bg-rose-50 border-rose-200'} border p-5 rounded-sm space-y-4 flex-none shadow-sm`}>
                        <h4 className="text-[10px] font-black uppercase italic tracking-[0.2em] text-rose-500 flex justify-between items-center">Remoções GSE <Wrench size={14}/></h4>
                        {report.tem_equipamento_enviado ? (
                          <div className="space-y-3">
                            <p className="text-[8px] font-black text-rose-500/80 uppercase italic">Baixa Técnica</p>
                            <h5 className={`text-3xl font-black italic tracking-tighter uppercase leading-none ${themeClasses.textHeader}`}>{report.equipamento_enviado_nome}</h5>
                            <div className={`${isDarkMode ? 'bg-[#020617] border-rose-500/10' : 'bg-white border-rose-100'} p-3 border rounded-sm shadow-inner`}>
                              <p className="text-[10px] font-bold text-rose-500 italic">"{report.equipamento_enviado_motivo}"</p>
                            </div>
                          </div>
                        ) : ( <p className={`text-[9px] font-black ${isDarkMode ? 'text-slate-700' : 'text-slate-300'} uppercase italic py-2 text-center`}>Toda frota operante</p> )}
                     </div>
                     <div className={`${isDarkMode ? 'bg-[#0f172a]/40 border-white/5' : 'bg-white border-slate-200'} border p-5 rounded-sm flex-1 flex flex-col min-h-0 shadow-sm transition-colors duration-300`}>
                        <h4 className={`text-[10px] font-black uppercase italic tracking-[0.2em] ${isDarkMode ? 'text-slate-300' : 'text-slate-500'} mb-4 flex-none`}>Controle de Pessoal</h4>
                        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                          {[ { l: 'Faltas', v: report.teve_falta, c: 'rose' }, { l: 'Atestados', v: report.teve_atestado, c: 'blue' }, { l: 'Compensação', v: report.teve_compensacao, c: 'slate' }, { l: 'Saída Antecipada', v: report.teve_saida_antecipada, c: 'emerald' } ].map(q => (
                            <div key={q.l} className={`flex justify-between items-center p-3 border-l-2 transition-all ${isDarkMode ? 'bg-[#020617]/50' : 'bg-slate-50'} ${q.v ? `border-${q.c}-500` : 'border-transparent'}`}>
                               <div className="flex items-center gap-3"><span className={`text-[9px] font-black uppercase italic ${q.v ? (isDarkMode ? 'text-white' : 'text-slate-900') : themeClasses.textMuted}`}>{q.l}</span></div>
                               <span className={`text-[9px] font-black uppercase italic ${q.v ? `text-${q.c}-500` : (isDarkMode ? 'text-slate-800' : 'text-slate-200')}`}>{q.v ? 'SIM' : 'NÃO'}</span>
                            </div>
                          ))}
                        </div>
                     </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center opacity-10 text-center">
                  <LayoutDashboard size={80} className="mb-4" />
                  <h2 className="text-2xl font-black italic uppercase">Nenhum relatório para the turno selecionado</h2>
                  <p className="text-sm font-black uppercase mt-4">Tente selecionar outra data ou turno</p>
                </div>
              )}
            </div>
          ) : activeTab === 'analytics' ? (
            /* ABA ANÁLISES */
            <div className="animate-in slide-in-from-right-5 duration-500 h-full flex flex-col gap-4 md:gap-6 overflow-hidden">
               {/* FILTROS DE ANALISE */}
               <div className={`flex-none flex flex-col md:flex-row items-end gap-4 ${isDarkMode ? 'bg-[#0f172a]/30' : 'bg-white'} p-4 border ${themeClasses.border} rounded-sm shadow-sm transition-colors duration-300`}>
                  <div className="flex flex-col gap-1.5 flex-1 w-full">
                    <label className="text-[8px] font-black text-blue-500 uppercase tracking-widest italic">Início do Período</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={`${themeClasses.bgInput} border ${themeClasses.border} p-2.5 font-black ${isDarkMode ? 'text-white' : 'text-slate-900'} text-xs rounded-sm uppercase italic focus:border-blue-500 outline-none w-full transition-colors duration-300`} />
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1 w-full">
                    <label className="text-[8px] font-black text-blue-500 uppercase tracking-widest italic">Fim do Período</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={`${themeClasses.bgInput} border ${themeClasses.border} p-2.5 font-black ${isDarkMode ? 'text-white' : 'text-slate-900'} text-xs rounded-sm uppercase italic focus:border-blue-500 outline-none w-full transition-colors duration-300`} />
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1 w-full">
                    <label className="text-[8px] font-black text-blue-500 uppercase tracking-widest italic">Filtro CIA</label>
                    <select value={analyticsAirline} onChange={e => setAnalyticsAirline(e.target.value)} className={`${themeClasses.bgInput} border ${themeClasses.border} p-2.5 font-black ${isDarkMode ? 'text-white' : 'text-slate-900'} text-xs rounded-sm uppercase italic focus:border-blue-500 outline-none w-full appearance-none transition-colors duration-300`}>
                      <option value="todos">TODAS AS CIAS</option>
                      {airlines.map(cia => <option key={cia} value={cia}>{cia}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1 w-full">
                    <label className="text-[8px] font-black text-blue-500 uppercase tracking-widest italic">Turno Filtro</label>
                    <select value={analyticsShift} onChange={e => setAnalyticsShift(e.target.value as any)} className={`${themeClasses.bgInput} border ${themeClasses.border} p-2.5 font-black ${isDarkMode ? 'text-white' : 'text-slate-900'} text-xs rounded-sm uppercase italic focus:border-blue-500 outline-none w-full appearance-none transition-colors duration-300`}>
                      <option value="todos">TODOS OS TURNOS</option>
                      <option value="manha">MANHÃ</option>
                      <option value="tarde">TARDE</option>
                      <option value="noite">NOITE</option>
                    </select>
                  </div>
                  <button onClick={() => fetchData()} className="bg-blue-600 p-2.5 rounded-sm hover:bg-blue-500 transition-all active:scale-95 text-white shadow-lg"><RefreshCcw size={16} className={loading ? 'animate-spin' : ''}/></button>
               </div>

               <div className="flex-none grid grid-cols-2 md:grid-cols-6 gap-3 md:gap-4">
                  {[ 
                    { l: 'Voos', v: analyticsData.monthlyFlights, s: 'No período', c: 'blue' }, 
                    { l: 'Média Solo', v: `${Math.floor(analyticsData.avgTurnaround / 60)}h ${analyticsData.avgTurnaround % 60}m`, s: 'Turnaround', c: 'neutral' }, 
                    { l: 'Frota Total', v: fleetSummary.total, s: 'Equipamentos', c: 'neutral' },
                    { l: 'Operantes', v: fleetSummary.op, s: 'Frota Ativa', c: 'emerald' }, 
                    { l: 'Manutenção', v: fleetSummary.mt, s: 'Indisponíveis', c: 'rose' }, 
                    { l: 'Locações', v: analyticsData.rentalCount, s: `${analyticsData.rentalHours}h totais`, c: 'blue' } 
                  ].map((k, i) => (
                    <div key={i} className={`${isDarkMode ? 'bg-[#0f172a]/30' : 'bg-white'} border ${themeClasses.border} p-4 md:p-5 rounded-sm shadow-xl space-y-2 md:space-y-3 group hover:bg-blue-500/5 transition-all duration-300`}>
                      <h4 className={`text-[7px] md:text-[8px] font-black ${themeClasses.textMuted} uppercase italic tracking-widest leading-none`}>{k.l}</h4>
                      <p className={`text-xl md:text-3xl font-black italic tracking-tighter tabular-nums leading-none ${k.c === 'emerald' ? 'text-emerald-500' : k.c === 'rose' ? 'text-rose-500' : k.c === 'blue' ? 'text-blue-500' : themeClasses.textHeader}`}>{k.v}</p>
                      <p className={`text-[7px] md:text-[8px] font-bold ${isDarkMode ? 'text-slate-700' : 'text-slate-400'} uppercase italic leading-none`}>{k.s}</p>
                    </div>
                  ))}
               </div>
               <div className="flex-1 grid grid-cols-12 gap-4 md:gap-6 overflow-hidden">
                  <div className={`col-span-12 lg:col-span-8 ${isDarkMode ? 'bg-[#0f172a]/30' : 'bg-white'} border ${themeClasses.border} p-6 md:p-8 rounded-sm shadow-xl flex flex-col overflow-hidden transition-colors duration-300`}>
                    <div className="flex-none flex justify-between items-start mb-6 md:mb-10">
                      <div className="space-y-1">
                        <h3 className={`text-lg md:text-xl font-black italic uppercase tracking-tighter ${themeClasses.textHeader}`}>Histórico de <span className="text-blue-600">Demanda</span></h3>
                        <p className={`text-[8px] md:text-[9px] font-black ${themeClasses.textMuted} uppercase italic tracking-widest`}>Atendimentos por dia</p>
                      </div>
                      <TrendingUp className="text-blue-500/20 md:size-[32px]" size={24} />
                    </div>
                    <div className="flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analyticsData.chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#ffffff03" : "#00000005"} vertical={false} />
                          <XAxis dataKey="name" stroke={isDarkMode ? "#475569" : "#94a3b8"} fontSize={9} fontStyle="italic" dy={5} axisLine={false} tickLine={false} />
                          <YAxis stroke={isDarkMode ? "#475569" : "#94a3b8"} fontSize={9} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{backgroundColor: isDarkMode ? '#020617' : '#ffffff', border: `1px solid ${isDarkMode ? '#1e293b' : '#e2e8f0'}`, fontSize: '9px', color: isDarkMode ? '#fff' : '#000'}} cursor={{fill: isDarkMode ? 'white' : 'blue', opacity: 0.05}} />
                          <Bar dataKey="voos" fill="#2563eb" radius={[2, 2, 0, 0]} barSize={35}>
                            <LabelList dataKey="voos" position="top" fill={isDarkMode ? "#ffffff" : "#2563eb"} style={{fontSize: '10px', fontWeight: '900', fontStyle: 'italic'}} dy={-10} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className={`col-span-12 lg:col-span-4 ${isDarkMode ? 'bg-[#0f172a]/30' : 'bg-white'} border ${themeClasses.border} p-6 md:p-8 rounded-sm shadow-xl flex flex-col overflow-hidden transition-colors duration-300`}>
                     <div className="flex-none flex justify-between items-center mb-6 md:mb-8"><h3 className={`text-base md:text-lg font-black italic uppercase tracking-tighter flex items-center gap-3 ${themeClasses.textHeader}`}><Settings size={18} className="text-blue-500"/> Visão de Frota</h3></div>
                     <div className="flex-1 grid grid-cols-2 gap-4 md:gap-6 min-h-0">
                        <div className="flex flex-col gap-4 overflow-hidden">
                          <h4 className="flex-none text-[8px] md:text-[9px] font-black italic uppercase tracking-[0.2em] text-emerald-500 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Operantes</h4>
                          <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                            {fleetDetails.filter(e => e.status === 'OPERACIONAL').map(e => (
                              <div key={e.id} className={`${isDarkMode ? 'bg-[#020617]/50 border-r-2 border-emerald-500/0' : 'bg-slate-50 border-r-2 border-slate-100'} hover:border-emerald-500 p-2.5 transition-all flex justify-between items-center group`}>
                                 <div><p className={`text-[10px] md:text-xs font-black italic uppercase tracking-tighter leading-none ${themeClasses.textHeader}`}>{e.prefixo}</p><p className={`text-[6px] md:text-[7px] font-bold ${isDarkMode ? 'text-slate-600' : 'text-slate-400'} uppercase italic mt-1 leading-none`}>{e.nome}</p></div>
                                 <div className="w-1 h-1 rounded-full bg-emerald-500/30 group-hover:bg-emerald-500 transition-all"></div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col gap-4 overflow-hidden">
                          <h4 className="flex-none text-[8px] md:text-[9px] font-black italic uppercase tracking-[0.2em] text-rose-500 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div> Manutenção</h4>
                          <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                            {fleetDetails.filter(e => e.status === 'MANUTENCAO').map(e => (
                              <div key={e.id} className={`${isDarkMode ? 'bg-[#020617]/50 border-r-2 border-rose-500/0' : 'bg-slate-50 border-r-2 border-slate-100'} hover:border-rose-500 p-2.5 transition-all flex justify-between items-center group`}>
                                 <div><p className={`text-[10px] md:text-xs font-black italic uppercase tracking-tighter leading-none ${themeClasses.textHeader}`}>{e.prefixo}</p><p className={`text-[6px] md:text-[7px] font-bold ${isDarkMode ? 'text-slate-600' : 'text-slate-400'} uppercase italic mt-1 leading-none`}>{e.nome}</p></div>
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
                  <div className="space-y-1"><h2 className={`text-3xl md:text-4xl font-black italic uppercase tracking-tighter ${themeClasses.textHeader}`}>Histórico Geral</h2><p className={`text-[8px] md:text-[9px] font-black ${themeClasses.textMuted} uppercase tracking-widest italic text-center md:text-left`}>Todos os voos processados na base</p></div>
                  <div className={`${isDarkMode ? 'bg-[#0f172a]' : 'bg-white'} border ${themeClasses.border} flex items-center px-4 py-2 gap-3 w-full md:w-[350px] shadow-xl focus-within:border-blue-500 transition-all`}><Search size={16} className={themeClasses.textMuted} /><input type="text" placeholder="CIA OU LÍDER..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className={`bg-transparent border-none focus:ring-0 text-[10px] font-black uppercase w-full italic ${isDarkMode ? 'text-white' : 'text-slate-900'}`} /></div>
               </div>
               <div className={`${themeClasses.bgCard} border ${themeClasses.border} shadow-2xl overflow-hidden flex flex-col transition-colors duration-300`}>
                  <div className={`flex-none grid grid-cols-6 ${isDarkMode ? 'bg-[#0f172a]' : 'bg-slate-100'} px-4 md:px-6 py-4 text-[8px] md:text-[9px] font-black ${themeClasses.textMuted} uppercase tracking-widest border-b ${themeClasses.border} italic`}>
                    <div className="col-span-2 md:col-span-1">Data / Turno</div><div className="col-span-3 md:col-span-2">Atendimento</div><div className="hidden md:block">Turnaround</div><div className="hidden md:block">Líder</div><div className="text-right">Link</div>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-white/5 custom-scrollbar">
                     {allFlights.length > 0 ? allFlights.filter(f => !searchQuery || JSON.stringify(f).toLowerCase().includes(searchQuery.toLowerCase())).map((v, i) => (
                       <div key={i} onClick={() => { setSelectedDate(v.parentDate); setSelectedShift(v.parentShift === 'manhã' ? 'manha' : v.parentShift); setActiveTab('dashboard'); }} className={`grid grid-cols-6 px-4 md:px-6 py-4 md:py-5 items-center hover:bg-blue-600/5 transition-all cursor-pointer group`}>
                          <div className="col-span-2 md:col-span-1"><p className={`text-xs md:text-sm font-black italic ${themeClasses.textHeader}`}>{v.parentDate.split('-').reverse().join('/')}</p><p className="text-[7px] md:text-[8px] font-bold text-blue-500 uppercase italic">{String(v.parentShift).toUpperCase()}</p></div>
                          <div className="col-span-3 md:col-span-2 flex items-center gap-3 md:gap-4"><Plane size={16} className={`${isDarkMode ? 'text-slate-700' : 'text-slate-300'} group-hover:text-blue-500 transition-colors`} /><p className={`text-sm md:text-lg font-black italic tracking-tighter uppercase ${themeClasses.textHeader}`}>{v.companhia}</p></div>
                          <div className={`hidden md:block text-lg font-black italic tracking-tighter tabular-nums group-hover:text-blue-500 ${themeClasses.textHeader}`}>{calculateTurnaround(v.pouso, v.reboque)}</div>
                          <div className={`hidden md:block text-[9px] font-black ${themeClasses.textMuted} uppercase italic truncate pr-4`}>{v.parentLider}</div>
                          <div className="flex justify-end"><button className={`${isDarkMode ? 'bg-slate-800' : 'bg-slate-200'} px-3 md:px-4 py-1.5 md:py-2 text-[7px] md:text-[8px] font-black ${isDarkMode ? 'text-slate-400' : 'text-slate-600'} group-hover:bg-blue-600 group-hover:text-white transition-all uppercase italic`}>Ver</button></div>
                       </div>
                     )) : <div className="py-20 text-center opacity-10 italic font-black uppercase text-xs">Nenhum registro encontrado</div>}
                  </div>
               </div>
            </div>
          ) : (
            /* ABA LANÇAR RELATÓRIO - FORMULÁRIO COMPLETO */
            <div className="animate-in slide-in-from-bottom-5 duration-500 h-full flex flex-col overflow-hidden pb-4">
               <div className="flex-1 overflow-y-auto pr-1 md:pr-2 custom-scrollbar space-y-6 md:space-y-8">
                 <div className={`${isDarkMode ? 'bg-[#0f172a]/30' : 'bg-white'} border ${themeClasses.border} p-5 md:p-8 shadow-2xl flex flex-col md:flex-row md:flex-wrap gap-5 md:gap-8 items-stretch md:items-end rounded-sm transition-colors duration-300`}>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest italic leading-none">Data do Turno</label>
                       <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className={`${themeClasses.bgInput} border ${themeClasses.border} p-4 md:p-3.5 font-black ${isDarkMode ? 'text-white' : 'text-slate-900'} rounded-sm uppercase text-xs md:text-sm focus:border-blue-500 outline-none transition-colors duration-300`} />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest italic leading-none">Turno</label>
                       <div className={`flex ${themeClasses.bgInput} p-1 border ${themeClasses.border} rounded-sm transition-colors duration-300`}>
                          {(['manha', 'tarde', 'noite'] as const).map(t => (
                            <button key={t} onClick={() => setFormShift(t)} className={`flex-1 md:px-6 py-3 md:py-2.5 text-[10px] md:text-[9px] font-black uppercase italic rounded-sm transition-all ${formShift === t ? 'bg-blue-600 text-white shadow-lg' : isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>{t}</button>
                          ))}
                       </div>
                    </div>
                    <div className="flex-1 space-y-2">
                       <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest italic leading-none">Líder Responsável</label>
                       <select value={formLeader} onChange={e => setFormLeader(e.target.value)} className={`${themeClasses.bgInput} border ${themeClasses.border} p-4 md:p-3.5 font-black ${isDarkMode ? 'text-white' : 'text-slate-900'} w-full uppercase italic rounded-sm text-xs md:text-sm focus:border-blue-500 outline-none appearance-none transition-colors duration-300`}>
                          <option value="">-- SELECIONE LÍDER --</option>
                          {leaders.map(l => <option key={l.id} value={l.nome}>{l.nome}</option>)}
                       </select>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                    <div className="space-y-6 md:space-y-8">
                       <div className={`${isDarkMode ? 'bg-[#0f172a]/30' : 'bg-white'} border ${themeClasses.border} p-5 md:p-6 shadow-xl rounded-sm transition-colors duration-300`}>
                          <h4 className="text-[12px] md:text-[11px] font-black italic uppercase text-blue-500 mb-5 md:mb-6">1 - Controle de RH</h4>
                          <div className="grid grid-cols-2 gap-3">
                            {[{k: 'falta', l: 'Falta'}, {k: 'atestado', l: 'Atestado'}, {k: 'compensacao', l: 'Compens.'}, {k: 'saida_antecipada', l: 'Saída Ant.'}].map(i => (
                              <button key={i.k} onClick={() => setFormHR({...formHR, [i.k as keyof typeof formHR]: !formHR[i.k as keyof typeof formHR]})} className={`p-5 md:p-4 border-2 md:border transition-all text-center rounded-sm ${formHR[i.k as keyof typeof formHR] ? 'bg-rose-500/20 border-rose-500/50 text-rose-500' : `${themeClasses.bgInput} border-transparent opacity-40`}`}>
                                <span className="text-[11px] md:text-[9px] font-black uppercase italic">{i.l}</span>
                              </button>
                            ))}
                          </div>
                       </div>

                       <div className={`${isDarkMode ? 'bg-[#0f172a]/30' : 'bg-white'} border ${themeClasses.border} p-5 md:p-6 shadow-xl rounded-sm space-y-6 transition-colors duration-300`}>
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-amber-500 uppercase italic">2 - Pendências para o turno seguinte</label>
                             <textarea value={formPendencias} onChange={e => setFormPendencias(e.target.value)} rows={3} className={`${themeClasses.bgInput} border ${themeClasses.border} p-4 font-bold text-sm md:text-xs rounded-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-900'} w-full italic uppercase outline-none focus:border-amber-500/30 transition-colors duration-300`} placeholder="DESCREVA PENDÊNCIAS..."></textarea>
                          </div>
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-rose-500 uppercase italic">3 - Ocorrências / Avarias do Plantão</label>
                             <textarea value={formOcorrencias} onChange={e => setFormOcorrencias(e.target.value)} rows={3} className={`${themeClasses.bgInput} border ${themeClasses.border} p-4 font-bold text-sm md:text-xs rounded-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-900'} w-full italic uppercase outline-none focus:border-rose-500/30 transition-colors duration-300`} placeholder="DESCREVA OCORRÊNCIAS..."></textarea>
                          </div>
                       </div>

                       <div className={`${isDarkMode ? 'bg-[#0f172a]/30' : 'bg-white'} border ${themeClasses.border} p-5 md:p-6 shadow-xl rounded-sm transition-colors duration-300`}>
                          <div className="flex justify-between items-center mb-6">
                             <h4 className="text-[12px] md:text-[11px] font-black italic uppercase text-blue-500">4 - Locação Ativa</h4>
                             <button onClick={() => setFormAluguel({...formAluguel, ativo: !formAluguel.ativo})} className={`px-4 py-2 text-[10px] font-black uppercase italic rounded-sm transition-all ${formAluguel.ativo ? 'bg-emerald-600 text-white' : (isDarkMode ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400')}`}>{formAluguel.ativo ? 'ATIVO' : 'NÃO'}</button>
                          </div>
                          {formAluguel.ativo && (
                            <div className="space-y-4 animate-in slide-in-from-top-2">
                               <input type="text" placeholder="NOME DO EQUIPAMENTO" value={formAluguel.nome} onChange={e => setFormAluguel({...formAluguel, nome: e.target.value.toUpperCase()})} className={`${themeClasses.bgInput} border ${themeClasses.border} p-4 font-black text-sm w-full uppercase outline-none ${isDarkMode ? 'text-white' : 'text-slate-900'}`} />
                               <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                     <label className={`text-[8px] font-black ${themeClasses.textMuted} uppercase`}>Início</label>
                                     <input type="time" value={formAluguel.inicio} onChange={e => setFormAluguel({...formAluguel, inicio: e.target.value})} className={`${themeClasses.bgInput} border ${themeClasses.border} p-3 font-black text-sm w-full text-blue-500 transition-colors duration-300`} />
                                  </div>
                                  <div className="space-y-1">
                                     <label className={`text-[8px] font-black ${themeClasses.textMuted} uppercase`}>Fim</label>
                                     <input type="time" value={formAluguel.fim} onChange={e => setFormAluguel({...formAluguel, fim: e.target.value})} className={`${themeClasses.bgInput} border ${themeClasses.border} p-3 font-black text-sm w-full text-blue-500 transition-colors duration-300`} />
                                  </div>
                               </div>
                            </div>
                          )}
                       </div>
                    </div>

                    <div className="space-y-6 md:space-y-8">
                       <div className={`${isDarkMode ? 'bg-[#0f172a]/30' : 'bg-white'} border ${themeClasses.border} p-5 md:p-6 shadow-xl rounded-sm flex flex-col transition-colors duration-300`}>
                         <div className="flex justify-between items-center mb-6">
                           <h4 className="text-[12px] md:text-[11px] font-black italic uppercase text-blue-500">5 - Log de CIAs</h4>
                           <button onClick={handleAddFlight} className="bg-blue-600 px-6 md:px-4 py-3 md:py-2 text-[11px] md:text-[9px] font-black uppercase italic rounded-sm shadow-lg active:scale-95 transition-all text-white">+ Inserir CIA</button>
                         </div>
                         <div className="space-y-4 max-h-[450px] md:max-h-[400px] overflow-y-auto pr-1 md:pr-2 custom-scrollbar">
                           {formFlights.map((v, i) => (
                             <div key={i} className={`${themeClasses.bgInput} border ${themeClasses.border} p-5 md:p-4 rounded-sm flex flex-col relative group shadow-lg transition-colors duration-300`}>
                               <button onClick={() => handleRemoveFlight(i)} className="absolute -top-3 -right-3 md:-top-2 md:-right-2 bg-rose-600 p-2 md:p-1 rounded-full z-10 text-white shadow-lg"><Trash2 size={16} className="md:size-3"/></button>
                               
                               <div className="flex flex-col md:grid md:grid-cols-4 gap-4">
                                 <div className="flex flex-col gap-1 md:col-span-2">
                                    <label className={`text-[8px] font-black ${themeClasses.textMuted} uppercase italic`}>Companhia</label>
                                    <select 
                                      value={v.companhia} 
                                      onChange={e => handleFlightChange(i, 'companhia', e.target.value)} 
                                      className={`${isDarkMode ? 'bg-slate-900' : 'bg-white'} border-none p-4 md:p-2 font-black text-xs w-full uppercase outline-none focus:ring-1 focus:ring-blue-500 italic appearance-none transition-colors duration-300`}
                                    >
                                      <option value="">-- CIA --</option>
                                      {airlines.map(cia => (
                                        <option key={cia} value={cia}>{cia}</option>
                                      ))}
                                      <option value="OUTROS">OUTROS (DIGITAR)</option>
                                    </select>
                                 </div>

                                 <div className="flex flex-col gap-1">
                                    <label className="text-[8px] font-black text-blue-500 uppercase italic">Início</label>
                                    <input type="time" value={v.pouso} onChange={e => handleFlightChange(i, 'pouso', e.target.value)} className={`${isDarkMode ? 'bg-slate-900' : 'bg-white'} border-none p-4 md:p-2 font-black text-xs w-full text-blue-500 transition-colors duration-300`} />
                                 </div>

                                 <div className="flex flex-col gap-1">
                                    <label className="text-[8px] font-black text-emerald-500 uppercase italic">Fim</label>
                                    <input type="time" value={v.reboque} onChange={e => handleFlightChange(i, 'reboque', e.target.value)} className={`${isDarkMode ? 'bg-slate-900' : 'bg-white'} border-none p-4 md:p-2 font-black text-xs w-full text-emerald-500 transition-colors duration-300`} />
                                 </div>
                               </div>

                               {/* Campo manual se OUTROS estiver selecionado */}
                               {v.companhia === 'OUTROS' && (
                                 <div className="mt-3 md:mt-4 animate-in slide-in-from-top-1 flex flex-col gap-1">
                                    <label className="text-[8px] font-black text-amber-500 uppercase italic flex items-center gap-1.5"><Edit3 size={10}/> Digite o nome da Companhia</label>
                                    <input 
                                      type="text" 
                                      placeholder="NOME DA CIA..." 
                                      value={v.manual_name || ''} 
                                      onChange={e => handleFlightChange(i, 'manual_name', e.target.value.toUpperCase())}
                                      className={`${isDarkMode ? 'bg-slate-900 border-amber-500/20' : 'bg-amber-50 border-amber-200'} border p-4 md:p-3 font-black text-sm w-full uppercase outline-none focus:border-amber-500 transition-all rounded-sm italic`}
                                    />
                                 </div>
                               )}
                             </div>
                           ))}
                         </div>
                       </div>

                       <div className={`${isDarkMode ? 'bg-[#0f172a]/30' : 'bg-white'} border ${themeClasses.border} p-5 md:p-6 shadow-xl rounded-sm transition-colors duration-300`}>
                          <div className="flex justify-between items-center mb-6">
                             <h4 className="text-[12px] md:text-[11px] font-black italic uppercase text-rose-500">6 - Baixa Técnica GSE</h4>
                             <button onClick={() => setFormGseOut({...formGseOut, ativo: !formGseOut.ativo})} className={`px-4 py-2 text-[10px] font-black uppercase italic rounded-sm transition-all ${formGseOut.ativo ? 'bg-rose-600 text-white' : (isDarkMode ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400')}`}>{formGseOut.ativo ? 'ENVIADO' : 'NÃO'}</button>
                          </div>
                          {formGseOut.ativo && (
                            <div className="space-y-4 animate-in slide-in-from-top-2">
                               <div className="space-y-1">
                                  <label className={`text-[8px] font-black ${themeClasses.textMuted} uppercase italic`}>Equipamento (Operacional)</label>
                                  <select value={formGseOut.prefixo} onChange={e => setFormGseOut({...formGseOut, prefixo: e.target.value})} className={`${themeClasses.bgInput} border ${themeClasses.border} p-4 font-black ${isDarkMode ? 'text-white' : 'text-slate-900'} text-sm w-full uppercase outline-none appearance-none italic transition-colors duration-300`}>
                                     <option value="">-- SELECIONE EQUIPAMENTO --</option>
                                     {fleetDetails.filter(e => e.status === 'OPERACIONAL').map(e => (
                                       <option key={e.id} value={e.prefixo}>{e.prefixo} - {e.nome}</option>
                                     ))}
                                  </select>
                               </div>
                               <textarea placeholder="MOTIVO DA BAIXA..." value={formGseOut.motivo} onChange={e => setFormGseOut({...formGseOut, motivo: e.target.value.toUpperCase()})} rows={2} className={`${themeClasses.bgInput} border ${themeClasses.border} p-4 font-bold text-xs w-full italic uppercase outline-none ${isDarkMode ? 'text-white' : 'text-slate-900'} transition-colors duration-300`} />
                            </div>
                          )}
                       </div>

                       <div className={`${isDarkMode ? 'bg-[#0f172a]/30' : 'bg-white'} border ${themeClasses.border} p-5 md:p-6 shadow-xl rounded-sm transition-colors duration-300`}>
                          <div className="flex justify-between items-center mb-6">
                             <h4 className="text-[12px] md:text-[11px] font-black italic uppercase text-emerald-500">7 - Retorno de GSE</h4>
                             <button onClick={() => setFormGseIn({...formGseIn, ativo: !formGseIn.ativo})} className={`px-4 py-2 text-[10px] font-black uppercase italic rounded-sm transition-all ${formGseIn.ativo ? 'bg-emerald-600 text-white' : (isDarkMode ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400')}`}>{formGseIn.ativo ? 'RETORNO' : 'NÃO'}</button>
                          </div>
                          {formGseIn.ativo && (
                            <div className="animate-in slide-in-from-top-2 space-y-1">
                               <label className={`text-[8px] font-black ${themeClasses.textMuted} uppercase italic`}>Equipamento (Em Manutenção)</label>
                               <select value={formGseIn.prefixo} onChange={e => setFormGseIn({...formGseIn, prefixo: e.target.value})} className={`${themeClasses.bgInput} border ${themeClasses.border} p-4 font-black ${isDarkMode ? 'text-white' : 'text-slate-900'} text-sm w-full uppercase outline-none appearance-none italic transition-colors duration-300`}>
                                  <option value="">-- SELECIONE EQUIPAMENTO --</option>
                                  {fleetDetails.filter(e => e.status === 'MANUTENCAO').map(e => (
                                    <option key={e.id} value={e.prefixo}>{e.prefixo} - {e.nome}</option>
                                  ))}
                               </select>
                            </div>
                          )}
                       </div>
                    </div>
                 </div>
               </div>

               <div className={`flex-none pt-4 md:pt-6 border-t ${themeClasses.border} flex flex-col md:flex-row justify-end items-stretch md:items-center gap-4 transition-colors duration-300`}>
                  <div className="flex gap-4">
                    <button onClick={() => { resetForm(); setActiveTab('dashboard'); }} className={`flex-1 px-4 text-[11px] font-black ${themeClasses.textMuted} uppercase italic hover:text-blue-500 transition-colors`}>Cancelar</button>
                    <button disabled={isSubmitting} onClick={handleSaveReport} className="flex-[2] md:w-[250px] bg-blue-600 hover:bg-blue-500 p-5 md:px-8 md:py-4 text-[13px] md:text-[11px] font-black text-white rounded-sm uppercase italic flex items-center justify-center gap-3 transition-all shadow-2xl shadow-blue-500/20 active:scale-95">
                      {isSubmitting ? <RefreshCcw className="animate-spin" size={20}/> : <><Send size={20}/> ENVIAR RELATÓRIO</>}
                    </button>
                  </div>
               </div>
            </div>
          )}
        </div>
      </main>

      <footer className={`flex-none ${isDarkMode ? 'bg-[#020617] border-white/5' : 'bg-white border-slate-200'} border-t px-4 md:px-8 py-3 flex justify-between items-center text-[7px] md:text-[8px] font-black uppercase ${themeClasses.textMuted} tracking-[0.2em] italic transition-colors duration-300`}>
        <div className="flex gap-4 md:gap-10">
           <span className="flex items-center gap-1.5 md:gap-2"><div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div> Sincronizado</span>
           <span className="flex items-center gap-1.5 md:gap-2"><div className="w-1 h-1 rounded-full bg-blue-500"></div> Real-time</span>
        </div>
        <div className="flex gap-4 md:gap-10 items-center">
           <span className="hidden sm:inline">Ramp Controll Stable v15.1</span>
           <span className="flex items-center gap-1.5 md:gap-2"><Zap size={10} className="text-blue-500"/> Secure Cloud Connection</span>
        </div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(37, 99, 235, 0.2); border-radius: 10px; }
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="time"]::-webkit-calendar-picker-indicator { 
          filter: ${isDarkMode ? 'invert(1) brightness(0.8)' : 'none'}; 
          cursor: pointer; 
          opacity: ${isDarkMode ? '0.2' : '0.5'}; 
        }
        select { 
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23475569'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E"); 
          background-position: right 0.6rem center; 
          background-repeat: no-repeat; 
          background-size: 1em; 
        }
        @media screen and (max-width: 768px) {
          input, select, textarea { font-size: 16px !important; }
        }
      `}</style>
    </div>
  );
};

export default App;
