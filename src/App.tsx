import React, { useState, useEffect, useRef } from 'react';
import type { SensoryTest, JudgeResult, ViewState, P2PMessage } from './types';
import { AdminDashboard } from './components/AdminDashboard';
import { TestRunner } from './components/TestRunner';
import { ChefHat } from 'lucide-react';
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
  
  const peerRef = useRef<any>(null);
  const connections = useRef<any[]>([]);

  // --- FUNZIONE CARICAMENTO DATI DAL CLOUD (SINCRO) ---
  const fetchAllData = async () => {
    try {
      // Carica i Test
      const { data: testsData } = await supabase
        .from('tests')
        .select('*')
        .order('created_at', { ascending: false });
      if (testsData) setTests(testsData);

      // Carica i Risultati e convertili dal formato DB al formato App
      const { data: resultsData } = await supabase
        .from('results')
        .select('*')
        .order('submitted_at', { ascending: false });
        
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
      console.error("Errore fetch database:", err);
    }
  };

  useEffect(() => {
    fetchAllData();
    
    // PeerJS setup (mantenuto come da tua richiesta)
    const peer = new Peer();
    peerRef.current = peer;
    peer.on('open', (id: string) => setPeerId(id));
    
    peer.on('connection', (conn: any) => {
      connections.current.push(conn);
      conn.on('data', (data: any) => {
        const msg = data as P2PMessage;
        if (msg.type === 'SUBMIT_RESULT') fetchAllData(); // Ricarica dal cloud se arriva segnale P2P
        if (msg.type === 'SYNC_TESTS') setTests(msg.payload);
      });
    });

    return () => { if (peerRef.current) peerRef.current.destroy(); };
  }, []);

  const handleCreateTest = async (test: SensoryTest) => {
    try {
      const { error } = await supabase.from('tests').insert([{
        id: String(test.id),
        name: test.name,
        type: test.type,
        status: test.status,
        config: test.config
      }]);
      if (error) throw error;
      await fetchAllData();
    } catch (err) {
      console.error("Errore creazione test:", err);
    }
  };

  // --- COMPLETAMENTO TEST CON INVIO CLOUD ---
  const handleComplete = async (res: JudgeResult) => {
    const isJudgeMode = new URLSearchParams(window.location.search).get('mode') === 'judge';

    try {
      const { error } = await supabase.from('results').insert([{
        test_id: String(res.testId),
        judge_name: String(res.judgeName),
        submitted_at: new Date().toISOString(),
        responses: res // Salvataggio JSON completo
      }]);
      
      if (error) throw error;

      // Sincronizza subito i dati per vederli sulla dashboard
      await fetchAllData();

      setView(isJudgeMode ? 'JUDGE_LOGIN' : 'HOME');
      setJudgeName('');
      setActiveTestId('');
      alert("✅ Risultati salvati nel database cloud!");
    } catch (err: any) {
      console.error("Errore salvataggio Cloud:", err);
      alert(`⚠️ Errore salvataggio: ${err.message}`);
    }
  };

  return (
    <div className="font-inter min-h-screen bg-slate-50 text-slate-900">
      {view === 'HOME' && (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8 gap-8 flex-col lg:flex-row">
          <div className="bg-white p-12 rounded-[60px] max-w-md w-full shadow-2xl">
            <div className="bg-indigo-100 w-16 h-16 rounded-3xl flex items-center justify-center text-indigo-600 mb-8"><ChefHat size={40} /></div>
            <h2 className="text-4xl font-black mb-4 tracking-tighter">Assaggiatori</h2>
            <div className="space-y-6">
              <input value={judgeName} onChange={e => setJudgeName(e.target.value)} placeholder="Tuo Nome" className="w-full p-5 bg-slate-50 rounded-2xl outline-none focus:ring-4 ring-indigo-50" />
              <select value={activeTestId} onChange={e => setActiveTestId(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl outline-none">
                <option value="">Seleziona Test...</option>
                {tests.filter(t => t.status === 'active').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button disabled={!judgeName || !activeTestId} onClick={() => setView('JUDGE_RUNNER')} className="w-full py-6 bg-indigo-600 text-white font-black rounded-3xl shadow-xl hover:bg-indigo-700 transition-all">ENTRA IN CABINA</button>
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-xl p-12 rounded-[60px] max-w-md w-full border border-white/10 text-white">
            <h2 className="text-4xl font-black mb-8 tracking-tighter">Panel Leader</h2>
            <button onClick={() => { fetchAllData(); setView('ADMIN_DASHBOARD'); }} className="w-full py-6 bg-white text-slate-900 font-bold rounded-3xl shadow-xl hover:bg-slate-100 transition-all">ACCEDI DASHBOARD</button>
          </div>
        </div>
      )}

      {view === 'JUDGE_LOGIN' && (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-10 shadow-2xl max-w-md w-full">
            <h2 className="text-2xl font-black mb-6">Assaggiatori</h2>
            <div className="space-y-6">
              <input value={judgeName} onChange={e => setJudgeName(e.target.value)} placeholder="Il tuo Nome" className="w-full p-4 bg-slate-50 rounded-2xl outline-none focus:border-indigo-500 border-2 border-transparent" />
              <select value={activeTestId} onChange={e => setActiveTestId(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl outline-none">
                <option value="">Scegli una sessione...</option>
                {tests.filter(t => t.status === 'active').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button disabled={!judgeName || !activeTestId} onClick={() => setView('JUDGE_RUNNER')} className="w-full py-5 bg-indigo-600 text-white font-black rounded-3xl"> INIZIA ASSAGGIO </button>
            </div>
          </div>
        </div>
      )}

      {view === 'JUDGE_RUNNER' && tests.find(t => t.id === activeTestId) && (
        <TestRunner 
          test={tests.find(t => t.id === activeTestId)!}
          judgeName={judgeName}
          onComplete={handleComplete}
          onExit={() => setView(new URLSearchParams(window.location.search).get('mode') === 'judge' ? 'JUDGE_LOGIN' : 'HOME')}
        />
      )}

      {view === 'ADMIN_DASHBOARD' && (
        <AdminDashboard 
          tests={tests} 
          results={results}
          onCreateTest={handleCreateTest}
          onUpdateTest={async () => fetchAllData()}
          onDeleteTest={async (id) => { 
            await supabase.from('tests').delete().eq('id', id); 
            fetchAllData(); 
          }}
          onNavigate={() => setView('HOME')}
          peerId={peerId}
        />
      )}
    </div>
  );
};

export default App;