import React, { useState, useEffect, useRef } from 'react';
import type { SensoryTest, JudgeResult, ViewState } from './types';
import { AdminDashboard } from './components/AdminDashboard';
import { TestRunner } from './components/TestRunner';
import { ChefHat, RefreshCw } from 'lucide-react';
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  // --- FUNZIONE CARICAMENTO DATI DAL CLOUD ---
  const fetchAllData = async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      // Carica i Test
      const { data: tData, error: tErr } = await supabase
        .from('tests')
        .select('*')
        .order('created_at', { ascending: false });
      if (tErr) throw tErr;
      if (tData) setTests(tData);

      // Carica i Risultati
      const { data: rData, error: rErr } = await supabase
        .from('results')
        .select('*')
        .order('submitted_at', { ascending: false });
      if (rErr) throw rErr;
      if (rData) {
        const formatted = rData.map(r => ({
          ...(r.responses as any),
          id: r.id,
          testId: r.test_id,
          judgeName: r.judge_name,
          submittedAt: r.submitted_at
        }));
        setResults(formatted);
      }
    } catch (err) {
      console.error("Errore sincronizzazione:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // --- EFFETTO AUTO-REFRESH (15 SECONDI) ---
  useEffect(() => {
    fetchAllData();
    const interval = setInterval(() => {
      // Aggiorna solo se non stiamo eseguendo un test
      if (view !== 'JUDGE_RUNNER') {
        fetchAllData(true);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [view]);

  // --- LOGICA DI LANCIO CON RANDOMIZZAZIONE ---
  const handleStartTest = () => {
    const baseTest = tests.find(t => t.id === activeTestId);
    if (!baseTest || !judgeName) return;

    // Cloniamo il test per non modificare l'originale nel database
    let sessionTest = JSON.parse(JSON.stringify(baseTest));

    // Verifichiamo se l'opzione randomizeOrder è attiva nel config
    if (sessionTest.config && sessionTest.config.randomizeOrder === true) {
      console.log("🎲 Randomizzazione in corso per questa sessione...");
      const samples = [...(sessionTest.config.samples || [])];
      
      // Algoritmo Fisher-Yates per rimescolare i campioni
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
      // Inseriamo nel risultato l'ordine esatto di presentazione per tracciabilità
      const finalResult = {
        ...res,
        actualOrder: activeTestSession?.config.samples.map((s: any) => s.code)
      };

      const { error } = await supabase.from('results').insert([{
        test_id: activeTestId,
        judge_name: judgeName,
        submitted_at: new Date().toISOString(),
        responses: finalResult
      }]);

      if (error) throw error;

      await fetchAllData();
      setView('HOME');
      setJudgeName('');
      setActiveTestId('');
      setActiveTestSession(null);
      alert("✅ Test inviato con successo!");
    } catch (err: any) {
      alert("Errore salvataggio: " + err.message);
    }
  };

  return (
    <div className="font-inter min-h-screen bg-slate-50">
      {/* Indicatore Refresh Silenzioso */}
      {isRefreshing && (
        <div className="fixed top-4 right-4 z-50 animate-spin text-indigo-600 bg-white p-2 rounded-full shadow-lg">
          <RefreshCw size={20} />
        </div>
      )}

      {view === 'HOME' && (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8 gap-8 flex-col lg:flex-row">
          {/* Box Assaggiatore */}
          <div className="bg-white p-12 rounded-[60px] max-w-md w-full shadow-2xl">
            <div className="bg-indigo-100 w-16 h-16 rounded-3xl flex items-center justify-center text-indigo-600 mb-8">
              <ChefHat size={40} />
            </div>
            <h2 className="text-4xl font-black mb-4 tracking-tighter text-slate-900">Assaggiatori</h2>
            <div className="space-y-6">
              <input 
                value={judgeName} 
                onChange={e => setJudgeName(e.target.value)} 
                placeholder="Tuo Nome e Cognome" 
                className="w-full p-5 bg-slate-50 rounded-2xl outline-none border-2 border-slate-100 focus:border-indigo-600 transition-all font-bold" 
              />
              <select 
                value={activeTestId} 
                onChange={e => setActiveTestId(e.target.value)} 
                className="w-full p-5 bg-slate-50 rounded-2xl outline-none border-2 border-slate-100 font-bold appearance-none"
              >
                <option value="">Seleziona Sessione...</option>
                {tests.filter(t => t.status === 'active').map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.config?.randomizeOrder ? ' 🔄' : ''}
                  </option>
                ))}
              </select>
              <button 
                disabled={!judgeName || !activeTestId} 
                onClick={handleStartTest} 
                className="w-full py-6 bg-indigo-600 text-white font-black rounded-3xl shadow-xl hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
              >
                ENTRA IN CABINA
              </button>
            </div>
          </div>

          {/* Box Admin Link */}
          <div className="bg-white/10 backdrop-blur-xl p-12 rounded-[60px] max-w-md w-full border border-white/10 text-white text-center">
            <h2 className="text-4xl font-black mb-8 tracking-tighter">Panel Leader</h2>
            <button 
              onClick={() => setView('ADMIN_DASHBOARD')} 
              className="w-full py-6 bg-white text-slate-900 font-bold rounded-3xl shadow-xl hover:bg-slate-100 transition-all"
            >
              ACCEDI DASHBOARD
            </button>
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
          tests={tests} 
          results={results} 
          onNavigate={() => setView('HOME')}
          onCreateTest={async (t) => {
            const { error } = await supabase.from('tests').insert([t]);
            if (error) alert("Errore creazione: " + error.message);
            fetchAllData();
          }}
          onDeleteTest={async (id) => {
            if (confirm("Vuoi eliminare questo test?")) {
              await supabase.from('tests').delete().eq('id', id);
              fetchAllData();
            }
          }}
          onUpdateTest={fetchAllData}
          peerId=""
        />
      )}
    </div>
  );
};

export default App;