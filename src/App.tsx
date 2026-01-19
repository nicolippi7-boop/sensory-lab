import React, { useState, useEffect, useRef } from 'react';
import type { SensoryTest, JudgeResult, ViewState } from './types';
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
          ...(r.responses as any), // Qui dentro ora finiranno anche i dati DIN
          id: r.id,
          testId: r.test_id,
          judgeName: r.judge_name,
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

  // Logica di randomizzazione migliorata per non mutare l'originale
  const getRandomizedTest = (test: SensoryTest) => {
    if (!test || !test.config.products || !test.config.randomizePresentation) return test;
    const randomizedTest = JSON.parse(JSON.stringify(test));
    const products = randomizedTest.config.products;
    for (let i = products.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [products[i], products[j]] = [products[j], products[i]];
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
      await supabase.from('tests').insert([{ 
        id: String(test.id), 
        name: test.name, 
        type: test.type, 
        status: test.status, 
        config: test.config 
      }]);
      await fetchAllData();
    } catch (err) { console.error(err); }
  };

  /**
   * Gestisce il completamento del test.
   * Riceve l'oggetto res dal TestRunner che ora contiene i campi DIN 10955:
   * certainty, odorScore, flavorScore, differenceDescription
   */
  const handleComplete = async (res: JudgeResult) => {
    const isJudgeMode = new URLSearchParams(window.location.search).get('mode') === 'judge';
    try {
      // Inseriamo l'intero oggetto res nel campo JSONB 'responses'
      await supabase.from('results').insert([{ 
        test_id: String(res.testId), 
        judge_name: String(res.judgeName), 
        submitted_at: new Date().toISOString(), 
        responses: res // res include i nuovi parametri DIN
      }]);
      
      await fetchAllData();
      setView(isJudgeMode ? 'JUDGE_LOGIN' : 'HOME');
      setJudgeName(''); 
      setActiveTestId('');
      
      // Feedback utente migliorato
      alert("✅ Test inviato con successo!");
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) { 
      alert(`Errore durante l'invio: ${err.message}`); 
    }
  };

  return (
    <div className="font-inter min-h-screen bg-slate-50 text-slate-900">
      {/* Indicatore di aggiornamento dati in background */}
      {isRefreshing && (
        <div className="fixed top-4 right-4 z-[60] bg-white/80 backdrop-blur-md p-2 rounded-full shadow-lg border border-slate-100 animate-spin text-indigo-600">
          <RefreshCw size={20} />
        </div>
      )}

      {/* VISTA HOME: Selezione tra Assaggiatore e Panel Leader */}
      {view === 'HOME' && (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8 gap-8 flex-col lg:flex-row">
          <div className="bg-white p-12 rounded-[60px] max-w-md w-full shadow-2xl animate-in fade-in slide-in-from-left-8 duration-700">
            <div className="bg-indigo-100 w-16 h-16 rounded-3xl flex items-center justify-center text-indigo-600 mb-8"><ChefHat size={40} /></div>
            <h2 className="text-4xl font-black mb-4 tracking-tighter text-slate-900">Assaggiatori</h2>
            <div className="space-y-6">
              <input 
                value={judgeName} 
                onChange={e => setJudgeName(e.target.value)} 
                placeholder="Tuo Nome" 
                className="w-full p-5 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium" 
              />
              <select 
                value={activeTestId} 
                onChange={e => setActiveTestId(e.target.value)} 
                className="w-full p-5 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold appearance-none"
              >
                <option value="">Seleziona Test...</option>
                {tests.filter(t => t.status === 'active').map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button 
                disabled={!judgeName || !activeTestId} 
                onClick={() => setView('JUDGE_RUNNER')} 
                className="w-full py-6 bg-indigo-600 text-white font-black rounded-3xl shadow-xl hover:bg-indigo-700 disabled:opacity-30 disabled:grayscale transition-all active:scale-95"
              >
                ENTRA IN CABINA
              </button>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-xl p-12 rounded-[60px] max-w-md w-full border border-white/10 text-white animate-in fade-in slide-in-from-right-8 duration-700">
            <h2 className="text-4xl font-black mb-8 tracking-tighter">Panel Leader</h2>
            <button 
              onClick={() => setView('ADMIN_DASHBOARD')} 
              className="w-full py-6 bg-white text-slate-900 font-bold rounded-3xl shadow-xl hover:bg-slate-100 transition-all active:scale-95"
            >
              ACCEDI DASHBOARD
            </button>
          </div>
        </div>
      )}

      {/* VISTA LOGIN DEDICATA (per tablet/cabine con URL ?mode=judge) */}
      {view === 'JUDGE_LOGIN' && (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] p-10 shadow-2xl max-w-md w-full border border-slate-200">
            <div className="flex justify-center mb-6 text-indigo-600"><ChefHat size={48} /></div>
            <h2 className="text-3xl font-black mb-8 text-center tracking-tight">Accesso Assaggiatore</h2>
            <div className="space-y-6">
              <input 
                value={judgeName} 
                onChange={e => setJudgeName(e.target.value)} 
                placeholder="Il tuo Nome" 
                className="w-full p-5 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
              />
              <select 
                value={activeTestId} 
                onChange={e => setActiveTestId(e.target.value)} 
                className="w-full p-5 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold appearance-none"
              >
                <option value="">Scegli una sessione...</option>
                {tests.filter(t => t.status === 'active').map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button 
                disabled={!judgeName || !activeTestId} 
                onClick={() => setView('JUDGE_RUNNER')} 
                className="w-full py-6 bg-indigo-600 text-white font-black rounded-3xl shadow-lg hover:bg-indigo-700 disabled:opacity-20 transition-all"
              > 
                INIZIA TEST 
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RUNNER DEL TEST */}
      {view === 'JUDGE_RUNNER' && activeTestId && (
        <TestRunner 
          test={getRandomizedTest(tests.find(t => t.id === activeTestId)!)}
          judgeName={judgeName} 
          onComplete={handleComplete}
          onExit={() => {
            const isJudgeMode = new URLSearchParams(window.location.search).get('mode') === 'judge';
            setView(isJudgeMode ? 'JUDGE_LOGIN' : 'HOME');
          }}
        />
      )}

      {/* DASHBOARD AMMINISTRATORE */}
      {view === 'ADMIN_DASHBOARD' && (
        <AdminDashboard 
          tests={tests} 
          results={results} 
          onCreateTest={handleCreateTest}
          onUpdateTest={async (updated) => { 
            await supabase.from('tests')
              .update({ status: updated.status, config: updated.config, name: updated.name })
              .eq('id', updated.id);
            fetchAllData(true); 
          }}
          onDeleteTest={async (id) => { 
            if(confirm("Sei sicuro di voler eliminare questo test?")) {
              await supabase.from('tests').delete().eq('id', id); 
              fetchAllData(); 
            }
          }}
          onNavigate={() => setView('HOME')} 
          peerId={peerId}
        />
      )}
    </div>
  );
};

export default App;