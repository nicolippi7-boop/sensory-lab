import React, { useState, useEffect, useRef } from 'react';
import type { SensoryTest, JudgeResult, ViewState } from './types';
import { SessionProvider, useUserId, useSession } from './contexts/SessionContext';
import { AdminDashboard } from './components/AdminDashboard';
import { TestRunner } from './components/TestRunner';
import { AuthPage } from './components/AuthPage';
import { ChefHat, RefreshCw } from 'lucide-react';
import './styles/slider.css';
// @ts-ignore
import { Peer } from 'peerjs';
import {
  fetchUserTests,
  createUserTest,
  updateUserTest,
  deleteUserTest,
  fetchTestResults,
  submitTestResult
} from './services/isolatedDataService';

const App: React.FC = () => {
  return (
    <SessionProvider>
      <AppContent />
    </SessionProvider>
  );
};

const AppContent: React.FC = () => {
  const userId = useUserId();
  const { isAuthenticated } = useSession();
  // --- LOGICA DI RECUPERO DAL LOCAL STORAGE ---
  const [view, setView] = useState<ViewState>(() => {
    // 1. Controlliamo se c'è una sessione salvata
    const savedView = localStorage.getItem('sensory_view');
    if (savedView === 'JUDGE_RUNNER') return 'JUDGE_RUNNER';

    // 2. Altrimenti controllo il parametro URL
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'judge' ? 'JUDGE_LOGIN' : 'HOME';
  });

  // Inizializziamo il nome e il test attivo recuperandoli se esistono
  const [judgeName, setJudgeName] = useState(() => localStorage.getItem('sensory_judge_name') || '');
  const [activeTestId, setActiveTestId] = useState(() => localStorage.getItem('sensory_active_test_id') || '');

  const [tests, setTests] = useState<SensoryTest[]>([]);
  const [results, setResults] = useState<JudgeResult[]>([]);
  const [peerId, setPeerId] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const peerRef = useRef<any>(null);

  // Check authentication
  if (!isAuthenticated()) {
    return <AuthPage onAuthSuccess={() => {}} />;
  }

  // Ensure userId exists
  if (!userId) {
    return <div className="min-h-screen flex items-center justify-center text-slate-600">Caricamento sessione...</div>;
  }

  // --- LOGICA DI SALVATAGGIO AUTOMATICO ---
  useEffect(() => {
    // Salviamo lo stato ogni volta che cambia
    if (view === 'JUDGE_RUNNER') {
      localStorage.setItem('sensory_view', view);
      localStorage.setItem('sensory_judge_name', judgeName);
      localStorage.setItem('sensory_active_test_id', activeTestId);
    }
  }, [view, judgeName, activeTestId]);

  const fetchAllData = async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      // Fetch user's tests using isolated service
      const testsData = await fetchUserTests(userId);
      setTests(testsData);

      // Fetch results for all user's tests
      const allResults: JudgeResult[] = [];
      for (const test of testsData) {
        try {
          const testResults = await fetchTestResults(test.id, userId);
          allResults.push(...testResults);
        } catch (err) {
          console.error(`Errore fetch risultati test ${test.id}:`, err);
        }
      }
      setResults(allResults);
    } catch (err) { 
      console.error("Errore fetch:", err); 
    } 
    finally { 
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

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;
    peer.on('open', (id: string) => setPeerId(id));
    return () => { if (peerRef.current) peerRef.current.destroy(); };
  }, []);

  const handleCreateTest = async (test: SensoryTest) => {
    try {
      setLoading(true);
      // Create test using isolated service with userId
      const newTest: Omit<SensoryTest, 'userId' | 'createdAt'> = {
        id: test.id,
        name: test.name,
        type: test.type,
        status: test.status,
        config: test.config
      };
      await createUserTest(newTest, userId);
      await fetchAllData();
    } catch (err) { 
      console.error(err);
      alert(`Errore creazione test: ${(err as any).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (res: JudgeResult) => {
    const isJudgeMode = new URLSearchParams(window.location.search).get('mode') === 'judge';
    try {
      setLoading(true);
      // Submit result using isolated service
      const resultToSubmit: Omit<JudgeResult, 'id' | 'userId'> = {
        testId: res.testId,
        testUserId: '', // Will be set by submitTestResult
        judgeName: res.judgeName,
        submittedAt: new Date().toISOString(),
        triangleSelection: res.triangleSelection,
        triangleResponse: res.triangleResponse,
        pairedSelection: res.pairedSelection,
        qdaRatings: res.qdaRatings,
        flashAttributes: res.flashAttributes,
        cataSelection: res.cataSelection,
        rataSelection: res.rataSelection,
        nappingData: res.nappingData,
        sortingGroups: res.sortingGroups,
        tdsLogs: res.tdsLogs,
        tdsStartTime: res.tdsStartTime,
        tdsEndTime: res.tdsEndTime,
        tiLogs: res.tiLogs,
        generalNotes: res.generalNotes,
        productNotes: res.productNotes
      };
      
      await submitTestResult(resultToSubmit, userId);
      await fetchAllData();
      
      // --- PULIZIA LOCAL STORAGE A FINE TEST ---
      localStorage.removeItem(`sensoryTest_${res.testId}_${res.judgeName}`);
      
      setView(isJudgeMode ? 'JUDGE_LOGIN' : 'HOME');
      setJudgeName(''); 
      setActiveTestId('');
      alert("✅ Test inviato!");
    } catch (err: any) { 
      console.error(err);
      alert(`Errore: ${err.message}`); 
    } finally {
      setLoading(false);
    }
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
              <input value={judgeName} onChange={e => setJudgeName(e.target.value)} placeholder="Tuo Nome" className="w-full p-5 bg-slate-50 rounded-2xl outline-none" />
              <select value={activeTestId} onChange={e => setActiveTestId(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl outline-none">
                <option value="">Seleziona Test...</option>
                {tests.filter(t => t.status === 'active').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button disabled={!judgeName || !activeTestId} onClick={() => setView('JUDGE_RUNNER')} className="w-full py-6 bg-indigo-600 text-white font-black rounded-3xl shadow-xl">ENTRA IN CABINA</button>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-xl p-12 rounded-[60px] max-w-md w-full border border-white/10 text-white">
            <h2 className="text-4xl font-black mb-8 tracking-tighter">Panel Leader</h2>
            <button onClick={() => setView('ADMIN_DASHBOARD')} className="w-full py-6 bg-white text-slate-900 font-bold rounded-3xl shadow-xl">ACCEDI DASHBOARD</button>
          </div>
        </div>
      )}

      {view === 'JUDGE_LOGIN' && (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-10 shadow-2xl max-w-md w-full">
            <h2 className="text-2xl font-black mb-6">Assaggiatori</h2>
            <div className="space-y-6">
              <input value={judgeName} onChange={e => setJudgeName(e.target.value)} placeholder="Il tuo Nome" className="w-full p-4 bg-slate-50 rounded-2xl outline-none" />
              <select value={activeTestId} onChange={e => setActiveTestId(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl outline-none">
                <option value="">Scegli una sessione...</option>
                {tests.filter(t => t.status === 'active').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button disabled={!judgeName || !activeTestId} onClick={() => setView('JUDGE_RUNNER')} className="w-full py-5 bg-indigo-600 text-white font-black rounded-3xl"> INIZIA </button>
            </div>
          </div>
        </div>
      )}

      {view === 'JUDGE_RUNNER' && activeTestId && tests.length > 0 && (
        <TestRunner 
          test={tests.find(t => t.id === activeTestId)!}
          judgeName={judgeName} 
          userId={userId}
          onComplete={handleComplete}
          onExit={() => {
            localStorage.removeItem(`sensoryTest_${activeTestId}_${judgeName}`);
            setView(new URLSearchParams(window.location.search).get('mode') === 'judge' ? 'JUDGE_LOGIN' : 'HOME');
          }}
        />
      )}

      {view === 'ADMIN_DASHBOARD' && (
        <AdminDashboard 
          tests={tests} 
          results={results} 
          onCreateTest={handleCreateTest}
          onUpdateTest={async (updated) => {
            try {
              setLoading(true);
              const updates: Partial<Omit<SensoryTest, 'id' | 'userId' | 'createdAt'>> = {
                name: updated.name,
                status: updated.status,
                config: updated.config,
                type: updated.type
              };
              await updateUserTest(updated.id, updates, userId);
              await fetchAllData();
            } catch (err) {
              console.error(err);
              alert(`Errore aggiornamento test: ${(err as any).message}`);
            } finally {
              setLoading(false);
            }
          }}
          onDeleteTest={async (id) => {
            try {
              setLoading(true);
              await deleteUserTest(id, userId);
              await fetchAllData();
            } catch (err) {
              console.error(err);
              alert(`Errore eliminazione test: ${(err as any).message}`);
            } finally {
              setLoading(false);
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