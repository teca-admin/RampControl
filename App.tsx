
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Plane, Wrench, Clock, AlertCircle, CheckCircle2, Calendar, 
  Timer, ChevronLeft, ChevronRight, Zap, HardHat, ArrowRight, 
  Activity, ShieldAlert, UserMinus, FileText, Clock8, 
  LayoutDashboard, TrendingUp, Loader2, RefreshCcw, 
  Handshake, UserPlus, Settings, Search, ExternalLink, 
  Filter, X, History, Award, BarChart as BarChartIcon,
  TrendingDown, AlertTriangle, Truck, Layers
} from 'lucide-react';
import { supabase } from './supabase';
import { ShiftReport, Flight, FleetStat } from './types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, LabelList, PieChart, Pie, Cell
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
  let diff = timeToMinutes(end) - timeToMinutes(start);
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

const calculateDaysDiff = (date1: string, date2: string) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  d1.setHours(0,0,0,0);
  d2.setHours(0,0,0,0);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const App: React.FC = () => {
  // Estado de Inicialização e UI
  const [bootstrapped, setBootstrapped] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  
  // Filtros
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'history' | 'gse'>('dashboard');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedShift, setSelectedShift] = useState<'manha' | 'tarde' | 'noite'>('manha');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Cache de Dados
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [fleetStats, setFleetStats] = useState<FleetStat[]>([]);
  const [fleetDetails, setFleetDetails] = useState<any[]>([]);
  const [allFlights, setAllFlights] = useState<any[]>([]);
  const [maintenanceAging, setMaintenanceAging] = useState<any[]>([]);
  const [maintenanceHistory, setMaintenanceHistory] = useState<any[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any>({ 
    monthlyFlights: 0, avgTurnaround: 0, rentalCount: 0, 
    rentalHours: 0, chartData: [], rentalHistory: [], rentalRanking: []
  });

  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [gseSearchQuery, setGseSearchQuery] = useState('');
  const [showRentalModal, setShowRentalModal] = useState(false);
  const [showAgingModal, setShowAgingModal] = useState(false);

  // --- MODULAR FETCHERS ---

  const fetchDashboard = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setIsFetching(true);
      const { data, error } = await supabase
        .from('vw_relatorios_completos')
        .select('*')
        .eq('data', selectedDate)
        .or(`turno.eq.${selectedShift},turno.eq.${selectedShift === 'manha' ? 'manhã' : selectedShift}`)
        .order('criado_em', { ascending: false })
        .limit(1);

      if (error) throw error;
      if (data?.[0]) {
        const raw = data[0];
        if (raw.voos) raw.voos = raw.voos.filter(isValidFlight);
        setReport(raw);
      } else {
        setReport(null);
      }
    } catch (err) {
      console.error("Dashboard fetch error", err);
    } finally {
      setIsFetching(false);
    }
  }, [selectedDate, selectedShift]);

  const fetchFleet = useCallback(async () => {
    try {
      const [statsRes, detailsRes] = await Promise.all([
        supabase.from('vw_resumo_frota').select('*'),
        supabase.from('equipamentos').select('*').order('prefixo', { ascending: true })
      ]);
      if (statsRes.data) setFleetStats(statsRes.data);
      if (detailsRes.data) setFleetDetails(detailsRes.data);
    } catch (err) {
      console.error("Fleet fetch error", err);
    }
  }, []);

  const fetchAnalytics = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setIsFetching(true);
      const { data: periodData, error: periodErr } = await supabase
        .from('vw_relatorios_completos')
        .select('*')
        .gte('data', startDate)
        .lte('data', endDate)
        .order('data', { ascending: true }); // Ascending to process chronology correctly

      if (periodErr) throw periodErr;

      if (periodData) {
        let fCount = 0, tMins = 0, fWithT = 0, rCount = 0, rMins = 0;
        const fList: any[] = [], rList: any[] = [];
        const rMap: Record<string, number> = {};
        
        // --- LOGICA DE HISTÓRICO DE MANUTENÇÃO (CICLOS FECHADOS) ---
        const closedCycles: any[] = [];
        const openEvents: Record<string, any> = {};

        periodData.forEach((r: any) => {
          // Registro de Entrada (Enviado)
          if (r.tem_equipamento_enviado && r.equipamento_enviado_nome) {
             const prefix = String(r.equipamento_enviado_nome).toUpperCase();
             openEvents[prefix] = {
               prefixo: prefix,
               dataEntrada: r.data,
               turnoEntrada: r.turno,
               motivo: r.equipamento_enviado_motivo,
               liderEntrada: r.lider
             };
          }

          // Registro de Saída (Retornado)
          if (r.tem_equipamento_retornado && r.equipamento_retornado_nome) {
             const prefix = String(r.equipamento_retornado_nome).toUpperCase();
             const entry = openEvents[prefix];
             if (entry) {
               const dias = calculateDaysDiff(entry.dataEntrada, r.data);
               closedCycles.push({
                 ...entry,
                 dataSaida: r.data,
                 turnoSaida: r.turno,
                 liderSaida: r.lider,
                 dias: dias || 1 // Mínimo 1 dia se for no mesmo dia/seguinte
               });
               delete openEvents[prefix];
             }
          }
        });
        setMaintenanceHistory(closedCycles.sort((a,b) => new Date(b.dataSaida).getTime() - new Date(a.dataSaida).getTime()));

        // --- ENVELHECIMENTO (QUEM AINDA ESTÁ LÁ) ---
        const currentlyInMaintenance = fleetDetails.filter(e => e.status === 'MANUTENCAO');
        const agingMap: any[] = [];
        const reverseData = [...periodData].reverse();

        currentlyInMaintenance.forEach(equip => {
            const sendReport = reverseData.find(r => 
                r.tem_equipamento_enviado && 
                (r.equipamento_enviado_nome?.includes(equip.prefixo) || equip.prefixo?.includes(r.equipamento_enviado_nome))
            );

            if (sendReport) {
                agingMap.push({
                    prefixo: equip.prefixo,
                    nome: equip.nome,
                    dias: calculateDaysDiff(sendReport.data, new Date().toISOString().split('T')[0]),
                    motivo: sendReport.equipamento_enviado_motivo,
                    dataEntrada: sendReport.data,
                    lider: sendReport.lider
                });
            } else {
                agingMap.push({
                    prefixo: equip.prefixo,
                    nome: equip.nome,
                    dias: '?',
                    motivo: 'Histórico fora do período selecionado',
                    dataEntrada: '---',
                    lider: '---'
                });
            }
        });
        setMaintenanceAging(agingMap.sort((a,b) => (typeof b.dias === 'number' ? b.dias : 0) - (typeof a.dias === 'number' ? a.dias : 0)));

        // --- DEMAIS ANALYTICS ---
        periodData.forEach((curr: any) => {
          if (curr.tem_aluguel) {
             rCount++;
             const dur = getDurationMinutes(curr.aluguel_inicio, curr.aluguel_fim);
             rMins += dur;
             const eq = curr.aluguel_equipamento || 'N/A';
             rMap[eq] = (rMap[eq] || 0) + 1;
             rList.push({ data: curr.data, turno: curr.turno, equipamento: eq, duracao: Math.round(dur/60) });
          }
          if (curr.voos && Array.isArray(curr.voos)) {
            curr.voos.forEach((v: any) => {
              if (!isValidFlight(v)) return;
              fCount++;
              const dur = getDurationMinutes(v.pouso, v.reboque);
              if (dur > 0) { tMins += dur; fWithT++; }
              fList.push({ ...v, parentDate: curr.data, parentShift: curr.turno, parentLider: curr.lider });
            });
          }
        });

        const dailyMap = periodData.reduce((acc: any, curr: any) => {
          acc[curr.data] = (acc[curr.data] || 0) + (curr.voos?.filter(isValidFlight).length || 0);
          return acc;
        }, {});

        const cData = Object.keys(dailyMap).map(d => ({
          name: d.split('-').reverse().slice(0, 2).join('/'),
          fullDate: d,
          voos: dailyMap[d]
        })).sort((a,b) => a.fullDate.localeCompare(b.fullDate));

        setAnalyticsData({ 
          monthlyFlights: fCount, 
          avgTurnaround: fWithT > 0 ? Math.round(tMins / fWithT) : 0,
          rentalCount: rCount,
          rentalHours: Math.round(rMins / 60),
          chartData: cData,
          rentalHistory: rList,
          rentalRanking: Object.entries(rMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
        });
        setAllFlights(fList);
      }
    } catch (err) {
      console.error("Analytics fetch error", err);
    } finally {
      setIsFetching(false);
    }
  }, [startDate, endDate, fleetDetails]);

  // --- EFFECT ORCHESTRATION ---

  useEffect(() => {
    const init = async () => {
      try {
        const { data } = await supabase
          .from('relatorios_entrega_turno')
          .select('data, turno')
          .order('criado_em', { ascending: false })
          .limit(1);
          
        if (data?.[0]) {
          setSelectedDate(data[0].data);
          setSelectedShift(data[0].turno === 'manhã' ? 'manha' : data[0].turno as any);
        }
      } catch (e) {
        console.warn("Init setup failed.");
      } finally {
        setIsInitialLoading(false);
        setBootstrapped(true);
        const loader = document.getElementById('fallback-loader');
        if (loader) loader.style.display = 'none';
      }
    };
    init();
    fetchFleet(); 
  }, [fetchFleet]);

  useEffect(() => {
    if (!bootstrapped) return;
    if (activeTab === 'dashboard') fetchDashboard();
    else fetchAnalytics();
  }, [activeTab, selectedDate, selectedShift, startDate, endDate, bootstrapped, fetchDashboard, fetchAnalytics]);

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

  // --- GSE MANAGEMENT CALCULATIONS ---
  const gseMetrics = useMemo(() => {
    if (maintenanceHistory.length === 0) return { mttr: 0, totalRepairs: 0, reliabilityRanking: [] };
    
    const totalDays = maintenanceHistory.reduce((acc, curr) => acc + curr.dias, 0);
    const mttr = Math.round(totalDays / maintenanceHistory.length);
    
    const countMap: Record<string, number> = {};
    maintenanceHistory.forEach(h => {
      countMap[h.prefixo] = (countMap[h.prefixo] || 0) + 1;
    });
    
    const ranking = Object.entries(countMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a,b) => b.count - a.count);
      
    return { mttr, totalRepairs: maintenanceHistory.length, reliabilityRanking: ranking };
  }, [maintenanceHistory]);

  const filteredGseHistory = useMemo(() => {
    if (!gseSearchQuery) return maintenanceHistory;
    const q = gseSearchQuery.toLowerCase();
    return maintenanceHistory.filter(h => h.prefixo.toLowerCase().includes(q));
  }, [maintenanceHistory, gseSearchQuery]);

  const goToFlightDashboard = (flight: any) => {
    setSelectedDate(flight.parentDate);
    const shift = flight.parentShift === 'manhã' ? 'manha' : flight.parentShift;
    setSelectedShift(shift as any);
    setActiveTab('dashboard');
  };

  if (isInitialLoading) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased font-sans overflow-hidden">
      {isFetching && (
        <div className="fixed top-0 left-0 right-0 h-0.5 bg-blue-600/20 z-[200] overflow-hidden">
           <div className="h-full bg-blue-500 animate-[progress_1s_ease-in-out_infinite]" style={{ width: '40%' }}></div>
        </div>
      )}

      <div 
        className="origin-top-left flex flex-col"
        style={{ 
          transform: 'scale(0.75)', 
          width: '133.3333%', 
          height: '133.3333%',
          position: 'absolute',
          top: 0,
          left: 0
        }}
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
                { id: 'gse', label: 'Gestão GSE', icon: Truck },
                { id: 'history', label: 'Histórico', icon: Clock8 },
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
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-slate-800/50 border border-white/5 rounded-sm overflow-hidden px-4 py-2 gap-4">
                    <div className="flex items-center gap-2"><Calendar size={12} className="text-blue-500" /><span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">DE</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent border-none font-black text-[10px] focus:ring-0 text-white w-28 cursor-pointer" /></div>
                    <div className="w-px h-4 bg-white/10"></div>
                    <div className="flex items-center gap-2"><span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">ATÉ</span><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent border-none font-black text-[10px] focus:ring-0 text-white w-28 cursor-pointer" /></div>
                </div>
              </div>
            )}
            <button onClick={() => { if(activeTab==='dashboard') fetchDashboard(); else fetchAnalytics(); fetchFleet(); }} className="p-2 bg-white/5 border border-white/5 hover:bg-white/10 text-slate-400 transition-all rounded-sm"><RefreshCcw size={14} className={isFetching ? 'animate-spin text-blue-500' : ''} /></button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-6 flex flex-col gap-6 overflow-x-hidden relative">
          
          {/* Dashboard Tab */}
          <div className={`${activeTab === 'dashboard' ? 'flex flex-col flex-1 opacity-100' : 'hidden opacity-0'} transition-opacity duration-300 gap-6`}>
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
              ) : !isFetching && (
                <div className="flex-1 flex flex-col items-center justify-center opacity-10 border border-dashed border-white/10 h-full py-16"><FileText size={80} className="mb-6 stroke-[1px]" /><h2 className="text-5xl font-black uppercase italic tracking-tighter">SISTEMA VAZIO</h2></div>
            )}
          </div>

          {/* Analytics Tab */}
          <div className={`${activeTab === 'analytics' ? 'flex flex-col flex-1 opacity-100' : 'hidden opacity-0'} transition-opacity duration-300 gap-6 overflow-y-auto custom-scrollbar pr-2 pb-10`}>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
                  <div className="bg-slate-900/40 border border-white/5 p-8 shadow-xl hover:border-blue-500/30 transition-all flex flex-col justify-between"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Volume de Voos</p><p className="text-5xl font-black italic text-white tracking-tighter leading-none">{Number(analyticsData.monthlyFlights)}</p></div>
                  <div className="bg-slate-900/40 border border-white/5 p-8 shadow-xl hover:border-emerald-500/30 transition-all flex flex-col justify-between"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 uppercase">media de tempo de voo</p><p className="text-5xl font-black italic text-white tracking-tighter leading-none">{Math.floor(analyticsData.avgTurnaround / 60)}h {analyticsData.avgTurnaround % 60}m</p></div>
                  <div className="bg-slate-900/40 border border-white/5 p-8 shadow-xl hover:border-slate-500/30 transition-all flex flex-col justify-between group"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Total Equipamentos</p><div className="flex items-baseline gap-2"><p className="text-5xl font-black italic text-white tracking-tighter leading-none">{Number(fleetSummary.total)}</p><Truck size={20} className="text-slate-600 group-hover:text-slate-400 transition-colors" /></div></div>
                  <div className="bg-slate-900/40 border border-white/5 p-8 shadow-xl hover:border-emerald-500/30 transition-all flex flex-col justify-between"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Operantes</p><p className="text-5xl font-black italic text-white tracking-tighter leading-none">{Number(fleetSummary.op)}</p></div>
                  <div onClick={() => setShowAgingModal(true)} className="bg-slate-900/40 border border-white/5 p-8 shadow-xl hover:border-rose-500/30 transition-all flex flex-col justify-between group cursor-pointer relative overflow-hidden"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Indisponíveis</p><div className="flex items-baseline gap-2"><p className="text-5xl font-black italic text-white tracking-tighter leading-none">{Number(fleetSummary.mt)}</p><p className="text-[8px] font-black text-rose-500 uppercase tracking-widest animate-pulse">Ver Tempo de Baixa →</p></div></div>
                  <div onClick={() => setShowRentalModal(true)} className="bg-slate-900/40 border border-white/5 p-8 shadow-xl hover:border-blue-400/30 transition-all flex flex-col justify-between group cursor-pointer relative overflow-hidden"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Locações</p><div className="flex items-baseline gap-2"><p className="text-5xl font-black italic text-white tracking-tighter leading-none">{Number(analyticsData.rentalCount)}</p><p className="text-xl font-black text-blue-400">({Number(analyticsData.rentalHours)}h)</p></div></div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 bg-slate-900/40 border border-white/5 p-10 h-[500px] shadow-2xl"><div className="flex justify-between items-center mb-10"><div><h4 className="text-[14px] font-black text-white uppercase tracking-[0.4em] italic uppercase">Historico de voos</h4></div><TrendingUp size={24} className="text-blue-500 opacity-30" /></div><div className="h-[330px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={analyticsData.chartData || []}><CartesianGrid strokeDasharray="10 10" stroke="#ffffff05" vertical={false} /><XAxis dataKey="name" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} dy={15} fontStyle="italic" fontWeight="bold" /><YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: '#ffffff05' }} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '0px' }} /><Bar dataKey="voos" fill="#2563eb" barSize={30} radius={[2, 2, 0, 0]}><LabelList dataKey="voos" position="insideTop" fill="#fff" style={{ fontSize: '10px', fontWeight: '900', fontStyle: 'italic' }} offset={10} /></Bar></BarChart></ResponsiveContainer></div></div>
                  <div className="bg-slate-900/40 border border-white/5 p-8 shadow-2xl flex flex-col h-[500px]"><div className="flex items-center gap-3 mb-6 shrink-0"><Settings size={20} className="text-blue-500" /><h4 className="text-[12px] font-black text-white uppercase tracking-widest italic uppercase">Frota Atual</h4></div><div className="flex-1 flex gap-4 overflow-hidden"><div className="flex-1 flex flex-col border-r border-white/5 pr-4 overflow-hidden"><p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2 mb-4 shrink-0"><CheckCircle2 size={12}/> Operantes</p><div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 pb-4">{fleetDetails.filter(e => e.status === 'OPERACIONAL').map((e, idx) => (<div key={idx} className="bg-slate-950/40 border-l-2 border-emerald-500/30 p-2.5 flex justify-between items-center group hover:bg-emerald-500/5 transition-all"><div className="overflow-hidden"><p className="text-[10px] font-black text-white italic truncate">{String(e.prefixo)} <span className="text-slate-500 font-normal ml-1 not-italic text-[9px]">- {String(e.nome || 'N/A')}</span></p></div><div className="w-1 h-1 bg-emerald-500 rounded-full shrink-0 ml-2"></div></div>))}</div></div><div className="flex-1 flex flex-col overflow-hidden"><p className="text-[9px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-2 mb-4 shrink-0"><Wrench size={12}/> Manutenção</p><div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 pb-4">{fleetDetails.filter(e => e.status === 'MANUTENCAO').map((e, idx) => (<div key={idx} className="bg-slate-950/40 border-l-2 border-rose-500/30 p-2.5 flex justify-between items-center group hover:bg-rose-500/5 transition-all"><div className="overflow-hidden"><p className="text-[10px] font-black text-white italic truncate">{String(e.prefixo)} <span className="text-slate-500 font-normal ml-1 not-italic text-[9px]">- {String(e.nome || 'N/A')}</span></p></div><div className="w-1 h-1 bg-rose-500 animate-pulse rounded-full shrink-0 ml-2"></div></div>))}</div></div></div></div>
              </div>
          </div>

          {/* GSE MANAGEMENT TAB */}
          <div className={`${activeTab === 'gse' ? 'flex flex-col flex-1 opacity-100' : 'hidden opacity-0'} transition-opacity duration-300 gap-6 overflow-hidden`}>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 shrink-0">
                  <div className="bg-slate-900/40 border border-white/5 p-8 shadow-xl flex flex-col justify-between">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Total de Reparos (Período)</p>
                    <p className="text-5xl font-black italic text-white tracking-tighter leading-none">{gseMetrics.totalRepairs}</p>
                  </div>
                  <div className="bg-slate-900/40 border border-rose-500/20 p-8 shadow-xl flex flex-col justify-between">
                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-4 italic">MTTR (Tempo Médio Reparo)</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-5xl font-black italic text-white tracking-tighter leading-none">{gseMetrics.mttr}</p>
                      <span className="text-xs font-black text-rose-400 uppercase">Dias</span>
                    </div>
                  </div>
                  <div className="md:col-span-2 bg-slate-900/40 border border-white/5 p-8 shadow-xl flex items-center gap-6 overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.05] pointer-events-none"><Award size={80} className="text-blue-500" /></div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-4">Equipamentos Mais Manutenidos</p>
                      <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
                        {gseMetrics.reliabilityRanking.slice(0, 4).map((r, i) => (
                          <div key={i} className="bg-white/5 border border-white/5 p-3 min-w-[120px]">
                            <p className="text-xs font-black italic text-white">{r.name}</p>
                            <p className="text-[9px] font-bold text-slate-500 mt-1">{r.count} ENTRADAS</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
              </div>

              <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 overflow-hidden">
                  <div className="lg:col-span-3 bg-slate-900/40 border border-white/5 overflow-hidden flex flex-col shadow-2xl">
                      <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-slate-950/50">
                        <div className="flex items-center gap-3"><History size={18} className="text-blue-500" /><h4 className="text-[12px] font-black text-white uppercase tracking-widest italic uppercase">Ciclos de Manutenção Concluídos</h4></div>
                        <div className="flex items-center bg-slate-900 border border-white/5 rounded-sm px-4 py-2 gap-3 w-64">
                          <Search size={14} className="text-slate-500" />
                          <input type="text" placeholder="BUSCAR PREFIXO..." className="bg-transparent border-none text-[10px] font-black text-white focus:ring-0 uppercase w-full placeholder:text-slate-700" value={gseSearchQuery} onChange={(e) => setGseSearchQuery(e.target.value)} />
                        </div>
                      </div>
                      <div className="grid grid-cols-5 bg-slate-950 px-8 py-4 border-b border-white/5 text-[9px] font-black text-slate-500 uppercase tracking-widest shrink-0 italic">
                        <div>Equipamento</div>
                        <div>Entrada (GSE)</div>
                        <div>Saída (OP)</div>
                        <div>Duração</div>
                        <div className="text-right">Motivo / Causa</div>
                      </div>
                      <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {filteredGseHistory.length > 0 ? filteredGseHistory.map((h, i) => (
                          <div key={i} className="grid grid-cols-5 px-8 py-5 border-b border-white/5 hover:bg-blue-600/5 transition-all items-center group">
                            <div><p className="text-base font-black text-white italic uppercase tracking-tighter">{h.prefixo}</p></div>
                            <div>
                              <p className="text-[10px] font-black text-slate-300 italic">{h.dataEntrada.split('-').reverse().join('/')}</p>
                              <p className="text-[8px] font-bold text-slate-500 uppercase">LÍDER: {h.liderEntrada}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-emerald-400 italic">{h.dataSaida.split('-').reverse().join('/')}</p>
                              <p className="text-[8px] font-bold text-slate-500 uppercase">LÍDER: {h.liderSaida}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-3 py-1 text-[10px] font-black italic rounded-sm ${h.dias > 5 ? 'bg-rose-500 text-white' : h.dias > 2 ? 'bg-amber-500 text-black' : 'bg-blue-600 text-white'}`}>{h.dias} DIAS</span>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-bold text-slate-400 line-clamp-1 italic">"{h.motivo}"</p>
                            </div>
                          </div>
                        )) : (
                          <div className="flex-1 flex flex-col items-center justify-center opacity-10 h-full py-20"><Wrench size={80} className="mb-4" /><p className="text-[14px] font-black uppercase tracking-[0.5em]">Nenhum ciclo concluído no período</p></div>
                        )}
                      </div>
                  </div>
                  <div className="bg-slate-900/40 border border-white/5 p-8 shadow-xl flex flex-col">
                    <div className="flex items-center gap-3 mb-8 shrink-0"><AlertTriangle size={20} className="text-amber-500" /><h4 className="text-[12px] font-black text-white uppercase tracking-widest italic uppercase">Análise de Indisponibilidade</h4></div>
                    <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-1">
                       <div className="space-y-4">
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Envelhecimento Atual (Frota Parada)</p>
                          {maintenanceAging.length > 0 ? maintenanceAging.map((item, i) => (
                            <div key={i} className="bg-slate-950/50 border-l-4 border-rose-500 p-4">
                              <div className="flex justify-between items-start mb-2">
                                <p className="text-lg font-black text-white italic">{item.prefixo}</p>
                                <span className="text-xl font-black text-rose-500">{item.dias}d</span>
                              </div>
                              <p className="text-[10px] font-bold text-slate-500 leading-tight uppercase italic truncate">"{item.motivo}"</p>
                            </div>
                          )) : <p className="text-[10px] font-bold text-emerald-500 uppercase italic">Toda frota em operação.</p>}
                       </div>
                       <div className="pt-6 border-t border-white/5 space-y-4">
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Recomendações de Ativos</p>
                          <div className="bg-blue-600/5 border border-blue-500/20 p-5">
                            <p className="text-[11px] font-black text-blue-400 italic mb-2 uppercase flex items-center gap-2"><Layers size={12}/> Sugestão de Revisão</p>
                            <p className="text-[10px] font-bold text-slate-300 leading-relaxed italic">Baseado no volume de reparos, os equipamentos <span className="text-white font-black">{gseMetrics.reliabilityRanking.slice(0, 2).map(r => r.name).join(', ')}</span> devem passar por revisão preventiva profunda.</p>
                          </div>
                       </div>
                    </div>
                  </div>
              </div>
          </div>

          {/* History Tab */}
          <div className={`${activeTab === 'history' ? 'flex flex-col flex-1 opacity-100' : 'hidden opacity-0'} transition-opacity duration-300 gap-6 overflow-hidden`}>
              <div className="flex justify-between items-end shrink-0"><div><h4 className="text-[14px] font-black text-white uppercase tracking-[0.4em] italic uppercase">Histórico Geral de Voos</h4></div><div className="flex items-center bg-slate-900 border border-white/5 rounded-sm px-4 py-2 gap-3 w-80"><Search size={14} className="text-slate-500" /><input type="text" placeholder="BUSCAR VOO OU CIA..." className="bg-transparent border-none text-[10px] font-black text-white focus:ring-0 uppercase w-full placeholder:text-slate-700" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div></div>
              <div className="flex-1 bg-slate-900/40 border border-white/5 overflow-hidden flex flex-col shadow-2xl">
                  <div className="grid grid-cols-7 bg-slate-950/80 px-8 py-4 border-b border-white/5 text-[9px] font-black text-slate-500 uppercase tracking-widest shrink-0 italic"><div>Data / Turno</div><div>Companhia</div><div>Voo</div><div>Pouso</div><div>Reboque</div><div>Turnaround</div><div className="text-right">Ações</div></div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {filteredHistory.map((v, i) => (
                        <div key={i} onClick={() => goToFlightDashboard(v)} className="grid grid-cols-7 px-8 py-5 border-b border-white/5 hover:bg-blue-600/5 transition-all cursor-pointer group items-center"><div><p className="text-[10px] font-black text-white italic">{v.parentDate.split('-').reverse().join('/')}</p><p className="text-[8px] font-bold text-blue-500 uppercase tracking-widest mt-0.5">{String(v.parentShift).toUpperCase()}</p></div><div className="text-[11px] font-black text-slate-300 uppercase italic tracking-tighter">{v.companhia}</div><div className="text-[12px] font-black text-white italic tracking-tighter">{v.numero}</div><div className="text-[10px] font-bold text-slate-400 font-mono">{v.pouso}</div><div className="text-[10px] font-bold text-slate-400 font-mono">{v.reboque}</div><div className="text-[11px] font-black text-blue-400 italic tabular-nums">{calculateTurnaround(v.pouso, v.reboque)}</div><div className="flex justify-end"><button className="flex items-center gap-2 bg-white/5 px-4 py-2 text-[8px] font-black text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all rounded-sm uppercase tracking-widest italic border border-white/5 group-hover:border-blue-400">Ver Dashboard <ExternalLink size={10} /></button></div></div>
                    ))}
                  </div>
              </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-slate-900 border-t border-white/5 px-8 py-3 flex justify-between items-center shrink-0">
          <div className="flex gap-10">
            <div className="flex items-center gap-2.5">
              <div className={`w-2 h-2 bg-emerald-500 rounded-full ${isFetching ? 'animate-ping' : 'animate-pulse'} shadow-[0_0_10px_rgba(16,185,129,0.5)]`}></div>
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 italic">{isFetching ? 'SINCRONIZANDO...' : 'SISTEMA ONLINE'}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 italic">Gestão de Ativos Otimizada</span>
            </div>
          </div>
          <div className="flex items-center gap-5 text-[9px] font-black uppercase tracking-tighter italic text-slate-700"><span>RAMP CONTROLL STABLE v7.0</span></div>
        </footer>
      </div>

      <style>{`
        @keyframes progress { 
          from { transform: translateX(-100%); }
          to { transform: translateX(250%); }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(59, 130, 246, 0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59, 130, 246, 0.3); }
        .line-clamp-1 { display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .line-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>
    </div>
  );
};

export default App;
