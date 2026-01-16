
import React, { useState, useEffect, useRef } from 'react';
import type { SensoryTest, JudgeResult, ViewState, P2PMessage } from './types';
import { AdminDashboard } from './components/AdminDashboard';
import { TestRunner } from './components/TestRunner';
import { ChefHat, ShieldCheck, Wifi, ExternalLink } from 'lucide-react';
// @ts-ignore
import { Peer } from 'peerjs';
import { supabase } from './components/supabaseClient';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'judge' ? 'JUDGE_LOGIN' : 'HOME';
  });

  const [tests, setTests] = useState<SensoryTest[]>([]);
  const [results, setResults] = useState<JudgeResult[]>([]);
  const [judgeName, setJudgeName] = useState('');
  const [activeTestId, setActiveTestId] = useState('');
  const [peerId, setPeerId] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connected'>('disconnected');
  
  const peerRef = useRef<any>(null);
  const connections = useRef<any[]>([]);

  // Carica i dati da Supabase
  const fetchAllData = async () => {
    try {
      const { data: testsData } = await supabase.from('tests').select('*').order('created_at', { ascending: false });
      if (testsData) setTests(testsData);

      const { data: resultsData } = await supabase.from('results').select('*');
      if (resultsData) setResults(resultsData);
    } catch (err) {
      console.error("Errore fetch data:", err);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // PeerJS Setup
  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;
    peer.on('open', (id: string) => { setPeerId(id); setConnectionStatus('connected'); });
    
    peer.on('connection', (conn: any) => {
      connections.current.push(conn);
      conn.on('data', (data: any) => {
        const msg = data as P2PMessage;
        if (msg.type === 'SUBMIT_RESULT') setResults(prev => [...prev, msg.payload]);
        if (msg.type === 'SYNC_TESTS') setTests(msg.payload);
      });
      conn.on('open', () => conn.send({ type: 'SYNC_TESTS', payload: tests }));
    });

    const params = new URLSearchParams(window.location.search);
    const host = params.get('host');
    if (host) {
      peer.on('open', () => {
        const conn = peer.connect(host);
        conn.on('open', () => {
          connections.current.push(conn);
          setConnectionStatus('connected');
        });
        conn.on('data', (data: any) => {
          const msg = data as P2PMessage;
          if (msg.type === 'SYNC_TESTS') setTests(msg.payload);
        });
      });
    }

    return () => peer.destroy();
  }, [tests.length]);

  // CRUD Real-time per Admin
  const handleCreateTest = async (test: SensoryTest) => {
    const { error } = await supabase.from('tests').insert([{
      id: test.id,
      name: test.name,
      type: test.type,
      status: test.status,
      config: test.config
    }]);
    if (!error) fetchAllData();
  };

  const handleUpdateTest = async (test: SensoryTest) => {
    const { error } = await supabase.from('tests').update({
      name: test.name,
      status: test.status,
      config: test.config
    }).eq('id', test.id);
    if (!error) fetchAllData();
  };

  const handleDeleteTest = async (testId: string) => {
    const { error } = await supabase.from('tests').delete().eq('id', testId);
    if (!error) fetchAllData();
  };

  const handleComplete = async (res: JudgeResult) => {
    try {
      // Salvataggio mappato sulle colonne del DB
      const { error } = await supabase.from('results').insert([{
        test_id: res.testId,
        judge_name: res.judgeName,
        submitted_at: res.submittedAt,
        qda_ratings: res.qdaRatings || {},
        cata_selection: res.cataSelection || [],
        rata_selection: res.rataSelection || {},
        napping_data: res.nappingData || {},
        sorting_groups: res.sortingGroups || {},
        tds_logs: res.tdsLogs || {},
        ti_logs: res.tiLogs || {},
        selection: res.triangleSelection || res.pairedSelection || null
      }]);

      if (error) throw error;

      setResults(prev => [...prev, res]);
      connections.current.forEach(c => c.open && c.send({ type: 'SUBMIT_RESULT', payload: res }));
      
      setView('HOME');
      setJudgeName('');
      setActiveTestId('');
      alert("✅ Test completato e salvato su Supabase!");
    } catch (err) {
      console.error("Salvataggio fallito:", err);
      alert("❌ Errore nel salvataggio dei dati.");
    }
  };

  return (
    <div className="font-inter min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden">
      {view === 'HOME' && (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8 gap-8 flex-col lg:flex-row">
          <div className="bg-white p-12 rounded-[60px] max-w-md w-full shadow-2xl animate-in zoom-in duration-500">
            <div className="bg-indigo-100 w-16 h-16 rounded-3xl flex items-center justify-center text-indigo-600 mb-8">
              <ChefHat size={40} />
            </div>
            <h2 className="text-4xl font-black mb-4 tracking-tighter">Assaggiatori</h2>
            <p className="text-slate-500 mb-10 font-medium">Accedi per iniziare la sessione di assaggio.</p>
            <div className="space-y-6">
              <input value={judgeName} onChange={e => setJudgeName(e.target.value)} placeholder="Tuo Nome" className="w-full p-5 bg-slate-50 rounded-2xl border-none font-bold text-lg outline-none focus:ring-4 ring-indigo-50 transition-all" />
              <select value={activeTestId} onChange={e => setActiveTestId(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl border-none font-bold text-lg outline-none appearance-none cursor-pointer">
                <option value="">Seleziona Test...</option>
                {tests.filter(t => t.status === 'active').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button disabled={!judgeName || !activeTestId} onClick={() => setView('JUDGE_RUNNER')} className="w-full py-6 bg-indigo-600 text-white font-black rounded-3xl shadow-xl hover:bg-indigo-700 disabled:opacity-50 active:scale-95 transition-all text-xl">ENTRA IN CABINA</button>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-xl p-12 rounded-[60px] max-w-md w-full border border-white/10 text-white animate-in zoom-in duration-700 delay-150">
            <div className="bg-white/20 w-16 h-16 rounded-3xl flex items-center justify-center text-white mb-8">
              <ShieldCheck size={40} />
            </div>
            <h2 className="text-4xl font-black mb-4 tracking-tighter">Panel Leader</h2>
            <p className="text-slate-300 mb-10 leading-relaxed font-medium">Gestione cloud e analisi AI centralizzata.</p>
            <button onClick={() => setView('ADMIN_DASHBOARD')} className="w-full py-6 bg-white text-slate-900 font-black rounded-3xl hover:bg-slate-50 shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 text-xl">DASHBOARD <ExternalLink size={24}/></button>
          </div>
        </div>
      )}

      {view === 'JUDGE_LOGIN' && (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8">
          <div className="bg-white p-12 rounded-[60px] max-w-md w-full shadow-2xl">
            <h2 className="text-4xl font-black mb-10 tracking-tighter text-center">Login Giudice</h2>
            <div className="space-y-6">
              <div className={`p-4 rounded-2xl flex items-center gap-3 font-black text-xs uppercase tracking-widest ${connectionStatus === 'connected' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                <Wifi size={16}/> {connectionStatus === 'connected' ? 'Connesso' : 'Disconnesso'}
              </div>
              <input value={judgeName} onChange={e => setJudgeName(e.target.value)} placeholder="Tuo Nome" className="w-full p-5 bg-slate-50 rounded-2xl border-none font-bold text-lg" />
              <select value={activeTestId} onChange={e => setActiveTestId(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl border-none font-bold text-lg">
                <option value="">Seleziona Test...</option>
                {tests.filter(t => t.status === 'active').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button disabled={!judgeName || !activeTestId} onClick={() => setView('JUDGE_RUNNER')} className="w-full py-6 bg-indigo-600 text-white font-black rounded-3xl text-xl hover:bg-indigo-700 transition-all">INIZIA ASSAGGIO</button>
              <button onClick={() => setView('HOME')} className="w-full text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-4">Annulla</button>
            </div>
          </div>
        </div>
      )}

      {view === 'ADMIN_DASHBOARD' && (
        <AdminDashboard 
          tests={tests} results={results} peerId={peerId}
          onCreateTest={handleCreateTest}
          onUpdateTest={handleUpdateTest}
          onDeleteTest={handleDeleteTest}
          onNavigate={() => setView('HOME')}
        />
      )}

      {view === 'JUDGE_RUNNER' && (
        <TestRunner 
          test={tests.find(t => t.id === activeTestId)!}
          judgeName={judgeName}
          onComplete={handleComplete}
          onExit={() => setView('HOME')}
        />
      )}
    </div>
  );
};

export default App;