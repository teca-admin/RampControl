
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Plane, 
  Wrench, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  Calendar,
  Timer,
  ChevronLeft,
  ChevronRight,
  Zap,
  HardHat,
  ArrowRight,
  Activity,
  ShieldAlert,
  UserMinus,
  FileText,
  Clock8,
  Cpu,
  BarChart3,
  LayoutDashboard,
  TrendingUp,
  Package,
  Loader2,
  RefreshCcw,
  Info,
  Handshake,
  UserPlus,
  Plus,
  Settings,
  Search,
  ExternalLink,
  Filter,
  X,
  History,
  Award
} from 'lucide-react';
import { supabase } from './supabase';
import { ShiftReport, Flight, FleetStat } from './types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  LabelList
} from 'recharts';

// Helpers de tempo seguros
const timeToMinutes = (time?: any): number => {
  if (typeof time !== 'string' || !time) return 0;
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
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

/**
 * Validador de voo rigoroso. 
 */
const isValidFlight = (v: any): boolean => {
  if (!v) return false;
  const company = String(v.companhia || '').toLowerCase().trim();
  const num = String(v.numero || '').toLowerCase().trim();
  
  if (!company || company === 'null' || company === 'undefined') return false;
  if (!num || num === 'null' || num === 'undefined') return false;
  
  return true;
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'history'>('dashboard');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedShift, setSelectedShift] = useState<'manha' | 'tarde' | 'noite'>('manha');
  
  // Filtros Globais/Análise
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRentalModal, setShowRentalModal] = useState(false);

  const [report, setReport] = useState<ShiftReport | null>(null);
  const [fleetStats, setFleetStats] = useState<FleetStat[]>([]);
  const [fleetDetails, setFleetDetails] = useState<any[]>([]);
  const [allFlights, setAllFlights] = useState<any[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any>({ 
    monthlyFlights: 0, 
    avgTurnaround: 0, 
    rentalCount: 0, 
    rentalHours: 0,
    chartData: [],
    rentalHistory: [],
    rentalRanking: []
  });
  
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const initialLoadDone = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      
      // 1. Dados do Dashboard (Relatório Específico)
      if (activeTab === 'dashboard') {
        const { data: reportData, error: reportError } = await supabase
          .from('vw_relatorios_completos')
          .select('*')
          .eq('data', selectedDate)
          .or(`turno.eq.${selectedShift},turno.eq.${selectedShift === 'manha' ? 'manhã' : selectedShift}`)
          .order('criado_em', { ascending: false })
          .limit(1);

        if (reportError) throw reportError;
        
        if (reportData?.[0]) {
          const rawReport = reportData[0];
          if (rawReport.voos && Array.isArray(rawReport.voos)) {
            rawReport.voos = rawReport.voos.filter(isValidFlight);
          }
          setReport(rawReport);
        } else {
          setReport(null);
        }
      }

      // 2. Dados de Frota
      const { data: fleetData } = await supabase.from('vw_resumo_frota').select('*');
      setFleetStats(fleetData || []);

      const { data: allEquips } = await supabase.from('equipamentos').select('*').order('prefixo', { ascending: true });
      setFleetDetails(allEquips || []);

      // 3. Dados de Análise e Histórico de Voos
      if (activeTab === 'analytics' || activeTab === 'history') {
        const { data: periodData, error: periodError } = await supabase
          .from('vw_relatorios_completos')
          .select('*')
          .gte('data', startDate)
          .lte('data', endDate)
          .order('data', { ascending: false });

        if (periodError) throw periodError;
        if (periodData) {
          let totalFlightsCount = 0;
          let totalTurnaroundMinutes = 0;
          let flightsWithTurnaround = 0;
          let rentalCount = 0;
          let rentalMinutes = 0;
          const flightsList: any[] = [];
          const rentalsList: any[] = [];
          const rankingMap: Record<string, number> = {};

          const dailyStats = periodData.reduce((acc: any, curr: any) => {
            const date = curr.data;
            let dayFlights = 0;
            
            if (curr.tem_aluguel) {
               rentalCount++;
               const duration = getDurationMinutes(curr.aluguel_inicio, curr.aluguel_fim);
               rentalMinutes += duration;
               
               const equipName = curr.aluguel_equipamento || 'NÃO IDENTIFICADO';
               rankingMap[equipName] = (rankingMap[equipName] || 0) + 1;

               rentalsList.push({
                 id: curr.id,
                 data: curr.data,
                 turno: curr.turno,
                 equipamento: equipName,
                 inicio: curr.aluguel_inicio,
                 fim: curr.aluguel_fim,
                 duracao: Math.round(duration / 60)
               });
            }

            if (curr.voos && Array.isArray(curr.voos)) {
              curr.voos.forEach((v: any) => {
                if (!isValidFlight(v)) return;
                dayFlights++;
                totalFlightsCount++;
                const duration = getDurationMinutes(v.pouso, v.reboque);
                if (duration > 0) {
                  totalTurnaroundMinutes += duration;
                  flightsWithTurnaround++;
                }
                flightsList.push({
                  ...v,
                  parentDate: curr.data,
                  parentShift: curr.turno,
                  parentLider: curr.lider
                });
              });
            }

            acc[date] = (acc[date] || 0) + dayFlights;
            return acc;
          }, {});

          const chartData = Object.keys(dailyStats).map(date => ({
            name: date.split('-').reverse().slice(0, 2).join('/'),
            fullDate: date,
            voos: dailyStats[date]
          })).sort((a,b) => a.fullDate.localeCompare(b.fullDate));

          const rentalRanking = Object.entries(rankingMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);

          setAnalyticsData({ 
            monthlyFlights: totalFlightsCount, 
            avgTurnaround: flightsWithTurnaround > 0 ? Math.round(totalTurnaroundMinutes / flightsWithTurnaround) : 0,
            rentalCount: rentalCount,
            rentalHours: Math.round(rentalMinutes / 60),
            chartData,
            rentalHistory: rentalsList,
            rentalRanking: rentalRanking
          });

          setAllFlights(flightsList);
        }
      }
    } catch (err: any) {
      setErrorMsg(`Falha ao conectar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedShift, activeTab, startDate, endDate]);

  useEffect(() => {
    const init = async () => {
      try {
        const { data } = await supabase.from('relatorios_entrega_turno').select('data, turno').order('criado_em', { ascending: false }).limit(1);
        if (data?.[0]) {
          setSelectedDate(data[0].data);
          setSelectedShift(data[0].turno === 'manhã' ? 'manha' : data[0].turno as any);
        }
      } catch (e) {} finally { initialLoadDone.current = true; }
    };
    if (!initialLoadDone.current) init();
  }, []);

  useEffect(() => { if (initialLoadDone.current) fetchData(); }, [fetchData]);

  const fleetSummary = useMemo(() => {
    const operational = fleetStats.find(s => s.status === 'OPERACIONAL')?.total || 0;
    const maintenance = fleetStats.find(s => s.status === 'MANUTENCAO')?.total || 0;
    const alugado = fleetStats.find(s => s.status === 'ALUGADO')?.total || 0;
    return { operational, maintenance, alugado, total: operational + maintenance + alugado };
  }, [fleetStats]);

  const filteredHistory = useMemo(() => {
    if (!searchQuery) return allFlights;
    const q = searchQuery.toLowerCase();
    return allFlights.filter(f => 
      String(f.numero).toLowerCase().includes(q) || 
      String(f.companhia).toLowerCase().includes(q)
    );
  }, [allFlights, searchQuery]);

  const goToFlightDashboard = (flight: any) => {
    setSelectedDate(flight.parentDate);
    const shift = flight.parentShift === 'manhã' ? 'manha' : flight.parentShift;
    setSelectedShift(shift as any);
    setActiveTab('dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased font-sans">
      {/* Modal de Locações */}
      {showRentalModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
           <div className="bg-slate-900 border border-white/10 w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden rounded-sm">
              <div className="bg-slate-950 px-8 py-6 border-b border-white/5 flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-4">
                    <div className="bg-blue-600 p-2 rounded-sm"><Handshake size={20} className="text-white"/></div>
                    <div>
                       <h3 className="text-xl font-black italic uppercase tracking-tighter">Detalhamento de <span className="text-blue-500">Locações</span></h3>
                       <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Relatório consolidado do período: {startDate.split('-').reverse().join('/')} a {endDate.split('-').reverse().join('/')}</p>
                    </div>
                 </div>
                 <button onClick={() => setShowRentalModal(false)} className="p-2 hover:bg-white/10 text-slate-400 transition-all rounded-sm">
                    <X size={24} />
                 </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar grid grid-cols-1 lg:grid-cols-3 gap-8">
                 <div className="lg:col-span-1 space-y-6">
                    <div className="bg-slate-950/50 border border-white/5 p-6 shadow-xl">
                       <div className="flex items-center gap-3 mb-6">
                          <Award size={18} className="text-blue-500" />
                          <h4 className="text-[11px] font-black text-white uppercase tracking-widest italic">Ranking: Mais Locados</h4>
                       </div>
                       <div className="space-y-3">
                          {analyticsData.rentalRanking.length > 0 ? analyticsData.rentalRanking.map((item: any, idx: number) => (
                             <div key={idx} className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-sm group hover:border-blue-500/30 transition-all">
                                <div className="flex items-center gap-3">
                                   <span className="text-[10px] font-black text-blue-500/50 w-4">#{idx + 1}</span>
                                   <span className="text-[11px] font-black text-slate-100 uppercase italic truncate max-w-[150px]">{item.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                   <span className="text-lg font-black italic text-blue-500">{item.count}</span>
                                   <span className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter mt-1">vezes</span>
                                </div>
                             </div>
                          )) : (
                             <p className="text-[10px] font-bold text-slate-700 uppercase italic">Nenhum dado de ranking disponível</p>
                          )}
                       </div>
                    </div>

                    <div className="bg-blue-600/5 border border-blue-500/20 p-6 shadow-xl">
                       <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Capacidade Operacional</p>
                       <h4 className="text-lg font-black text-white uppercase italic tracking-tighter mb-4">Uso de Terceiros</h4>
                       <div className="flex items-baseline gap-2 mb-4">
                          <p className="text-4xl font-black italic text-white">{analyticsData.rentalCount}</p>
                          <p className="text-sm font-bold text-blue-400 uppercase tracking-widest">Locações totais</p>
                       </div>
                       <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden">
                          <div className="bg-blue-500 h-full" style={{ width: '65%' }}></div>
                       </div>
                       <p className="text-[8px] font-bold text-slate-500 uppercase mt-2 italic">Aproximadamente 3.2h de uso médio por locação</p>
                    </div>
                 </div>

                 <div className="lg:col-span-2 space-y-6">
                    <div className="bg-slate-950/50 border border-white/5 shadow-xl flex flex-col h-full min-h-[500px]">
                       <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
                          <History size={18} className="text-slate-500" />
                          <h4 className="text-[11px] font-black text-white uppercase tracking-widest italic">Histórico Cronológico de Locações</h4>
                       </div>
                       <div className="flex-1 overflow-y-auto custom-scrollbar">
                          {analyticsData.rentalHistory.length > 0 ? (
                            <table className="w-full text-left border-collapse">
                               <thead className="sticky top-0 bg-slate-950 z-10">
                                  <tr className="border-b border-white/5 text-[9px] font-black text-slate-600 uppercase tracking-widest italic">
                                     <th className="px-6 py-4">Data/Turno</th>
                                     <th className="px-6 py-4">Equipamento</th>
                                     <th className="px-6 py-4">Período</th>
                                     <th className="px-6 py-4 text-right">Duração</th>
                                  </tr>
                               </thead>
                               <tbody className="divide-y divide-white/5">
                                  {analyticsData.rentalHistory.map((rent: any, idx: number) => (
                                     <tr key={idx} className="hover:bg-blue-600/5 transition-all group cursor-pointer">
                                        <td className="px-6 py-4">
                                           <p className="text-[10px] font-black text-white italic">{rent.data.split('-').reverse().join('/')}</p>
                                           <p className="text-[8px] font-bold text-blue-500 uppercase">{rent.turno}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                           <p className="text-[11px] font-black text-slate-300 uppercase italic">{rent.equipamento}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                           <p className="text-[10px] font-mono text-slate-500">{rent.inicio} <ArrowRight size={8} className="inline mx-1"/> {rent.fim}</p>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                           <p className="text-[12px] font-black italic text-blue-400 tabular-nums">{rent.duracao}h</p>
                                        </td>
                                     </tr>
                                  ))}
                               </tbody>
                            </table>
                          ) : (
                             <div className="flex-1 flex flex-col items-center justify-center opacity-10 py-20">
                                <Handshake size={48} />
                                <p className="text-[10px] font-black uppercase tracking-widest mt-4">Sem registros de locação</p>
                             </div>
                          )}
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      <header className="bg-slate-900/50 border-b border-white/5 px-8 py-4 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-3">
             <div className="bg-blue-600 p-2 rounded-sm"><Zap size={18} className="text-white fill-white" /></div>
             <div>
                <h1 className="text-lg font-black tracking-tighter uppercase italic leading-none">Ramp<span className="text-blue-500">Controll</span></h1>
                <div className="flex items-center gap-2 mt-1">
                   <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                   <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest">SISTEMA GSE</p>
                </div>
             </div>
          </div>
          <nav className="flex bg-white/5 p-1 rounded-sm border border-white/5">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'analytics', label: 'Análises', icon: BarChart3 },
              { id: 'history', label: 'Histórico', icon: Clock8 },
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)} 
                className={`flex items-center gap-2 px-6 py-2 text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}
              >
                <tab.icon size={12} /> {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
           {activeTab === 'dashboard' ? (
             <div className="flex items-center gap-3">
               <div className="flex items-center bg-slate-800/50 border border-white/5 rounded-sm overflow-hidden">
                  <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d.toISOString().split('T')[0]); }} className="p-2 hover:bg-white/10 text-slate-400"><ChevronLeft size={14}/></button>
                  <div className="px-3 flex items-center gap-2 border-x border-white/5">
                     <Calendar size={12} className="text-blue-500" />
                     <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent border-none font-black text-[10px] focus:ring-0 text-white w-28 uppercase cursor-pointer" />
                  </div>
                  <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d.toISOString().split('T')[0]); }} className="p-2 hover:bg-white/10 text-slate-400"><ChevronRight size={14}/></button>
               </div>
               <div className="flex bg-slate-800/50 p-1 border border-white/5 rounded-sm gap-1">
                  {(['manha', 'tarde', 'noite'] as const).map(t => (
                    <button key={t} onClick={() => setSelectedShift(t)} className={`px-4 py-1.5 text-[8px] font-black uppercase tracking-tighter transition-all ${selectedShift === t ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>
                      {t === 'manha' ? 'Manhã' : t === 'tarde' ? 'Tarde' : 'Noite'}
                    </button>
                  ))}
               </div>
             </div>
           ) : (
             <div className="flex items-center gap-3">
               <div className="flex items-center bg-slate-800/50 border border-white/5 rounded-sm overflow-hidden px-4 py-2 gap-4">
                  <div className="flex items-center gap-2">
                     <Calendar size={12} className="text-blue-500" />
                     <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">DE</span>
                     <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent border-none font-black text-[10px] focus:ring-0 text-white w-28 cursor-pointer" />
                  </div>
                  <div className="w-px h-4 bg-white/10"></div>
                  <div className="flex items-center gap-2">
                     <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">ATÉ</span>
                     <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent border-none font-black text-[10px] focus:ring-0 text-white w-28 cursor-pointer" />
                  </div>
               </div>
             </div>
           )}
           <button onClick={() => fetchData()} className="p-2 bg-white/5 border border-white/5 hover:bg-white/10 text-slate-400 transition-all rounded-sm">
              <RefreshCcw size={14} className={loading ? 'animate-spin text-blue-500' : ''} />
           </button>
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col gap-6 overflow-x-hidden">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-50">
            <Loader2 size={40} className="animate-spin text-blue-500" />
            <p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-400 italic">CARREGANDO OPERAÇÃO...</p>
          </div>
        ) : errorMsg ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
             <div className="max-w-md bg-rose-950/20 border border-rose-500/20 p-8 shadow-2xl">
                <AlertCircle size={48} className="text-rose-500 mx-auto mb-6" />
                <h2 className="text-xl font-black uppercase italic tracking-tighter text-white mb-2">ERRO CRÍTICO</h2>
                <p className="text-[11px] font-bold text-slate-400 leading-relaxed uppercase mb-8">{errorMsg}</p>
                <button onClick={() => fetchData()} className="w-full bg-white text-slate-950 py-3 font-black text-[10px] uppercase tracking-widest">RECONECTAR</button>
             </div>
          </div>
        ) : activeTab === 'dashboard' ? (
          <div className="flex-1 flex flex-col gap-6 animate-in fade-in duration-500">
             {report ? (
               <>
                 <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[55%] min-h-[400px]">
                    <div className="lg:col-span-3 bg-slate-900/40 border border-white/5 p-10 flex flex-col shadow-2xl relative group overflow-hidden">
                       <div className="absolute top-0 right-0 p-10 opacity-[0.03] scale-150 rotate-12 pointer-events-none group-hover:opacity-[0.05] transition-opacity duration-1000"><Plane size={240} /></div>
                       <div className="flex justify-between items-start mb-10 shrink-0 relative z-10">
                          <div>
                             <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em] mb-3 block italic">Relatório de Entrega de Turno</span>
                             <h2 className="text-4xl font-black tracking-tighter italic uppercase text-white leading-none">LOG DE <span className="text-blue-600">ATENDIMENTOS</span></h2>
                          </div>
                          <div className="bg-slate-800/80 px-5 py-4 border border-white/5 shadow-lg">
                             <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Responsável</p>
                             <div className="flex items-center gap-3 text-blue-100 font-black italic uppercase text-base">
                                <HardHat size={20} className="text-blue-500" /> 
                                {String(report.lider || 'N/A')}
                             </div>
                          </div>
                       </div>
                       <div className="flex-1 overflow-y-auto custom-scrollbar pr-3 space-y-4 relative z-10">
                          {report.voos && report.voos.length > 0 ? report.voos.map((voo, idx) => (
                            <div key={idx} className="bg-slate-950/50 border border-white/5 p-6 hover:border-blue-500/40 transition-all flex justify-between items-center group/voo shadow-sm">
                               <div className="flex items-center gap-8">
                                  <div className="bg-blue-600/10 p-4 group-hover/voo:bg-blue-600 transition-all"><Plane size={24} className="text-blue-500 group-hover/voo:text-white" /></div>
                                  <div>
                                     <p className="text-2xl font-black italic tracking-tighter uppercase text-white">{String(voo.companhia)} <span className="text-blue-500">{String(voo.numero)}</span></p>
                                     <div className="flex items-center gap-4 mt-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                        <span className="flex items-center gap-1.5"><Clock size={12} className="text-blue-400"/> POUSO {String(voo.pouso)}</span>
                                        <ArrowRight size={10} className="text-slate-700" />
                                        <span className="flex items-center gap-1.5"><Timer size={12} className="text-emerald-400"/> REBOQUE {String(voo.reboque)}</span>
                                     </div>
                                  </div>
                               </div>
                               <div className="text-right">
                                  <p className="text-[9px] font-black text-blue-500/50 uppercase mb-1 tracking-widest italic">Tempo de Solo</p>
                                  <p className="text-3xl font-black tabular-nums text-white italic tracking-tighter">
                                     {calculateTurnaround(voo.pouso, voo.reboque)}
                                  </p>
                               </div>
                            </div>
                          )) : (
                            <div className="flex-1 flex flex-col items-center justify-center opacity-10 border border-dashed border-white/10 h-full py-16">
                               <Activity size={60} className="mb-6" />
                               <p className="text-[12px] font-black uppercase tracking-[0.5em]">Sem atendimentos no turno</p>
                            </div>
                          )}
                       </div>
                    </div>
                    <div className="flex flex-col gap-6">
                       <div className={`flex-1 bg-slate-900/40 border p-8 flex flex-col justify-between shadow-xl transition-all ${report.tem_aluguel ? 'border-blue-500/40 bg-blue-950/10' : 'border-white/5 opacity-60'}`}>
                          <div className="flex items-center gap-3 mb-6">
                            <Handshake size={24} className={report.tem_aluguel ? 'text-blue-500' : 'text-slate-600'} />
                            <h4 className="text-[12px] font-black text-white uppercase tracking-widest italic uppercase">Locações do Turno</h4>
                          </div>
                          {report.tem_aluguel ? (
                            <div className="space-y-4">
                               <p className="text-[9px] font-black text-slate-500 uppercase">Equipamento</p>
                               <p className="text-2xl font-black text-white italic leading-tight uppercase">{String(report.aluguel_equipamento)}</p>
                               <div className="grid grid-cols-2 gap-2 pt-4 border-t border-white/5">
                                  <div><p className="text-[8px] text-slate-500 font-bold uppercase">Início</p><p className="text-base font-black text-blue-400">{String(report.aluguel_inicio)}</p></div>
                                  <div><p className="text-[8px] text-slate-500 font-bold uppercase">Término</p><p className="text-base font-black text-blue-400">{String(report.aluguel_fim)}</p></div>
                               </div>
                            </div>
                          ) : <p className="text-[10px] font-bold text-slate-700 uppercase italic">Sem locações ativas</p>}
                       </div>
                       <div className={`flex-1 bg-slate-900/40 border p-8 flex flex-col justify-between shadow-xl transition-all ${report.tem_equipamento_enviado ? 'border-rose-500/40 bg-rose-950/10' : 'border-white/5 opacity-60'}`}>
                          <div className="flex justify-between items-center mb-6">
                             <h4 className="text-[12px] font-black text-white uppercase tracking-widest italic uppercase">Remoções GSE</h4>
                             <Wrench size={24} className={report.tem_equipamento_enviado ? 'text-rose-500' : 'text-slate-600'} />
                          </div>
                          {report.tem_equipamento_enviado ? (
                            <div className="space-y-3">
                               <div><p className="text-[9px] font-black text-rose-500 uppercase">Retirado da Operação</p><h3 className="text-2xl font-black text-white italic uppercase leading-tight">{String(report.equipamento_enviado_nome)}</h3></div>
                               <div className="bg-black/40 p-3 border border-rose-500/10 italic text-[10px] font-bold text-rose-100/70 line-clamp-2">"{String(report.equipamento_enviado_motivo)}"</div>
                            </div>
                          ) : <p className="text-[10px] font-bold text-slate-700 uppercase italic">Frota operacional íntegra</p>}
                       </div>
                    </div>
                 </div>
                 <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-[150px]">
                    <div className="lg:col-span-3 bg-slate-900/40 border border-white/5 p-8 flex gap-10 shadow-xl overflow-hidden">
                       <div className={`flex-1 p-6 border transition-all ${report.tem_pendencias ? 'bg-amber-950/10 border-amber-500/30' : 'bg-slate-950/50 border-white/5 opacity-40'}`}>
                          <div className="flex items-center gap-4 mb-4"><ShieldAlert size={20} className={report.tem_pendencias ? 'text-amber-500' : 'text-slate-600'} /><h4 className="text-[11px] font-black text-white uppercase tracking-widest uppercase">Pendências</h4></div>
                          <p className="text-[12px] font-bold text-slate-300 leading-relaxed italic line-clamp-3">{String(report.descricao_pendencias || 'Sem pendências registradas.')}</p>
                       </div>
                       <div className={`flex-1 p-6 border transition-all ${report.tem_ocorrencias ? 'bg-rose-950/10 border-rose-500/30' : 'bg-slate-950/50 border-white/5 opacity-40'}`}>
                          <div className="flex items-center gap-4 mb-4"><AlertCircle size={20} className={report.tem_ocorrencias ? 'text-rose-500' : 'text-slate-600'} /><h4 className="text-[11px] font-black text-white uppercase tracking-widest uppercase">Ocorrências</h4></div>
                          <p className="text-[12px] font-bold text-slate-300 leading-relaxed italic line-clamp-3">{String(report.descricao_ocorrencias || 'Shift finalizado sem ocorrências.')}</p>
                       </div>
                    </div>
                    <div className="bg-slate-900/40 border border-white/5 p-8 shadow-xl flex flex-col justify-center gap-3">
                       <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2 italic uppercase">Quadro de Pessoal</h4>
                       <div className="space-y-2">
                          {[
                            { label: 'Faltas', val: report.teve_falta, Icon: UserMinus, color: 'rose' },
                            { label: 'Atestados', val: report.teve_atestado, Icon: FileText, color: 'amber' },
                            { label: 'Compensação', val: report.teve_compensacao, Icon: UserPlus, color: 'emerald' },
                            { label: 'Saída Antecipada', val: report.teve_saida_antecipada, Icon: Clock8, color: 'blue' }
                          ].map((item, i) => (
                            <div key={i} className={`flex items-center justify-between p-2.5 border transition-all ${item.val ? `bg-${item.color}-500/10 border-${item.color}-500/40 text-${item.color}-400` : 'bg-slate-950/50 border-white/5 text-slate-700'}`}>
                               <div className="flex items-center gap-3">
                                  {React.createElement(item.Icon, { size: 12 })}
                                  <span className="text-[8px] font-black uppercase tracking-tighter">{item.label}</span>
                               </div>
                               <span className="text-[9px] font-black italic">{item.val ? 'SIM' : 'NÃO'}</span>
                            </div>
                          ))}
                       </div>
                    </div>
                 </div>
               </>
             ) : (
               <div className="flex-1 flex flex-col items-center justify-center opacity-10 border border-dashed border-white/10 h-full py-16">
                  <FileText size={80} className="mb-6 stroke-[1px]" /><h2 className="text-5xl font-black uppercase italic tracking-tighter">SISTEMA VAZIO</h2>
               </div>
             )}
          </div>
        ) : activeTab === 'analytics' ? (
          <div className="flex-1 flex flex-col gap-6 animate-in slide-in-from-right-10 duration-700 overflow-y-auto custom-scrollbar pr-2 pb-10">
             <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <div className="bg-slate-900/40 border border-white/5 p-8 shadow-xl hover:border-blue-500/30 transition-all flex flex-col justify-between">
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Volume de Voos</p>
                   <p className="text-5xl font-black italic text-white tracking-tighter leading-none">{Number(analyticsData.monthlyFlights)}</p>
                   <p className="text-[8px] font-bold text-slate-600 uppercase mt-4">Atendimentos válidos no período</p>
                </div>
                <div className="bg-slate-900/40 border border-white/5 p-8 shadow-xl hover:border-emerald-500/30 transition-all flex flex-col justify-between">
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 uppercase">media de tempo de voo</p>
                   <p className="text-5xl font-black italic text-white tracking-tighter leading-none">
                     {Math.floor(analyticsData.avgTurnaround / 60)}h {analyticsData.avgTurnaround % 60}m
                   </p>
                   <p className="text-[8px] font-bold text-slate-600 uppercase mt-4">Calculado (min / 60)</p>
                </div>
                <div className="bg-slate-900/40 border border-white/5 p-8 shadow-xl hover:border-emerald-500/30 transition-all flex flex-col justify-between">
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Operantes</p>
                   <p className="text-5xl font-black italic text-white tracking-tighter leading-none">{Number(fleetSummary.operational)}</p>
                   <p className="text-[8px] font-bold text-slate-600 uppercase mt-4">Frota Ativa</p>
                </div>
                <div className="bg-slate-900/40 border border-white/5 p-8 shadow-xl hover:border-rose-500/30 transition-all flex flex-col justify-between">
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Indisponíveis</p>
                   <p className="text-5xl font-black italic text-white tracking-tighter leading-none">{Number(fleetSummary.maintenance)}</p>
                   <p className="text-[8px] font-bold text-slate-600 uppercase mt-4">Em Manutenção</p>
                </div>
                <div 
                   onClick={() => setShowRentalModal(true)}
                   className="bg-slate-900/40 border border-white/5 p-8 shadow-xl hover:border-blue-400/30 transition-all flex flex-col justify-between group cursor-pointer relative overflow-hidden"
                >
                   <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all transform group-hover:scale-110">
                      <Search size={14} className="text-blue-500" />
                   </div>
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Locações</p>
                   <div className="flex items-baseline gap-2">
                      <p className="text-5xl font-black italic text-white tracking-tighter leading-none">{Number(analyticsData.rentalCount)}</p>
                      <p className="text-xl font-black text-blue-400">({Number(analyticsData.rentalHours)}h)</p>
                   </div>
                   <p className="text-[8px] font-bold text-slate-600 uppercase mt-4">Total horas locadas (Ver Detalhes)</p>
                </div>
             </div>
             
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-slate-900/40 border border-white/5 p-10 h-[500px] shadow-2xl">
                   <div className="flex justify-between items-center mb-10">
                      <div>
                         <h4 className="text-[14px] font-black text-white uppercase tracking-[0.4em] italic uppercase">Historico de voos</h4>
                         <p className="text-[10px] font-bold text-slate-500 uppercase mt-2">Frequência diária de atendimentos</p>
                      </div>
                      <TrendingUp size={24} className="text-blue-500 opacity-30" />
                   </div>
                   <div className="h-[330px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analyticsData.chartData || []}>
                          <CartesianGrid strokeDasharray="10 10" stroke="#ffffff05" vertical={false} />
                          <XAxis dataKey="name" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} dy={15} fontStyle="italic" fontWeight="bold" />
                          <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                          <Tooltip 
                            cursor={{ fill: '#ffffff05' }} 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '0px' }}
                            itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                          />
                          <Bar dataKey="voos" fill="#2563eb" barSize={30} radius={[2, 2, 0, 0]}>
                            <LabelList dataKey="voos" position="insideTop" fill="#fff" style={{ fontSize: '10px', fontWeight: '900', fontStyle: 'italic' }} offset={10} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                   </div>
                </div>

                <div className="bg-slate-900/40 border border-white/5 p-8 shadow-2xl flex flex-col h-[500px]">
                   <div className="flex items-center gap-3 mb-6 shrink-0">
                      <Settings size={20} className="text-blue-500" />
                      <h4 className="text-[12px] font-black text-white uppercase tracking-widest italic uppercase">Frota Atual</h4>
                   </div>
                   <div className="flex-1 flex gap-4 overflow-hidden">
                      <div className="flex-1 flex flex-col border-r border-white/5 pr-4 overflow-hidden">
                         <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2 mb-4 shrink-0">
                            <CheckCircle2 size={12}/> Operantes
                         </p>
                         <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 pb-4">
                           {fleetDetails.filter(e => e.status === 'OPERACIONAL').length > 0 ? (
                             fleetDetails.filter(e => e.status === 'OPERACIONAL').map((e, idx) => (
                               <div key={idx} className="bg-slate-950/40 border-l-2 border-emerald-500/30 p-2.5 flex justify-between items-center group hover:bg-emerald-500/5 transition-all">
                                  <div className="overflow-hidden">
                                     <p className="text-[10px] font-black text-white italic truncate">{String(e.prefixo)}</p>
                                     <p className="text-[7px] font-bold text-slate-500 uppercase truncate leading-tight">{String(e.nome)}</p>
                                  </div>
                                  <div className="w-1 h-1 bg-emerald-500 rounded-full shrink-0 ml-2"></div>
                               </div>
                             ))
                           ) : <p className="text-[8px] font-bold text-slate-700 uppercase italic">Vazio</p>}
                         </div>
                      </div>
                      <div className="flex-1 flex flex-col overflow-hidden">
                         <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-2 mb-4 shrink-0">
                            <Wrench size={12}/> Manutenção
                         </p>
                         <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 pb-4">
                           {fleetDetails.filter(e => e.status === 'MANUTENCAO').length > 0 ? (
                             fleetDetails.filter(e => e.status === 'MANUTENCAO').map((e, idx) => (
                               <div key={idx} className="bg-slate-950/40 border-l-2 border-rose-500/30 p-2.5 flex justify-between items-center group hover:bg-rose-500/5 transition-all">
                                  <div className="overflow-hidden">
                                     <p className="text-[10px] font-black text-white italic truncate">{String(e.prefixo)}</p>
                                     <p className="text-[7px] font-bold text-slate-500 uppercase truncate leading-tight">{String(e.nome)}</p>
                                  </div>
                                  <div className="w-1 h-1 bg-rose-500 animate-pulse rounded-full shrink-0 ml-2"></div>
                               </div>
                             ))
                           ) : <p className="text-[8px] font-bold text-slate-700 uppercase italic">Integridade Total</p>}
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-6 animate-in slide-in-from-right-10 duration-700 overflow-hidden">
             {/* Guia de Histórico */}
             <div className="flex justify-between items-end shrink-0">
                <div>
                   <h4 className="text-[14px] font-black text-white uppercase tracking-[0.4em] italic uppercase">Histórico Geral de Voos</h4>
                   <p className="text-[10px] font-bold text-slate-500 uppercase mt-2">Lista consolidada de todos os atendimentos registrados</p>
                </div>
                <div className="flex items-center bg-slate-900 border border-white/5 rounded-sm px-4 py-2 gap-3 w-80">
                   <Search size={14} className="text-slate-500" />
                   <input 
                      type="text" 
                      placeholder="BUSCAR VOO OU CIA..." 
                      className="bg-transparent border-none text-[10px] font-black text-white focus:ring-0 uppercase w-full placeholder:text-slate-700"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                   />
                </div>
             </div>

             <div className="flex-1 bg-slate-900/40 border border-white/5 overflow-hidden flex flex-col shadow-2xl">
                <div className="grid grid-cols-7 bg-slate-950/80 px-8 py-4 border-b border-white/5 text-[9px] font-black text-slate-500 uppercase tracking-widest shrink-0 italic">
                   <div>Data / Turno</div>
                   <div>Companhia</div>
                   <div>Voo</div>
                   <div>Pouso</div>
                   <div>Reboque</div>
                   <div>Turnaround</div>
                   <div className="text-right">Ações</div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                   {filteredHistory.length > 0 ? filteredHistory.map((v, i) => (
                      <div 
                        key={i} 
                        onClick={() => goToFlightDashboard(v)}
                        className="grid grid-cols-7 px-8 py-5 border-b border-white/5 hover:bg-blue-600/5 transition-all cursor-pointer group items-center"
                      >
                         <div>
                            <p className="text-[10px] font-black text-white italic">{v.parentDate.split('-').reverse().join('/')}</p>
                            <p className="text-[8px] font-bold text-blue-500 uppercase tracking-widest mt-0.5">{String(v.parentShift).toUpperCase()}</p>
                         </div>
                         <div className="text-[11px] font-black text-slate-300 uppercase italic tracking-tighter">{v.companhia}</div>
                         <div className="text-[12px] font-black text-white italic tracking-tighter">{v.numero}</div>
                         <div className="text-[10px] font-bold text-slate-400 font-mono">{v.pouso}</div>
                         <div className="text-[10px] font-bold text-slate-400 font-mono">{v.reboque}</div>
                         <div className="text-[11px] font-black text-blue-400 italic tabular-nums">{calculateTurnaround(v.pouso, v.reboque)}</div>
                         <div className="flex justify-end">
                            <button className="flex items-center gap-2 bg-white/5 px-4 py-2 text-[8px] font-black text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all rounded-sm uppercase tracking-widest italic border border-white/5 group-hover:border-blue-400">
                               Ver Dashboard <ExternalLink size={10} />
                            </button>
                         </div>
                      </div>
                   )) : (
                      <div className="h-full flex flex-col items-center justify-center opacity-10">
                         <Filter size={60} className="mb-4 stroke-[1px]" />
                         <p className="text-[12px] font-black uppercase tracking-[0.5em]">Nenhum registro encontrado</p>
                      </div>
                   )}
                </div>
             </div>
          </div>
        )}
      </main>

      <footer className="bg-slate-900 border-t border-white/5 px-8 py-3 flex justify-between items-center shrink-0">
         <div className="flex gap-10">
            <div className="flex items-center gap-2.5"><div className="w-2 h-2 bg-emerald-500 rounded-full"></div><span className="text-[9px] font-black uppercase tracking-widest text-slate-500 italic">Sincronizado</span></div>
            <div className="flex items-center gap-2.5"><div className="w-2 h-2 bg-blue-500 rounded-full"></div><span className="text-[9px] font-black uppercase tracking-widest text-slate-500 italic">GSE Cloud Active</span></div>
         </div>
         <div className="flex items-center gap-5 text-[9px] font-black uppercase tracking-tighter italic text-slate-700">
            <span>RAMP CONTROLL STABLE v5.5</span><Zap size={12} className="fill-slate-800" /><span>CONEXÃO SEGURA</span>
         </div>
      </footer>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(59, 130, 246, 0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59, 130, 246, 0.3); }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .line-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>
    </div>
  );
};

export default App;
