import React, { useState, useEffect, useRef } from 'react';
import { TestType } from './types';
import type { SensoryTest, JudgeResult, ViewState, Product } from './types';
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
    } catch (err) { console.error("Errore fetch:", err); } 
    finally { setIsRefreshing(false); }
  };

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(() => {
      if (view === 'ADMIN_DASHBOARD' || view === 'HOME') fetchAllData(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [view]);

  /**
   * Gestisce la randomizzazione dei prodotti.
   * Per il TRIANGLE, implementa le 6 sequenze bilanciate (AAB, ABA, BAA, BBA, BAB, ABB).
   */
  const getRandomizedTest = (test: SensoryTest, judgeName: string): SensoryTest => {
    if (!test || !test.config.products || test.config.products.length < 2) return test;
    
    const randomizedTest = JSON.parse(JSON.stringify(test));
    const p = test.config.products;

    // Logica specifica per TEST TRIANGOLARE (DIN 10955 / ISO 4120)
    if (test.type === TestType.TRIANGLE && p.length >= 2) {
      const A = p[0];
      const B = p[1];
      
      // Creiamo le 6 combinazioni possibili
      const sequences = [
        [A, A, B], [A, B, A], [B, A, A], // B è il diverso
        [B, B, A], [B, A, B], [A, B, B]  // A è il diverso
      ];

      // Usiamo il nome del giudice come seed deterministico per assegnare una sequenza
      const seed = judgeName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const chosenSequence = sequences[seed % sequences.length];
      
      randomizedTest.config.products = chosenSequence;
      return randomizedTest;
    }

    // Randomizzazione standard per gli altri tipi di test
    if (test.config.randomizePresentation) {
      const products = [...randomizedTest.config.products];
      for (let i = products.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [products[i], products[j]] = [products[j], products[i]];
      }
      randomizedTest.config.products = products;
    }

    return randomizedTest;
  };

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;
    peer.on('open', (id: string) => setPeerId(id));
    return () => { if (peerRef.current) peerRef.current.destroy(); };
  }, []);

  const handleCreateTest = async (test: SensoryTest) => {
    try {
      await supabase.from('tests').insert([{ id: String(test.id), name: test.name, type: test.type, status: test.status, config: test.config }]);
      await fetchAllData();
    } catch (err) { console.error(err); }
  };

  const handleComplete = async (res: JudgeResult) => {
    const isJudgeMode = new URLSearchParams(window.location.search).get('mode') === 'judge';
    try {
      await supabase.from('results').insert([{ test_id: String(res.testId), judge_name: String(res.judgeName), submitted_at: new Date().toISOString(), responses: res }]);
      await fetchAllData();
      setView(isJudgeMode ? 'JUDGE_LOGIN' : 'HOME');
      setJudgeName(''); setActiveTestId('');
      alert("✅ Risultati registrati con successo!");
    } catch (err: any) { alert(`Errore durante l'invio: ${err.message}`); }
  };

  return (
    <div className="font-inter min-h-screen bg-slate-50 text-slate-900">
      {isRefreshing && <div className="fixed top-4 right-4 z-50 animate-spin text-indigo-600"><RefreshCw size={20} /></div>}

      {view === 'HOME' && (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8 gap-8 flex-col lg:flex-row">
          <div className="bg-white p-12 rounded-[60px] max-w-md w-full shadow-2xl">
            <div className="bg-indigo-100 w-16 h-16 rounded-3xl flex items-center justify-center text-indigo-600 mb-8"><ChefHat size={40} /></div>
            <h2 className="text-4xl font-black mb-4 tracking-tighter">Assaggiatori</h2>
            <div className="space-y-6">
              <input value={judgeName} onChange={e => setJudgeName(e.target.value)} placeholder="Tuo Nome" className="w-full p-5 bg-slate-50 rounded-2xl outline-none border-2 border-transparent focus:border-indigo-500 transition-all" />
              <select value={activeTestId} onChange={e => setActiveTestId(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl outline-none border-2 border-transparent focus:border-indigo-500 transition-all appearance-none">
                <option value="">Seleziona Test...</option>
                {tests.filter(t => t.status === 'active').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button disabled={!judgeName || !activeTestId} onClick={() => setView('JUDGE_RUNNER')} className="w-full py-6 bg-indigo-600 text-white font-black rounded-3xl shadow-xl hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-95">ENTRA IN CABINA</button>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-xl p-12 rounded-[60px] max-w-md w-full border border-white/10 text-white">
            <h2 className="text-4xl font-black mb-8 tracking-tighter">Panel Leader</h2>
            <button onClick={() => setView('ADMIN_DASHBOARD')} className="w-full py-6 bg-white text-slate-900 font-bold rounded-3xl shadow-xl hover:bg-slate-100 transition-all active:scale-95">ACCEDI DASHBOARD</button>
          </div>
        </div>
      )}

      {view === 'JUDGE_LOGIN' && (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-10 shadow-2xl max-w-md w-full">
            <h2 className="text-2xl font-black mb-6 tracking-tight">Accesso Assaggiatore</h2>
            <div className="space-y-6">
              <input value={judgeName} onChange={e => setJudgeName(e.target.value)} placeholder="Il tuo Nome" className="w-full p-4 bg-slate-50 rounded-2xl outline-none border-2 border-transparent focus:border-indigo-500" />
              <select value={activeTestId} onChange={e => setActiveTestId(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl outline-none border-2 border-transparent focus:border-indigo-500">
                <option value="">Scegli una sessione...</option>
                {tests.filter(t => t.status === 'active').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button disabled={!judgeName || !activeTestId} onClick={() => setView('JUDGE_RUNNER')} className="w-full py-5 bg-indigo-600 text-white font-black rounded-3xl shadow-lg active:scale-95 transition-all"> INIZIA </button>
            </div>
          </div>
        </div>
      )}

      {view === 'JUDGE_RUNNER' && activeTestId && (
        <TestRunner 
          test={getRandomizedTest(tests.find(t => t.id === activeTestId)!, judgeName)}
          judgeName={judgeName} onComplete={handleComplete}
          onExit={() => setView(new URLSearchParams(window.location.search).get('mode') === 'judge' ? 'JUDGE_LOGIN' : 'HOME')}
        />
      )}

      {view === 'ADMIN_DASHBOARD' && (
        <AdminDashboard 
          tests={tests} results={results} onCreateTest={handleCreateTest}
          onUpdateTest={async (updated) => { 
            await supabase.from('tests').update({ status: updated.status, config: updated.config, name: updated.name }).eq('id', updated.id);
            fetchAllData(); 
          }}
          onDeleteTest={async (id) => { if(confirm("Eliminare definitivamente il test?")) { await supabase.from('tests').delete().eq('id', id); fetchAllData(); } }}
          onNavigate={() => setView('HOME')} peerId={peerId}
        />
      )}
    </div>
  );
};

export default App;