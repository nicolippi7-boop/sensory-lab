
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
        throw tError;
      }
      if (testsData) setTests(testsData);

      const { data: resultsData, error: rError } = await supabase.from('results').select('*');
      if (rError) {
        console.error("Errore fetch results:", formatError(rError));
        throw rError;
      }
      if (resultsData) setResults(resultsData);
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
    
    // 2. Funzione per pulire lo stato e tornare alla Home
    const finishTestUI = () => {
      setView('HOME');
      setJudgeName('');
      setActiveTestId('');
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
      
      finishTestUI();
      alert("✅ Test completato con successo e salvato nel cloud!");
    } catch (err: any) {
      const errMsg = formatError(err);
      console.error("Errore invio Cloud:", errMsg);
      
      // ANCHE SE C'È UN ERRORE DI FETCH (Supabase non configurata o rete assente), 
      // chiudiamo il test e avvisiamo l'utente che il dato è solo locale.
      finishTestUI();
      alert(`⚠️ Test completato, ma il salvataggio Cloud è fallito (${errMsg}). I dati sono stati salvati solo localmente.`);
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

      {view === 'JUDGE_RUNNER' && (
        <TestRunner 
          test={tests.find(t => t.id === activeTestId)!}
          judgeName={judgeName}
          onComplete={handleComplete}
          onExit={() => setView('HOME')}
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
};

export default App;
