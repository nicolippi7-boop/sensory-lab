import React, { useState, useEffect, useRef } from 'react';
import type { SensoryTest, JudgeResult, ViewState, P2PMessage } from './types';
import { AdminDashboard } from './components/AdminDashboard';
import { TestRunner } from './components/TestRunner';
import { ChefHat, RefreshCw } from 'lucide-react';
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
  const [activeTestSession, setActiveTestSession] = useState<SensoryTest | null>(null);
  const [peerId, setPeerId] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const peerRef = useRef<any>(null);
  const connections = useRef<any[]>([]);

  const fetchAllData = async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const { data: testsData } = await supabase.from('tests').select('*').order('created_at', { ascending: false });
      if (testsData) setTests(testsData);

      const { data: resultsData } = await supabase.from('results').select('*').order('submitted_at', { ascending: false });
      if (resultsData) {
        const formattedResults = resultsData.map(r => ({
          ...(r.responses as any),
          id: r.id,
          testId: r.test_id,
          judgeName: r.judge_name,
          submittedAt: r.submitted_at
        }));
        setResults(formattedResults);
      }
    } catch (err) {
      console.error("Errore fetch:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    
    // --- AGGIUNTA: AUTO-REFRESH OGNI 15 SECONDI ---
    const interval = setInterval(() => {
      if (view !== 'JUDGE_RUNNER') {
        fetchAllData(true);
      }
    }, 15000);

    const peer = new Peer();
    peerRef.current = peer;
    peer.on('open', (id: string) => setPeerId(id));
    
    peer.on('connection', (conn: any) => {
      connections.current.push(conn);
      conn.on('data', (data: any) => {
        const msg = data as P2PMessage;
        if (msg.type === 'SUBMIT_RESULT') fetchAllData(true);
      });
    });

    return () => { 
      if (peerRef.current) peerRef.current.destroy(); 
      clearInterval(interval);
    };
  }, [view]);

  // --- AGGIUNTA: FUNZIONE DI LANCIO CON RANDOMIZZAZIONE ---
  const handleStartTest = () => {
    const baseTest = tests.find(t => t.id === activeTestId);
    if (!baseTest || !judgeName) return;

    let sessionTest = JSON.parse(JSON.stringify(baseTest));

    if (sessionTest.config?.randomizeOrder) {
      const samples = [...(sessionTest.config.samples || [])];
      for (let i = samples.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [samples[i], samples[j]] = [samples[j], samples[i]];
      }
      sessionTest.config.samples = samples;
    }

    setActiveTestSession(sessionTest);
    setView('JUDGE_RUNNER');
  };

  const handleComplete = async (res: JudgeResult) => {
    try {
      const { error } = await supabase.from('results').insert([{
        test_id: String(res.testId),
        judge_name: String(res.judgeName),
        submitted_at: new Date().toISOString(),
        responses: { 
          ...res, 
          actualPresentationOrder: activeTestSession?.config.samples.map((s: any) => s.code) 
        }
      }]);
      
      if (error) throw error;
      await fetchAllData();
      setView('HOME');
      setJudgeName('');
      setActiveTestId('');
      setActiveTestSession(null);
      alert("✅ Test salvato correttamente!");
    } catch (err: any) {
      alert(`Errore salvataggio: ${err.message}`);
    }
  };

  return (
    <div className="font-inter min-h-screen bg-slate-50 text-slate-900">
      {isRefreshing && (
        <div className="fixed top-4 right-4 z-50 animate-spin text-indigo-600">
          <RefreshCw size={20} />
        </div>
      )}

      {view === 'HOME' && (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8 gap-8 flex-col lg:flex-row">
          <div className="bg-white p-12 rounded-[60px] max-w-md w-full shadow-2xl">
            <div className="bg-indigo-100 w-16 h-16 rounded-3xl flex items-center justify-center text-indigo-600 mb-8"><ChefHat size={40} /></div>
            <h2 className="text-4xl font-black mb-4 tracking-tighter">Assaggiatori</h2>
            <div className="space-y-6">
              <input value={judgeName} onChange={e => setJudgeName(e.target.value)} placeholder="Tuo Nome" className="w-full p-5 bg-slate-50 rounded-2xl outline-none" />
              <select value={activeTestId} onChange={e => setActiveTestId(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl outline-none">
                <option value="">Seleziona Test...</option>
                {tests.filter(t => t.status === 'active').map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.config?.randomizeOrder ? '🔄' : ''}
                  </option>
                ))}
              </select>
              <button disabled={!judgeName || !activeTestId} onClick={handleStartTest} className="w-full py-6 bg-indigo-600 text-white font-black rounded-3xl shadow-xl">ENTRA IN CABINA</button>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-xl p-12 rounded-[60px] max-w-md w-full border border-white/10 text-white">
            <h2 className="text-4xl font-black mb-8 tracking-tighter">Panel Leader</h2>
            <button onClick={() => setView('ADMIN_DASHBOARD')} className="w-full py-6 bg-white text-slate-900 font-bold rounded-3xl shadow-xl">ACCEDI DASHBOARD</button>
          </div>
        </div>
      )}

      {view === 'JUDGE_RUNNER' && activeTestSession && (
        <TestRunner 
          test={activeTestSession}
          judgeName={judgeName}
          onComplete={handleComplete}
          onExit={() => { setView('HOME'); setActiveTestSession(null); }}
        />
      )}

      {view === 'ADMIN_DASHBOARD' && (
        <AdminDashboard 
          tests={tests} results={results}
          onCreateTest={async (t) => { await supabase.from('tests').insert([t]); fetchAllData(); }}
          onUpdateTest={async () => fetchAllData()}
          onDeleteTest={async (id) => { await supabase.from('tests').delete().eq('id', id); fetchAllData(); }}
          onNavigate={() => setView('HOME')}
          peerId={peerId}
        />
      )}
    </div>
  );
};

export default App;