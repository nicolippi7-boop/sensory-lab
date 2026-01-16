import React, { useState, useEffect } from 'react';
import { supabase } from './components/supabaseClient';
import { TestRunner } from './components/TestRunner';
import { TestType } from './types';
import type { SensoryTest, JudgeResult } from './types';
import { 
  Beaker, 
  ClipboardList, 
  Plus, 
  ChevronRight, 
  Database, 
  User, 
  LogOut, 
  Trash2, 
  BarChart3,
  RefreshCw
} from 'lucide-react';

function App() {
  const [tests, setTests] = useState<SensoryTest[]>([]);
  const [results, setResults] = useState<JudgeResult[]>([]);
  const [viewingTest, setViewingTest] = useState<SensoryTest | null>(null);
  const [judgeName, setJudgeName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // --- CARICAMENTO DATI DA SUPABASE ---
  const fetchData = async () => {
    setIsLoading(true);
    try {
      // 1. Carica i Test
      const { data: testsData, error: testsError } = await supabase
        .from('tests')
        .select('*');
      if (testsError) throw testsError;

      // 2. Carica i Risultati (Sincronizzazione Cloud)
      const { data: resData, error: resError } = await supabase
        .from('results')
        .select('*')
        .order('created_at', { ascending: false });
      if (resError) throw resError;

      if (testsData) setTests(testsData);
      
      if (resData) {
        // Trasforma il formato DB nel formato dell'app
        const formattedResults = resData.map(r => ({
          ...(r.responses as any),
          id: r.id,
          testId: r.test_id,
          judgeName: r.judge_name,
          submittedAt: r.created_at
        }));
        setResults(formattedResults);
      }
    } catch (err) {
      console.error("Errore caricamento dati:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleTestComplete = async (result: JudgeResult) => {
    try {
      const { error } = await supabase
        .from('results')
        .insert([
          {
            test_id: result.testId,
            judge_name: result.judgeName,
            responses: result // Salvataggio universale in formato JSON
          }
        ]);

      if (error) throw error;

      // Reset stato e ricarica dati per vedere il nuovo risultato
      setViewingTest(null);
      setJudgeName('');
      alert('Risultati inviati con successo al database!');
      fetchData(); 
    } catch (err) {
      console.error('Errore durante il salvataggio:', err);
      alert('Errore di connessione al database.');
    }
  };

  const deleteResult = async (id: string) => {
    if (!window.confirm('Vuoi eliminare questo risultato?')) return;
    try {
      const { error } = await supabase.from('results').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      alert('Errore durante l\'eliminazione');
    }
  };

  if (viewingTest) {
    if (!judgeName) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-[32px] shadow-2xl max-w-md w-full border border-slate-100">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mb-6 mx-auto shadow-lg">
              <User size={32} />
            </div>
            <h2 className="text-3xl font-black text-slate-900 text-center mb-2">Benvenuto</h2>
            <p className="text-slate-500 text-center mb-8 font-medium">Inserisci il tuo nome per iniziare il test</p>
            <input 
              type="text" 
              value={judgeName} 
              onChange={(e) => setJudgeName(e.target.value)}
              className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl mb-6 focus:border-indigo-600 outline-none font-bold text-slate-700 transition-all"
              placeholder="Il tuo nome e cognome"
            />
            <div className="flex gap-3">
              <button 
                onClick={() => setViewingTest(null)}
                className="flex-1 py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors"
              >
                Annulla
              </button>
              <button 
                onClick={() => { if(judgeName.trim()) setJudgeName(judgeName.trim()) }}
                className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 shadow-xl transition-all"
              >
                INIZIA ORA
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <TestRunner 
        test={viewingTest} 
        judgeName={judgeName} 
        onComplete={handleTestComplete}
        onExit={() => { setViewingTest(null); setJudgeName(''); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* HEADER */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-xl">
              <Beaker className="text-white" size={24} />
            </div>
            <span className="text-xl font-black text-slate-900 tracking-tighter">SENSORY<span className="text-indigo-600">LAB</span></span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={fetchData} 
              className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
              title="Sincronizza dati"
            >
              <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button 
              onClick={() => setIsAdmin(!isAdmin)}
              className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${isAdmin ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {isAdmin ? 'Esci Admin' : 'Area Admin'}
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-6 md:p-12">
        {isAdmin ? (
          <div className="space-y-12">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tight">Dashboard Risultati</h2>
                <p className="text-slate-500 font-medium">Monitora i test in tempo reale da tutti i dispositivi</p>
              </div>
              <div className="bg-white px-6 py-3 rounded-2xl border border-slate-200 shadow-sm">
                <span className="text-slate-400 text-xs font-black uppercase tracking-widest block">Totale Risposte</span>
                <span className="text-2xl font-black text-indigo-600">{results.length}</span>
              </div>
            </div>

            <div className="bg-white rounded-[32px] border border-slate-200 shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Giudice</th>
                      <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Test</th>
                      <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Data</th>
                      <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Dettagli</th>
                      <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {results.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-8 py-12 text-center text-slate-400 font-medium italic">Nessun risultato trovato nel cloud.</td>
                      </tr>
                    ) : (
                      results.map((res) => {
                        const test = tests.find(t => t.id === res.testId);
                        return (
                          <tr key={res.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-8 py-5 font-bold text-slate-900">{res.judgeName}</td>
                            <td className="px-8 py-5">
                              <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-black uppercase tracking-wider">
                                {test?.name || 'Test Eliminato'}
                              </span>
                            </td>
                            <td className="px-8 py-5 text-slate-500 text-sm">
                              {new Date(res.submittedAt).toLocaleString('it-IT')}
                            </td>
                            <td className="px-8 py-5">
                              <div className="text-xs font-mono text-slate-400 max-w-[200px] truncate">
                                {res.selection || res.triangleSelection || 'Dati complessi...'}
                              </div>
                            </td>
                            <td className="px-8 py-5">
                              <button 
                                onClick={() => deleteResult(res.id)}
                                className="text-red-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 size={18} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            <div className="text-center max-w-2xl mx-auto">
              <h2 className="text-5xl font-black text-slate-900 tracking-tight mb-4">Sessioni Disponibili</h2>
              <p className="text-lg text-slate-500 font-medium">Seleziona il test che ti è stato assegnato per iniziare la valutazione sensoriale.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {tests.map(test => (
                <div 
                  key={test.id} 
                  className="group bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm hover:shadow-2xl hover:border-indigo-200 transition-all cursor-pointer relative overflow-hidden"
                  onClick={() => setViewingTest(test)}
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 group-hover:bg-indigo-600 transition-colors duration-500" />
                  
                  <div className="relative z-10">
                    <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-6 group-hover:bg-white transition-colors shadow-sm">
                      <ClipboardList size={28} />
                    </div>
                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-2 block group-hover:text-white/80 transition-colors">
                      {test.type.replace('_', ' ')}
                    </span>
                    <h3 className="text-2xl font-black text-slate-900 mb-4 group-hover:text-white transition-colors">{test.name}</h3>
                    <div className="flex items-center text-slate-400 group-hover:text-white/60 font-bold text-sm transition-colors">
                      Inizia Test <ChevronRight size={18} className="ml-1 group-hover:translate-x-2 transition-transform" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;