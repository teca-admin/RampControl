
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Plane, Wrench, Clock, AlertCircle, CheckCircle2, Calendar, 
  Timer, ChevronLeft, ChevronRight, Zap, HardHat, ArrowRight, 
  Activity, ShieldAlert, UserMinus, FileText, Clock8, 
  LayoutDashboard, TrendingUp, RefreshCcw, 
  Handshake, UserPlus, Settings, Search, ExternalLink, 
  PlusSquare, Plus, Trash2, Save, Share2,
  BarChart as BarChartIcon, Truck
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
  const [bootstrapped, setBootstrapped] = useState(false);
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

  const fetchData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      console.group('🔍 RAMP CONTROLL - DATA FETCH');
      
      const dashShiftFilter = selectedShift === 'manha' ? "turno.in.(manha,manhã)" : `turno.eq.${selectedShift}`;
      
      // 1. Dashboard Query
      const { data: dashboardData, error: dashError } = await supabase
        .from('relatorios_entrega_turno')
        .select(`
          *,
          voos (*)
        `)
        .eq('data', selectedDate)
        .or(dashShiftFilter)
        .order('criado_em', { ascending: false })
        .limit(1);

      if (dashError) console.error('Erro Dashboard:', dashError);
      if (dashboardData?.[0]) {
        setReport(dashboardData[0]);
      } else {
        setReport(null);
      }

      // 2. Fleet Stats
      const { data: equips } = await supabase.from('equipamentos').select('*').order('prefixo', { ascending: true });
      if (equips) {
        setFleetDetails(equips);
        const stats: Record<string, number> = { OPERACIONAL: 0, MANUTENCAO: 0, ALUGADO: 0 };
        equips.forEach(e => { stats[e.status] = (stats[e.status] || 0) + 1; });
        setFleetStats(Object.entries(stats).map(([status, total]) => ({ status: status as any, total })));
      }

      // 3. Leaders
      const { data: leadersData } = await supabase.from('lideres').select('*').order('nome', { ascending: true });
      if (leadersData) setLeaders(leadersData);

      // 4. Analytics
      let query = supabase.from('relatorios_entrega_turno').select('*, voos(*)').gte('data', startDate).lte('data', endDate);
      if (analyticsShift !== 'todos') {
        const aFilter = analyticsShift === 'manha' ? "in.(manha,manhã)" : `eq.${analyticsShift}`;
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
          .sort((a, b) => a.rawDate.localeCompare(b.rawDate))
          .slice(-15);

        setAnalyticsData({ 
          monthlyFlights: fCount, 
          avgTurnaround: fWithT > 0 ? Math.round(tMins / fWithT) : 0,
          rentalCount: rCount,
          rentalHours: Math.round(rMins / 60),
          chartData
        });
        setAllFlights(fList);
      }
      console.groupEnd();
    } catch (err) {
      console.error('Erro fatal:', err);
    } finally {
      if (!isSilent) setLoading(false);
      setBootstrapped(true);
      const loader = document.getElementById('fallback-loader');
      if (loader) loader.style.display = 'none';
    }
  }, [selectedDate, selectedShift, startDate, endDate, analyticsShift]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fleetSummary = useMemo(() => {
    const op = fleetStats.find(s => s.status === 'OPERACIONAL')?.total || 0;
    const mt = fleetStats.find(s => s.status === 'MANUTENCAO')?.total || 0;
    const al = fleetStats.find(s => s.status === 'ALUGADO')?.total || 0;
    return { op, mt, al, total: op + mt + al };
  }, [fleetStats]);

  const filteredHistory = useMemo(() => {
    if (!searchQuery) return allFlights;
    const q = searchQuery.toLowerCase();
    return allFlights.filter(f => 
      String(f.numero || '').toLowerCase().includes(q) || 
      String(f.companhia || '').toLowerCase().includes(q) ||
      String(f.parentLider || '').toLowerCase().includes(q)
    );
  }, [allFlights, searchQuery]);

  const handleAddFlight = () => setFormFlights([...formFlights, { companhia: '', numero: '', pouso: '', reboque: '' }]);
  const handleRemoveFlight = (index: number) => setFormFlights(formFlights.filter((_, i) => i !== index));
  const handleFlightChange = (index: number, field: keyof Flight, value: string) => {
    const updated = [...formFlights];
    updated[index] = { ...updated[index], [field]: value };
    setFormFlights(updated);
  };

  const handleSaveReport = async () => {
    if (!formLeader) { alert("Por favor, selecione o Líder."); return; }
    setIsSubmitting(true);
    try {
      // 1. Salvar Relatório
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

      // 2. Salvar Voos
      const voosToInsert = formFlights
        .filter(v => v.companhia && v.numero)
        .map(v => ({ ...v, relatorio_id: newReport.id }));

      if (voosToInsert.length > 0) {
        const { error: voosErr } = await supabase.from('voos').insert(voosToInsert);
        if (voosErr) throw voosErr;
      }

      // 3. Automação de Frota (Update Manual no Frontend para Garantir)
      if (formGseOut.ativo && formGseOut.prefixo) {
        await supabase.from('equipamentos').update({ status: 'MANUTENCAO' }).eq('prefixo', formGseOut.prefixo);
      }
      if (formGseIn.ativo && formGseIn.prefixo) {
        await supabase.from('equipamentos').update({ status: 'OPERACIONAL' }).eq('prefixo', formGseIn.prefixo);
      }

      alert("Relatório e Automações de Frota concluídos!");
      setSelectedDate(formDate);
      setSelectedShift(formShift);
      setActiveTab('dashboard');
      fetchData();
    } catch (err: any) { alert(`Erro ao salvar: ${err.message}`); }
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

2 - Relatar todas as pendências importantes que ficaram para o turno seguinte:
${formPendencias || "Não"}

3 - Relatar todas ocorrências importantes:
${formOcorrencias || "Não"}

4 - Aluguel: ${formAluguel.ativo ? 'Sim' : 'Não'}
${formAluguel.ativo ? `Equipamento: ${formAluguel.nome}\nInício: ${formAluguel.inicio}\nFim: ${formAluguel.fim}` : ''}

5 - Voos atendidos:
${formFlights.filter(v => v.companhia).map(v => `${v.companhia} ${v.numero}\nInício: ${v.pouso}\nTérmino: ${v.reboque}\n`).join('\n')}

6 - Algum equipamento enviado para o GSE?
${formGseOut.ativo ? `Sim\nNome: ${formGseOut.prefixo}\nMotivo: ${formGseOut.motivo}` : 'Não'}

7 - Algum equipamento retornou do GSE?
${formGseIn.ativo ? `Nome: ${formGseIn.prefixo}` : 'Não'}`;

    navigator.clipboard.writeText(msg);
    alert("Mensagem estruturada nos 7 itens copiada!");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="sticky top-0 z-[60] bg-slate-900/95 backdrop-blur-2xl border-b border-white/5 px-6 py-4 flex flex-col lg:flex-row justify-between items-center gap-6 shadow-2xl">
        <div className="flex items-center justify-between w-full lg:w-auto gap-8">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="bg-blue-600 p-2 rounded-sm shadow-blue-500/20"><Zap size={20} className="text-white fill-white" /></div>
            <h1 className="text-xl font-black tracking-tighter uppercase italic leading-none">Ramp<span className="text-blue-500">Controll</span></h1>
          </div>
          <nav className="flex bg-slate-800/40 p-1 rounded-sm border border-white/5">
            {[
              { id: 'dashboard', label: 'Início', icon: LayoutDashboard },
              { id: 'analytics', label: 'Dados', icon: BarChartIcon },
              { id: 'history', label: 'Histórico', icon: Clock8 },
              { id: 'new_report', label: 'Lançar', icon: PlusSquare },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-white text-slate-950 shadow-xl' : 'text-slate-500 hover:text-white'}`}>
                <tab.icon size={14} /> <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {activeTab === 'dashboard' && (
            <div className="flex bg-slate-900/90 border border-white/10 rounded-sm overflow-hidden text-[10px] font-black uppercase italic">
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="bg-transparent border-none focus:ring-0 text-white p-2 w-32" />
              <select value={selectedShift} onChange={e => setSelectedShift(e.target.value as any)} className="bg-slate-800 border-none focus:ring-0 text-blue-400 p-2 pr-6">
                <option value="manha">Manhã</option>
                <option value="tarde">Tarde</option>
                <option value="noite">Noite</option>
              </select>
            </div>
          )}
          <button onClick={() => fetchData()} className="p-2 bg-blue-600 hover:bg-blue-500 rounded-sm transition-all"><RefreshCcw size={16} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-[1800px] mx-auto w-full">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-40 opacity-50"><RefreshCcw size={48} className="animate-spin text-blue-500 mb-6" /><p className="text-[10px] font-black uppercase tracking-[0.4em] italic">Sincronizando com Supabase...</p></div>
        ) : activeTab === 'dashboard' ? (
          <div className="animate-in fade-in duration-500 space-y-8">
            {report ? (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-3 bg-slate-900/40 border border-white/5 p-8 shadow-2xl rounded-sm">
                   <div className="flex justify-between items-center mb-10 border-b border-white/5 pb-6">
                      <div>
                        <h2 className="text-4xl font-black italic uppercase tracking-tighter leading-none">REGISTRO <span className="text-blue-600">OPERACIONAL</span></h2>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-2">{selectedDate} • TURNO {selectedShift.toUpperCase()}</p>
                      </div>
                      <div className="bg-slate-800/80 px-6 py-3 border border-white/10 rounded-sm">
                        <p className="text-[8px] font-black text-slate-600 uppercase mb-1">Responsável</p>
                        <p className="text-sm font-black italic uppercase text-blue-100">{report.lider}</p>
                      </div>
                   </div>
                   <div className="grid grid-cols-1 gap-6 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
                      {report.voos?.length ? report.voos.map((voo, idx) => (
                        <div key={idx} className="bg-slate-950/80 border border-white/5 p-6 flex justify-between items-center hover:border-blue-500/30 transition-all group">
                          <div className="flex items-center gap-6">
                            <div className="bg-blue-600/10 p-4 group-hover:bg-blue-600/20"><Plane size={24} className="text-blue-500"/></div>
                            <div>
                              <p className="text-2xl font-black italic text-white tracking-tighter uppercase">{voo.companhia} <span className="text-blue-500">{voo.numero}</span></p>
                              <p className="text-[10px] font-bold text-slate-500 uppercase flex gap-4 mt-1"><span className="text-blue-600/70">Início: {voo.pouso}</span> <span className="text-emerald-600/70">Término: {voo.reboque}</span></p>
                            </div>
                          </div>
                          <div className="text-right"><p className="text-[9px] font-black text-slate-500 uppercase italic mb-1">Turnaround</p><p className="text-3xl font-black text-white italic tracking-tighter tabular-nums group-hover:text-blue-400">{calculateTurnaround(voo.pouso, voo.reboque)}</p></div>
                        </div>
                      )) : <div className="py-20 text-center opacity-20"><Plane size={64} className="mx-auto mb-4" /><p className="font-black uppercase italic tracking-widest text-[10px]">Nenhum voo registrado neste relatório</p></div>}
                   </div>
                </div>

                <div className="space-y-6">
                   <div className="bg-slate-900/40 border border-white/5 p-6 shadow-2xl">
                      <h4 className="text-[10px] font-black uppercase text-blue-500 mb-6 flex items-center justify-between italic tracking-widest">Efetivo Turno <Activity size={14}/></h4>
                      <div className="grid grid-cols-2 gap-3">
                         {[{l: 'Falta', v: report.teve_falta}, {l: 'Atest.', v: report.teve_atestado}, {l: 'Comp.', v: report.teve_compensacao}, {l: 'Saída', v: report.teve_saida_antecipada}].map(i => (
                           <div key={i.l} className={`p-4 border flex flex-col items-center justify-center gap-1 ${i.v ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 'bg-slate-950 border-white/5 opacity-40'}`}>
                             <span className="text-[8px] font-black uppercase">{i.l}</span>
                             <span className="text-[10px] font-black">{i.v ? 'SIM' : 'NÃO'}</span>
                           </div>
                         ))}
                      </div>
                   </div>

                   <div className="bg-slate-900/40 border border-white/5 p-6 shadow-2xl">
                      <h4 className="text-[10px] font-black uppercase text-amber-500 mb-4 flex items-center justify-between italic tracking-widest">Pendências / Ocorrências</h4>
                      <div className="space-y-4">
                        <div className="bg-slate-950 p-4 border-l-2 border-amber-500"><p className="text-[8px] font-black text-amber-500 uppercase mb-2">Próximo Turno</p><p className="text-[10px] font-bold text-slate-400 uppercase italic leading-relaxed">{report.descricao_pendencias || "Não há pendências"}</p></div>
                        <div className="bg-slate-950 p-4 border-l-2 border-rose-500"><p className="text-[8px] font-black text-rose-500 uppercase mb-2">Relato de Ocorrência</p><p className="text-[10px] font-bold text-slate-400 uppercase italic leading-relaxed">{report.descricao_ocorrencias || "Não há ocorrências"}</p></div>
                      </div>
                   </div>

                   <div className="bg-slate-900/40 border border-white/5 p-6 shadow-2xl">
                      <h4 className="text-[10px] font-black uppercase text-emerald-500 mb-4 flex items-center justify-between italic tracking-widest">Movimentação GSE</h4>
                      <div className="space-y-3">
                        <div className={`p-4 border flex justify-between items-center ${report.tem_equipamento_enviado ? 'bg-rose-950/20 border-rose-500/30' : 'bg-slate-950 border-white/5 opacity-30'}`}>
                          <span className="text-[8px] font-black uppercase">Enviado GSE</span>
                          <span className="text-[10px] font-black italic">{report.equipamento_enviado_nome || "NENHUM"}</span>
                        </div>
                        <div className={`p-4 border flex justify-between items-center ${report.tem_equipamento_retornado ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-slate-950 border-white/5 opacity-30'}`}>
                          <span className="text-[8px] font-black uppercase">Retorno GSE</span>
                          <span className="text-[10px] font-black italic">{report.equipamento_retornado_nome || "NENHUM"}</span>
                        </div>
                      </div>
                   </div>
                </div>
              </div>
            ) : (
              <div className="py-40 flex flex-col items-center justify-center opacity-10 border-2 border-dashed border-white/5 rounded-sm">
                <FileText size={120} className="mb-8" />
                <h2 className="text-4xl font-black italic uppercase tracking-tighter">SEM DADOS PARA ESTE TURNO</h2>
                <p className="mt-4 text-[10px] font-black uppercase tracking-[0.5em] italic">Verifique se o filtro de data e turno está correto</p>
                <button onClick={() => setActiveTab('new_report')} className="mt-10 bg-blue-600 px-8 py-4 text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 transition-all opacity-100">Lançar Agora</button>
              </div>
            )}
          </div>
        ) : activeTab === 'new_report' ? (
          /* ABA LANÇAR RELATÓRIO - 7 ITENS */
          <div className="animate-in slide-in-from-bottom-5 duration-500 space-y-10">
             <div className="bg-slate-900/40 border border-white/5 p-8 shadow-2xl flex flex-wrap gap-8 items-end">
                <div className="space-y-3">
                   <label className="text-[9px] font-black text-blue-500 uppercase tracking-widest italic">Data</label>
                   <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="bg-slate-950 border border-white/10 p-4 font-black text-white w-full rounded-sm" />
                </div>
                <div className="space-y-3">
                   <label className="text-[9px] font-black text-blue-500 uppercase tracking-widest italic">Turno</label>
                   <div className="flex bg-slate-950 p-1 border border-white/10 rounded-sm">
                      {(['manha', 'tarde', 'noite'] as const).map(t => (
                        <button key={t} onClick={() => setFormShift(t)} className={`px-6 py-3 text-[10px] font-black uppercase italic ${formShift === t ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>{t}</button>
                      ))}
                   </div>
                </div>
                <div className="flex-1 space-y-3">
                   <label className="text-[9px] font-black text-blue-500 uppercase tracking-widest italic">Líder do Plantão</label>
                   <select value={formLeader} onChange={e => setFormLeader(e.target.value)} className="bg-slate-950 border border-white/10 p-4 font-black text-white w-full uppercase appearance-none cursor-pointer italic">
                      <option value="">-- SELECIONE O RESPONSÁVEL --</option>
                      {leaders.map(l => <option key={l.id} value={l.nome}>{l.nome}</option>)}
                   </select>
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="space-y-10">
                   {/* 1 - RH */}
                   <div className="bg-slate-900/40 border border-white/5 p-6 shadow-2xl">
                      <h4 className="text-[11px] font-black italic uppercase tracking-widest mb-6 flex items-center gap-3"><UserPlus size={16} className="text-blue-500"/> 1 - Controle de RH</h4>
                      <div className="grid grid-cols-2 gap-4">
                        {[{k: 'falta', l: 'Falta'}, {k: 'atestado', l: 'Atestado'}, {k: 'compensacao', l: 'Compens.'}, {k: 'saida_antecipada', l: 'Saída Ant.'}].map(i => (
                          <button key={i.k} onClick={() => setFormHR({...formHR, [i.k]: !formHR[i.k as keyof typeof formHR]})} className={`p-4 border transition-all text-center ${formHR[i.k as keyof typeof formHR] ? 'bg-rose-500/20 border-rose-500/50 text-rose-400' : 'bg-slate-950 border-white/5 opacity-50'}`}>
                            <span className="text-[9px] font-black uppercase italic block mb-1">{i.l}</span>
                            <span className="text-[10px] font-black">{formHR[i.k as keyof typeof formHR] ? 'SIM' : 'NÃO'}</span>
                          </button>
                        ))}
                      </div>
                   </div>

                   {/* 2 & 3 - Pendencias e Ocorrências */}
                   <div className="bg-slate-900/40 border border-white/5 p-6 shadow-2xl space-y-8">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-amber-500 uppercase italic flex justify-between">2 - Pendências importantes <AlertCircle size={14}/></label>
                        <textarea value={formPendencias} onChange={e => setFormPendencias(e.target.value)} rows={4} className="bg-slate-950 border border-white/10 p-4 font-bold text-xs rounded-sm text-slate-300 w-full italic" placeholder="O que fica para o próximo turno?"></textarea>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-rose-500 uppercase italic flex justify-between">3 - Ocorrências importantes <ShieldAlert size={14}/></label>
                        <textarea value={formOcorrencias} onChange={e => setFormOcorrencias(e.target.value)} rows={4} className="bg-slate-950 border border-white/10 p-4 font-bold text-xs rounded-sm text-slate-300 w-full italic" placeholder="Relatar avarias ou problemas"></textarea>
                      </div>
                   </div>
                </div>

                <div className="lg:col-span-2 space-y-10">
                   {/* 5 - Voos */}
                   <div className="bg-slate-900/40 border border-white/5 p-8 shadow-2xl">
                      <div className="flex justify-between items-center mb-8">
                        <h4 className="text-[14px] font-black italic uppercase tracking-widest flex items-center gap-4"><Plane size={24} className="text-blue-500"/> 5 - Voos Atendidos</h4>
                        <button onClick={handleAddFlight} className="bg-blue-600 px-6 py-3 text-[10px] font-black uppercase italic hover:bg-blue-500 transition-all">+ Inserir Voo</button>
                      </div>
                      <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {formFlights.map((v, i) => (
                          <div key={i} className="bg-slate-950 border border-white/5 p-6 rounded-sm grid grid-cols-2 md:grid-cols-4 gap-6 relative group">
                            <button onClick={() => handleRemoveFlight(i)} className="absolute -top-3 -right-3 bg-rose-600 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14}/></button>
                            <div className="space-y-2"><label className="text-[8px] font-black text-slate-600 uppercase">Companhia</label><input type="text" placeholder="GOL" value={v.companhia} onChange={e => handleFlightChange(i, 'companhia', e.target.value)} className="bg-slate-900 border border-white/10 p-3 font-black text-xs w-full uppercase italic" /></div>
                            <div className="space-y-2"><label className="text-[8px] font-black text-slate-600 uppercase">Nº Voo</label><input type="text" placeholder="1234" value={v.numero} onChange={e => handleFlightChange(i, 'numero', e.target.value)} className="bg-slate-900 border border-white/10 p-3 font-black text-xs w-full uppercase italic" /></div>
                            <div className="space-y-2"><label className="text-[8px] font-black text-slate-600 uppercase italic">Início</label><input type="time" value={v.pouso} onChange={e => handleFlightChange(i, 'pouso', e.target.value)} className="bg-slate-900 border border-white/10 p-3 font-black text-xs w-full text-blue-400" /></div>
                            <div className="space-y-2"><label className="text-[8px] font-black text-slate-600 uppercase italic">Término</label><input type="time" value={v.reboque} onChange={e => handleFlightChange(i, 'reboque', e.target.value)} className="bg-slate-900 border border-white/10 p-3 font-black text-xs w-full text-emerald-400" /></div>
                          </div>
                        ))}
                      </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      {/* 6 - Enviado p/ GSE */}
                      <div className="bg-slate-900/40 border border-white/5 p-6 shadow-2xl">
                         <div className="flex justify-between items-center mb-6">
                            <h4 className="text-[11px] font-black italic uppercase tracking-widest text-rose-500">6 - Enviado GSE</h4>
                            <button onClick={() => setFormGseOut({...formGseOut, ativo: !formGseOut.ativo})} className={`px-4 py-2 text-[9px] font-black border ${formGseOut.ativo ? 'bg-rose-600 border-rose-400' : 'bg-slate-950 border-white/5 opacity-40'}`}>{formGseOut.ativo ? 'SIM' : 'NÃO'}</button>
                         </div>
                         {formGseOut.ativo && (
                           <div className="space-y-4 animate-in fade-in duration-300">
                              <select value={formGseOut.prefixo} onChange={e => setFormGseOut({...formGseOut, prefixo: e.target.value})} className="bg-slate-950 border border-white/10 p-4 font-black text-xs w-full italic">
                                <option value="">QUAL EQUIPAMENTO SAIU?</option>
                                {fleetDetails.filter(f => f.status === 'OPERACIONAL').map(f => <option key={f.prefixo} value={f.prefixo}>{f.prefixo} - {f.nome}</option>)}
                              </select>
                              <textarea value={formGseOut.motivo} onChange={e => setFormGseOut({...formGseOut, motivo: e.target.value})} rows={2} className="bg-slate-950 border border-white/10 p-4 font-bold text-[10px] w-full italic" placeholder="Motivo do envio..."></textarea>
                              <p className="text-[8px] font-black text-rose-500/50 uppercase italic tracking-widest">* O status da frota mudará para MANUTENÇÃO automaticamente ao salvar.</p>
                           </div>
                         )}
                      </div>

                      {/* 7 - Retornou GSE */}
                      <div className="bg-slate-900/40 border border-white/5 p-6 shadow-2xl">
                         <div className="flex justify-between items-center mb-6">
                            <h4 className="text-[11px] font-black italic uppercase tracking-widest text-emerald-500">7 - Retorno GSE</h4>
                            <button onClick={() => setFormGseIn({...formGseIn, ativo: !formGseIn.ativo})} className={`px-4 py-2 text-[9px] font-black border ${formGseIn.ativo ? 'bg-emerald-600 border-emerald-400' : 'bg-slate-950 border-white/5 opacity-40'}`}>{formGseIn.ativo ? 'SIM' : 'NÃO'}</button>
                         </div>
                         {formGseIn.ativo && (
                           <div className="space-y-4 animate-in fade-in duration-300">
                              <select value={formGseIn.prefixo} onChange={e => setFormGseIn({...formGseIn, prefixo: e.target.value})} className="bg-slate-950 border border-white/10 p-4 font-black text-xs w-full italic">
                                <option value="">QUAL EQUIPAMENTO VOLTOU?</option>
                                {fleetDetails.filter(f => f.status === 'MANUTENCAO').map(f => <option key={f.prefixo} value={f.prefixo}>{f.prefixo} - {f.nome}</option>)}
                              </select>
                              <p className="text-[8px] font-black text-emerald-500/50 uppercase italic tracking-widest">* O status da frota mudará para OPERACIONAL automaticamente ao salvar.</p>
                           </div>
                         )}
                      </div>
                   </div>

                   {/* 4 - Aluguel */}
                   <div className="bg-slate-900/40 border border-white/5 p-6 shadow-2xl">
                      <div className="flex justify-between items-center mb-6">
                         <h4 className="text-[11px] font-black italic uppercase tracking-widest text-blue-500 flex items-center gap-3"><Handshake size={16}/> 4 - Aluguel de Ativos</h4>
                         <button onClick={() => setFormAluguel({...formAluguel, ativo: !formAluguel.ativo})} className={`px-4 py-2 text-[9px] font-black border ${formAluguel.ativo ? 'bg-blue-600 border-blue-400' : 'bg-slate-950 border-white/5 opacity-40'}`}>{formAluguel.ativo ? 'SIM' : 'NÃO'}</button>
                      </div>
                      {formAluguel.ativo && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-300">
                          <input type="text" placeholder="MODELO" value={formAluguel.nome} onChange={e => setFormAluguel({...formAluguel, nome: e.target.value})} className="bg-slate-950 border border-white/10 p-4 font-black text-xs uppercase italic" />
                          <div className="flex items-center gap-3"><span className="text-[8px] font-black text-slate-700">INÍCIO</span><input type="time" value={formAluguel.inicio} onChange={e => setFormAluguel({...formAluguel, inicio: e.target.value})} className="bg-slate-950 border border-white/10 p-4 font-black text-xs text-blue-400 flex-1" /></div>
                          <div className="flex items-center gap-3"><span className="text-[8px] font-black text-slate-700">FIM</span><input type="time" value={formAluguel.fim} onChange={e => setFormAluguel({...formAluguel, fim: e.target.value})} className="bg-slate-950 border border-white/10 p-4 font-black text-xs text-blue-400 flex-1" /></div>
                        </div>
                      )}
                   </div>
                </div>
             </div>

             <div className="bg-slate-900 border-t border-white/10 p-8 flex flex-col md:flex-row justify-between items-center gap-8 shadow-3xl">
                <button onClick={generateWhatsAppMessage} className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 px-10 py-5 text-[12px] font-black text-white rounded-sm uppercase italic flex items-center justify-center gap-4 transition-all active:scale-95 group shadow-2xl"><Share2 size={24} className="group-hover:rotate-12 transition-transform"/> Estruturar Mensagem WhatsApp</button>
                <div className="flex w-full md:w-auto gap-6">
                  <button onClick={() => setActiveTab('dashboard')} className="flex-1 md:flex-none text-[12px] font-black text-slate-600 uppercase hover:text-white transition-colors tracking-widest italic">Descartar</button>
                  <button disabled={isSubmitting} onClick={handleSaveReport} className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-500 px-16 py-5 text-[12px] font-black text-white rounded-sm uppercase italic flex items-center justify-center gap-4 shadow-3xl shadow-blue-500/30 disabled:opacity-50 active:scale-95">
                    {isSubmitting ? <RefreshCcw className="animate-spin" /> : <><Save size={24}/> Finalizar e Atualizar Frota</>}
                  </button>
                </div>
             </div>
          </div>
        ) : activeTab === 'analytics' ? (
          <div className="animate-in slide-in-from-right-5 duration-500 space-y-10">
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
                <div className="bg-slate-900/40 border border-white/5 p-8 shadow-2xl border-l-4 border-l-blue-600 group hover:bg-blue-600/5 transition-all">
                  <p className="text-[9px] font-black text-slate-500 uppercase italic tracking-widest mb-4">Atendimentos</p>
                  <div className="flex items-baseline gap-2"><span className="text-5xl font-black italic text-white tracking-tighter tabular-nums">{analyticsData.monthlyFlights}</span><span className="text-blue-500 font-bold uppercase text-[9px]">Voos</span></div>
                </div>
                <div className="bg-slate-900/40 border border-white/5 p-8 shadow-2xl border-l-4 border-l-emerald-600 group hover:bg-emerald-600/5 transition-all">
                  <p className="text-[9px] font-black text-slate-500 uppercase italic tracking-widest mb-4">Avg Turnaround</p>
                  <div className="flex items-baseline gap-2"><span className="text-5xl font-black italic text-white tracking-tighter tabular-nums">{analyticsData.avgTurnaround}</span><span className="text-emerald-500 font-bold uppercase text-[9px]">Mins</span></div>
                </div>
                <div className="bg-slate-900/40 border border-white/5 p-8 shadow-2xl border-l-4 border-l-slate-700">
                  <p className="text-[9px] font-black text-slate-500 uppercase italic tracking-widest mb-4">Frota Total</p>
                  <div className="flex items-baseline gap-2"><span className="text-5xl font-black italic text-white tracking-tighter tabular-nums">{fleetSummary.total}</span><span className="text-slate-500 font-bold uppercase text-[9px]">Unid</span></div>
                </div>
                <div className="bg-slate-900/40 border border-white/5 p-8 shadow-2xl border-l-4 border-l-emerald-500 bg-emerald-500/5">
                  <p className="text-[9px] font-black text-emerald-500 uppercase italic tracking-widest mb-4">Operantes</p>
                  <div className="flex items-baseline gap-2"><span className="text-5xl font-black italic text-emerald-400 tracking-tighter tabular-nums">{fleetSummary.op}</span><span className="text-emerald-600 font-bold uppercase text-[9px]">Ready</span></div>
                </div>
                <div className="bg-slate-900/40 border border-white/5 p-8 shadow-2xl border-l-4 border-l-rose-600 bg-rose-500/5">
                  <p className="text-[9px] font-black text-rose-500 uppercase italic tracking-widest mb-4">Manutenção</p>
                  <div className="flex items-baseline gap-2"><span className="text-5xl font-black italic text-rose-400 tracking-tighter tabular-nums">{fleetSummary.mt}</span><span className="text-rose-600 font-bold uppercase text-[9px]">GSE</span></div>
                </div>
                <div className="bg-slate-900/40 border border-white/5 p-8 shadow-2xl border-l-4 border-l-blue-600 bg-blue-500/5">
                  <p className="text-[9px] font-black text-blue-500 uppercase italic tracking-widest mb-4">Locações</p>
                  <div className="flex items-baseline gap-2"><span className="text-5xl font-black italic text-blue-400 tracking-tighter tabular-nums">{analyticsData.rentalCount}</span><span className="text-blue-600 font-bold uppercase text-[9px]">Loc</span></div>
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 bg-slate-900/40 border border-white/5 p-10 h-[500px]">
                  <div className="flex justify-between items-center mb-10"><h3 className="text-xl font-black italic uppercase tracking-widest">Fluxo Mensal</h3><TrendingUp className="text-blue-500/20" size={32}/></div>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analyticsData.chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff03" vertical={false} />
                      <XAxis dataKey="name" stroke="#475569" fontSize={10} fontStyle="italic" />
                      <YAxis stroke="#475569" fontSize={10} />
                      <Tooltip cursor={{fill: '#ffffff03'}} contentStyle={{backgroundColor: '#0f172a', border: '1px solid #1e293b', fontSize: '12px'}} />
                      <Bar dataKey="voos" fill="#2563eb" radius={[2, 2, 0, 0]} barSize={40}><LabelList dataKey="voos" position="top" fill="#64748b" style={{fontSize: '10px', fontWeight: '900'}} /></Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-slate-900/40 border border-white/5 p-10 h-[500px] flex flex-col">
                   <h3 className="text-xl font-black italic uppercase tracking-widest mb-10 text-rose-500 flex items-center gap-3"><Wrench size={20}/> Frota em GSE</h3>
                   <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
                      {fleetDetails.filter(e => e.status === 'MANUTENCAO').length > 0 ? fleetDetails.filter(e => e.status === 'MANUTENCAO').map((e, idx) => (
                        <div key={idx} className="bg-slate-950 border border-rose-500/20 p-5 flex justify-between items-center group hover:bg-rose-900/10 transition-all">
                           <div>
                             <p className="text-xl font-black italic text-white tracking-tighter uppercase">{e.prefixo}</p>
                             <p className="text-[9px] font-bold text-slate-500 uppercase italic tracking-widest">{e.nome}</p>
                           </div>
                           <ShieldAlert className="text-rose-500/20 group-hover:text-rose-500 transition-colors" size={24}/>
                        </div>
                      )) : <div className="h-full flex flex-col items-center justify-center opacity-10"><CheckCircle2 size={80} /><p className="text-[10px] font-black uppercase mt-4 italic">Sem máquinas em GSE</p></div>}
                   </div>
                </div>
             </div>
          </div>
        ) : (
          /* ABA HISTÓRICO */
          <div className="animate-in slide-in-from-right-5 duration-500 space-y-8">
             <div className="flex flex-col md:flex-row justify-between items-end gap-10">
                <div>
                  <h2 className="text-5xl font-black italic uppercase tracking-tighter">Histórico de <span className="text-blue-600">Eventos</span></h2>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2 italic">Solo e atendimentos validados no banco</p>
                </div>
                <div className="bg-slate-900/80 border border-white/10 flex items-center px-6 py-4 gap-4 w-full md:w-[450px] shadow-2xl focus-within:border-blue-500 transition-all">
                  <Search size={20} className="text-slate-600" />
                  <input type="text" placeholder="CIA, VOO OU LÍDER..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-transparent border-none focus:ring-0 text-sm font-black uppercase w-full placeholder:text-slate-800 tracking-widest italic" />
                </div>
             </div>
             
             <div className="bg-slate-900/40 border border-white/5 shadow-2xl overflow-hidden">
                <div className="grid grid-cols-6 bg-slate-950/90 px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/10 italic">
                  <div>Data / Turno</div>
                  <div className="col-span-2">Atendimento</div>
                  <div>Início / Fim</div>
                  <div>Líder</div>
                  <div className="text-right">Ação</div>
                </div>
                <div className="divide-y divide-white/5 max-h-[800px] overflow-y-auto custom-scrollbar">
                   {filteredHistory.length > 0 ? filteredHistory.map((v, i) => (
                     <div key={i} onClick={() => { setSelectedDate(v.parentDate); setSelectedShift(v.parentShift === 'manhã' ? 'manha' : v.parentShift); setActiveTab('dashboard'); }} className="grid grid-cols-6 px-8 py-6 items-center hover:bg-blue-600/5 transition-all cursor-pointer group">
                        <div><p className="text-md font-black text-white italic leading-tight">{v.parentDate.split('-').reverse().join('/')}</p><p className="text-[9px] font-bold text-blue-500 uppercase mt-1 italic">{String(v.parentShift).toUpperCase()}</p></div>
                        <div className="col-span-2 flex items-center gap-4"><Plane size={18} className="text-slate-600 group-hover:text-blue-500" /><p className="text-xl font-black italic text-white tracking-tighter uppercase">{v.companhia} <span className="text-blue-500">{v.numero}</span></p></div>
                        <div className="text-[11px] font-mono font-bold text-slate-500 italic"><span className="text-blue-500/60">{v.pouso}</span> <ArrowRight size={12} className="inline mx-2 text-slate-800"/> <span className="text-emerald-500/60">{v.reboque}</span></div>
                        <div className="text-[9px] font-black text-slate-500 uppercase italic truncate">{v.parentLider}</div>
                        <div className="flex justify-end"><button className="bg-white/5 px-4 py-2 text-[8px] font-black text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all uppercase italic">Painel <ExternalLink size={10} className="inline ml-2"/></button></div>
                     </div>
                   )) : <div className="py-40 text-center opacity-10"><Activity size={80} className="mx-auto mb-4"/><p className="text-lg font-black uppercase italic tracking-[0.3em]">Sem registros no filtro</p></div>}
                </div>
             </div>
          </div>
        )}
      </main>

      <footer className="bg-slate-900 border-t border-white/10 px-8 py-4 flex justify-between items-center text-[10px] font-black uppercase text-slate-600 tracking-[0.2em] italic">
        <div className="flex gap-8"><span>RAMP CONTROLL STABLE v11.0</span><span>GSE OPS GESTÃO</span></div>
        <div className="flex gap-4 items-center"><div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div> SUPABASE DATA LINK ACTIVE</div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(59, 130, 246, 0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59, 130, 246, 0.5); }
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(1) brightness(0.8); cursor: pointer; opacity: 0.5; }
        select { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23475569'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E"); background-position: right 0.5rem center; background-repeat: no-repeat; background-size: 1.2em; }
      `}</style>
    </div>
  );
};

export default App;
