
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

  // Helper per formattare errori ed evitare [object Object]
  const formatError = (err: any) => {
    if (!err) return "Errore sconosciuto";
    if (typeof err === 'string') return err;
    if (err.message) return err.message;
    if (err.details) return err.details;
    if (err.hint) return `${err.message} (Suggerimento: ${err.hint})`;
    try {
      return JSON.stringify(err, null, 2);
    } catch {
      return String(err);
    }
  };

  const fetchAllData = async () => {
    try {
      const { data: testsData, error: tError } = await supabase.from('tests').select('*').order('created_at', { ascending: false });
      if (tError) {
        console.error("Errore fetch tests:", formatError(tError));
      } else if (testsData) {
        setTests(testsData);
      }

      const { data: resultsData, error: rError } = await supabase.from('results').select('*');
      if (rError) {
        console.error("Errore fetch results:", formatError(rError));
      } else if (resultsData) {
        setResults(resultsData);
      }
    } catch (err: any) {
      console.error("Dettaglio Errore fetch data:", formatError(err));
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

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

    return () => {
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  const handleCreateTest = async (test: SensoryTest) => {
    setTests(prev => [test, ...prev]);

    try {
      const { error } = await supabase.from('tests').insert([{
        id: test.id,
        name: test.name,
        type: test.type,
        status: test.status,
        config: test.config,
        created_at: test.createdAt || new Date().toISOString()
      }]);
      
      if (error) throw error;
      await fetchAllData();
    } catch (err: any) {
      console.error("Errore salvataggio Cloud:", formatError(err));
    }
  };

  const handleUpdateTest = async (test: SensoryTest) => {
    setTests(prev => prev.map(t => t.id === test.id ? test : t));
    try {
      const { error } = await supabase.from('tests').update({
        name: test.name,
        status: test.status,
        config: test.config
      }).eq('id', test.id);
      if (error) throw error;
      await fetchAllData();
    } catch (err: any) {
      console.error("Errore modifica Cloud:", formatError(err));
    }
  };

  const handleDeleteTest = async (testId: string) => {
    setTests(prev => prev.filter(t => t.id !== testId));
    try {
      const { error } = await supabase.from('tests').delete().eq('id', testId);
      if (error) throw error;
      await fetchAllData();
    } catch (err: any) {
      console.error("Errore eliminazione Cloud:", formatError(err));
    }
  };

  const handleComplete = async (res: JudgeResult) => {
    // 1. Aggiornamento Locale immediato
    setResults(prev => [...prev, res]);
    
    const params = new URLSearchParams(window.location.search);
    const isJudgeMode = params.get('mode') === 'judge';

    // 2. Funzione per pulire lo stato e tornare alla vista corretta (Login per i giudici, Home per gli altri)
    const finishTestUI = (message: string) => {
      setView(isJudgeMode ? 'JUDGE_LOGIN' : 'HOME');
      setJudgeName('');
      setActiveTestId('');
      // Timeout per permettere al React render di avvenire prima del blocco dell'alert
      setTimeout(() => alert(message), 100);
    };

    try {
      // 3. Tentativo di salvataggio su Supabase
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
        selection: res.triangleSelection || res.pairedSelection || res.selection || null
      }]);
      
      if (error) throw error;

      // 4. Invio P2P se connesso
      connections.current.forEach(c => c.open && c.send({ type: 'SUBMIT_RESULT', payload: res }));
      
      finishTestUI("✅ Test completato con successo!");
    } catch (err: any) {
      const errMsg = formatError(err);
      console.error("Errore invio Cloud:", errMsg);
      
      // ANCHE SE C'È UN ERRORE DI FETCH, chiudiamo il test e avvisiamo l'utente che il dato è solo locale.
      finishTestUI(`⚠️ Test completato! Nota: il salvataggio Cloud è fallito (${errMsg}), i dati sono salvati solo localmente.`);
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
            <button onClick={() => setView('ADMIN_DASHBOARD')} className="w-full py-6 bg-white text-slate-900 font-bold rounded-3xl shadow-xl hover:bg-indigo-50 transition-all text-xl">ACCEDI ALLA DASHBOARD</button>
          </div>
        </div>
      )}

      {view === 'JUDGE_LOGIN' && (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 bg-gradient-to-b from-indigo-50 to-white">
          <div className="bg-white rounded-3xl p-10 shadow-2xl max-w-md w-full animate-in zoom-in duration-500">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-4 bg-indigo-100 rounded-2xl text-indigo-600">
                <ChefHat size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900">Assaggiatori</h2>
                <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Cabina di Assaggio</p>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Il tuo Nome</label>
                <input value={judgeName} onChange={e => setJudgeName(e.target.value)} placeholder="Inserisci il tuo nome..." className="w-full p-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-indigo-500 outline-none font-bold text-slate-800 transition-all" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Test Disponibili</label>
                <select value={activeTestId} onChange={e => setActiveTestId(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-indigo-500 outline-none font-bold text-slate-800 transition-all bg-white cursor-pointer">
                  <option value="">Scegli una sessione...</option>
                  {tests.filter(t => t.status === 'active').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <button disabled={!judgeName || !activeTestId} onClick={() => setView('JUDGE_RUNNER')} className="w-full py-5 bg-indigo-600 text-white font-black rounded-3xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 active:scale-95 transition-all text-lg"> INIZIA ASSAGGIO </button>
            </div>
          </div>
        </div>
      )}

      {view === 'JUDGE_RUNNER' && (
        <TestRunner 
          test={tests.find(t => t.id === activeTestId)!}
          judgeName={judgeName}
          onComplete={handleComplete}
          onExit={() => setView(isJudgeMode() ? 'JUDGE_LOGIN' : 'HOME')}
        />
      )}

      {view === 'ADMIN_DASHBOARD' && (
        <AdminDashboard 
          tests={tests}
          results={results}
          onCreateTest={handleCreateTest}
          onUpdateTest={handleUpdateTest}
          onDeleteTest={handleDeleteTest}
          onNavigate={() => setView('HOME')}
          peerId={peerId}
        />
      )}
    </div>
  );

  function isJudgeMode() {
    return new URLSearchParams(window.location.search).get('mode') === 'judge';
  }
};

export default App;