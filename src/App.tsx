import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { SensoryTest, JudgeResult, ViewState, P2PMessage } from './types';
import { AdminDashboard } from './components/AdminDashboard';
import { TestRunner } from './components/TestRunner';
import { ChefHat, RefreshCw, Shuffle } from 'lucide-react';
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const peerRef = useRef<any>(null);

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
          judge_name: r.judge_name,
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
    const interval = setInterval(() => {
      if (view === 'ADMIN_DASHBOARD' || view === 'HOME') fetchAllData(true);
    }, 15000); 
    return () => clearInterval(interval);
  }, [view]);

  // --- LOGICA DI RANDOMIZZAZIONE REALE ---
  // Viene ricalcolata ogni volta che il componente viene montato per un nuovo runner
  const preparedTest = useMemo(() => {
    const original = tests.find(t => t.id === activeTestId);
    if (!original) return null;

    // Se il test NON ha la randomizzazione attiva, lo restituiamo tal quale
    if (!original.config.randomizeOrder) return original;

    // Se è attiva, rimescoliamo i campioni solo per questa sessione
    const clonedTest = JSON.parse(JSON.stringify(original));
    const samples = clonedTest.config.samples || [];
    
    for (let i = samples.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [samples[i], samples[j]] = [samples[j], samples[i]];
    }

    return clonedTest;
  }, [activeTestId, view]); // Trigger fondamentale: quando cambia la vista o il test scelto

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;
    peer.on('open', (id: string) => setPeerId(id));
    return () => { if (peerRef.current) peerRef.current.destroy(); };
  }, []);

  const handleComplete = async (res: JudgeResult) => {
    const isJudgeMode = new URLSearchParams(window.location.search).get('mode') === 'judge';
    try {
      // Aggiungiamo l'ordine dei campioni usati ai metadati del risultato
      const resultWithMetadata = {
        ...res,
        presentationOrder: preparedTest?.config.samples.map((s: any) => s.code)
      };

      const { error } = await supabase.from('results').insert([{
        test_id: String(res.testId),
        judge_name: String(res.judgeName),
        submitted_at: new Date().toISOString(),
        responses: resultWithMetadata
      }]);
      
      if (error) throw error;
      await fetchAllData();
      setView(isJudgeMode ? 'JUDGE_LOGIN' : 'HOME');
      setJudgeName('');
      setActiveTestId('');
      alert("✅ Risultati salvati!");
    } catch (err: any) {
      alert(`Errore: ${err.message}`);
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
              <input value={judgeName} onChange={e => setJudgeName(e.target.value)} placeholder="Tuo Nome" className="w-full p-5 bg-slate-50 rounded-2xl outline-none border-2 border-transparent focus:border-indigo-600 transition-all" />
              <div className="space-y-2">
                <select value={activeTestId} onChange={e => setActiveTestId(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl outline-none appearance-none border-2 border-transparent focus:border-indigo-600">
                  <option value="">Seleziona Test...</option>
                  {tests.filter(t => t.status === 'active').map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.config.randomizeOrder ? ' (🔀 Random)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button 
                disabled={!judgeName || !activeTestId} 
                onClick={() => setView('JUDGE_RUNNER')} 
                className="w-full py-6 bg-indigo-600 text-white font-black rounded-3xl shadow-xl hover:bg-indigo-700 transition-all active:scale-95"
              >
                ENTRA IN CABINA
              </button>
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-xl p-12 rounded-[60px] max-w-md w-full border border-white/10 text-white">
            <h2 className="text-4xl font-black mb-8 tracking-tighter">Panel Leader</h2>
            <button onClick={() => setView('ADMIN_DASHBOARD')} className="w-full py-6 bg-white text-slate-900 font-bold rounded-3xl shadow-xl hover:bg-slate-100 transition-all">ACCEDI DASHBOARD</button>
          </div>
        </div>
      )}

      {view === 'JUDGE_RUNNER' && preparedTest && (
        <TestRunner 
          test={preparedTest}
          judgeName={judgeName}
          onComplete={handleComplete}
          onExit={() => { setView('HOME'); setJudgeName(''); setActiveTestId(''); }}
        />
      )}

      {view === 'ADMIN_DASHBOARD' && (
        <AdminDashboard 
          tests={tests} results={results}
          onCreateTest={async (t) => {
            // Qui dovrai assicurarti che il tuo componente AdminDashboard passi randomizeOrder nel config
            await supabase.from('tests').insert([{ id: String(t.id), name: t.name, type: t.type, status: t.status, config: t.config }]);
            fetchAllData();
          }}
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