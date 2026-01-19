import React, { useState, useEffect } from 'react';
import { SensoryTest, TestType, JudgeResult } from './types';
import { AdminDashboard } from './components/AdminDashboard';
import { TestRunner } from './components/TestRunner';
import { supabase } from './components/supabaseClient';
import { Beaker } from 'lucide-react';

// --- LOGICA DI CONFORMITÀ DIN 10955 ---
const prepareTestForJudge = (test: SensoryTest): SensoryTest => {
  // Se la randomizzazione non è attiva o mancano prodotti, restituisci il test originale
  if (!test.config.randomizePresentation || !test.config.products || test.config.products.length < 2) {
    return test;
  }

  let randomizedProducts = [...test.config.products];

  // Se è un test triangolare, applica le 6 sequenze bilanciate DIN 10955
  if (test.type === 'TRIANGLE' || test.type === TestType.TRIANGLE) {
    const A = test.config.products[0];
    const B = test.config.products[1];
    
    // Le 6 combinazioni standard: ABB, AAB, ABA, BAA, BBA, BAB
    const sequences = [
      [A, B, B], [A, A, B], [A, B, A],
      [B, A, A], [B, B, A], [B, A, B]
    ];
    
    // Selezione casuale della triade
    const selectedSequence = sequences[Math.floor(Math.random() * sequences.length)];
    
    // Mappatura con ID univoci per React (necessario per evitare bug nei loop)
    randomizedProducts = selectedSequence.map((p, idx) => ({
      ...p,
      id: `${p.id}_seq_${idx}` 
    }));
  } else {
    // Per altri tipi di test (QDA, CATA, etc.), esegui uno shuffle semplice
    randomizedProducts = [...randomizedProducts].sort(() => Math.random() - 0.5);
  }

  return {
    ...test,
    config: {
      ...test.config,
      products: randomizedProducts
    }
  };
};

function App() {
  const [mode, setMode] = useState<'home' | 'admin' | 'judge'>('home');
  const [tests, setTests] = useState<SensoryTest[]>([]);
  const [results, setResults] = useState<JudgeResult[]>([]);
  const [loading, setLoading] = useState(true);

  // Caricamento dati da Supabase
  useEffect(() => {
    fetchData();
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'judge') setMode('judge');
    if (params.get('mode') === 'admin') setMode('admin');
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: testsData } = await supabase.from('tests').select('*');
      const { data: resultsData } = await supabase.from('results').select('*');
      
      if (testsData) setTests(testsData.map(t => ({ ...t, config: t.config as any })));
      if (resultsData) setResults(resultsData as any);
    } catch (error) {
      console.error('Errore nel caricamento dati:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTest = async (newTest: SensoryTest) => {
    const { error } = await supabase.from('tests').insert([newTest]);
    if (!error) fetchData();
  };

  const handleUpdateTest = async (updatedTest: SensoryTest) => {
    const { error } = await supabase.from('tests').update(updatedTest).eq('id', updatedTest.id);
    if (!error) fetchData();
  };

  const handleDeleteTest = async (testId: string) => {
    const { error } = await supabase.from('tests').delete().eq('id', testId);
    if (!error) fetchData();
  };

  const handleSubmitResults = async (result: JudgeResult) => {
    const { error } = await supabase.from('results').insert([result]);
    if (!error) {
      fetchData();
      alert('Risultati inviati con successo!');
      setMode('home');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin text-indigo-600"> <Beaker size={48} /> </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      {mode === 'home' && (
        <div className="max-w-4xl mx-auto text-center mt-20">
          <div className="w-24 h-24 bg-indigo-600 rounded-[32px] flex items-center justify-center text-white mx-auto mb-8 shadow-2xl rotate-3">
            <Beaker size={48} />
          </div>
          <h1 className="text-6xl font-black tracking-tighter mb-4 text-slate-900">Sensory<span className="text-indigo-600">Lab</span></h1>
          <p className="text-xl text-slate-500 font-medium mb-12">Piattaforma professionale per l'analisi sensoriale conforme DIN 10955.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button 
              onClick={() => setMode('admin')}
              className="p-8 bg-white rounded-[40px] border-2 border-slate-100 hover:border-indigo-600 transition-all group text-left"
            >
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                <span className="font-bold">A</span>
              </div>
              <h3 className="text-2xl font-black mb-2">Panel Leader</h3>
              <p className="text-slate-500 font-bold text-sm">Crea sessioni, gestisci attributi e analizza i risultati con AI.</p>
            </button>

            <button 
              onClick={() => setMode('judge')}
              className="p-8 bg-indigo-600 rounded-[40px] text-white hover:bg-indigo-700 transition-all shadow-2xl shadow-indigo-200 text-left"
            >
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-6">
                <span className="font-bold">J</span>
              </div>
              <h3 className="text-2xl font-black mb-2">Panelista</h3>
              <p className="text-indigo-100 font-bold text-sm">Partecipa alle sessioni di assaggio attive e invia i tuoi giudizi.</p>
            </button>
          </div>
        </div>
      )}

      {mode === 'admin' && (
        <AdminDashboard 
          tests={tests}
          results={results}
          onCreateTest={handleCreateTest}
          onUpdateTest={handleUpdateTest}
          onDeleteTest={handleDeleteTest}
          onNavigate={() => setMode('home')}
        />
      )}

      {mode === 'judge' && (
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-10">
            <button onClick={() => setMode('home')} className="text-slate-400 font-black tracking-widest text-xs uppercase">Esci</button>
            <div className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-black uppercase tracking-widest">Sessione Assaggio</div>
          </div>
          
          {tests.filter(t => t.status === 'active').length > 0 ? (
            <div className="space-y-6">
              {tests.filter(t => t.status === 'active').map(test => (
                <div key={test.id} className="bg-white p-2 rounded-[40px] shadow-sm border border-slate-100 overflow-hidden">
                  {/* Il test viene passato alla funzione prepareTestForJudge per applicare la DIN 10955 prima di essere visualizzato */}
                  <TestRunner 
                    test={prepareTestForJudge(test)} 
                    onSubmit={handleSubmitResults} 
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-white rounded-[40px] border-2 border-dashed border-slate-200">
              <p className="text-slate-400 font-bold uppercase tracking-widest">Nessuna sessione attiva al momento</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;