import React, { useState, useRef, useMemo } from 'react';
import { TestType } from '../types';
import type { SensoryTest, Product, Attribute, TestConfig, JudgeResult } from '../types';
import { suggestAttributes, analyzeResults } from '../services/geminiService';
import { Plus, BarChart2, Wand2, Loader2, ArrowLeft, StopCircle, Download, Pencil, Trash2, Save, QrCode, X, Copy, Check, Wifi, Layers, Activity, Shuffle, RefreshCw, AlertCircle } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { supabase } from './supabaseClient';
import * as XLSX from 'xlsx';

interface AdminDashboardProps {
  tests: SensoryTest[];
  results: JudgeResult[];
  onCreateTest: (test: SensoryTest) => void;
  onUpdateTest: (test: SensoryTest) => void;
  onDeleteTest: (testId: string) => void;
  onNavigate: () => void;
  peerId?: string;
}

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

const SlideToDelete = ({ onDelete }: { onDelete: () => void }) => {
  const [value, setValue] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const valueRef = useRef(0);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setValue(val);
    valueRef.current = val;
    setIsDragging(true);
  };
  const handleRelease = () => {
    setIsDragging(false);
    if (valueRef.current > 90) {
      onDelete();
      setTimeout(() => { setValue(0); valueRef.current = 0; }, 100);
    } else { setValue(0); valueRef.current = 0; }
  };
  return (
    <div className="relative w-36 h-9 bg-slate-100 rounded-full overflow-hidden flex items-center select-none group border border-slate-200 shadow-inner" onClick={(e) => e.stopPropagation()}>
      <div className={`absolute left-0 top-0 bottom-0 bg-red-500 transition-all ease-out ${!isDragging ? 'duration-300' : 'duration-0'}`} style={{ width: `${value}%`, opacity: value > 5 ? 1 : 0 }} />
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider text-slate-400 pointer-events-none mix-blend-hard-light">{value > 85 ? 'Rilascia!' : 'Elimina'}</div>
      <div className="absolute top-1 bottom-1 w-7 bg-white rounded-full shadow-md flex items-center justify-center pointer-events-none transition-all ease-out" style={{ left: `calc(${value}% - ${value * 0.28}px + 4px)` }}>
        <Trash2 size={14} className={value > 85 ? "text-red-600 animate-bounce" : "text-slate-400"} />
      </div>
      <input type="range" min="0" max="100" step="1" value={value} onChange={handleChange} onPointerUp={handleRelease} className="absolute inset-0 w-full h-full opacity-0 cursor-grab active:cursor-grabbing z-20" />
    </div>
  );
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ tests, results, onCreateTest, onUpdateTest, onDeleteTest, onNavigate, peerId }) => {
  const [view, setView] = useState<'LIST' | 'CREATE' | 'DETAIL'>('LIST');
  const [selectedTest, setSelectedTest] = useState<SensoryTest | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [newTestName, setNewTestName] = useState('');
  const [newTestType, setNewTestType] = useState<TestType>(TestType.QDA);
  const [randomize, setRandomize] = useState(false);
  const [correctAnswerCode, setCorrectAnswerCode] = useState('');
  const [products, setProducts] = useState<Product[]>([{ id: '1', name: 'Campione A', code: '101' }, { id: '2', name: 'Campione B', code: '254' }]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);

  const [attrName, setAttrName] = useState('');
  const [attrDesc, setAttrDesc] = useState('');
  const [attrMin, setAttrMin] = useState('Debole');
  const [attrMax, setAttrMax] = useState('Forte');
  const [attrScale, setAttrScale] = useState<'linear' | 'likert5' | 'likert7' | 'likert9'>('linear');
  const [attrRefValue, setAttrRefValue] = useState<string>('');
  const [attrRefLabel, setAttrRefLabel] = useState<string>('');

  const [aiLoading, setAiLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [productDescForAi, setProductDescForAi] = useState('');

  const baseUrl = typeof window !== 'undefined' ? window.location.href.split('?')[0] : '';
  const inviteLink = peerId ? `${baseUrl}?mode=judge&host=${peerId}` : `${baseUrl}?mode=judge`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inviteLink)}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    if (!newTestName) return alert("Inserisci un nome.");
    const testConfig: TestConfig = {
      instructions: getDefaultInstructions(newTestType),
      products,
      attributes,
      durationSeconds: (newTestType === TestType.TDS || newTestType === TestType.TIME_INTENSITY) ? 60 : undefined,
      randomizePresentation: randomize,
      correctOddSampleCode: (newTestType === TestType.TRIANGLE || newTestType === TestType.PAIRED_COMPARISON) ? correctAnswerCode : undefined
    };

    const testData: SensoryTest = {
      id: editingId || generateId(),
      name: newTestName,
      type: newTestType,
      createdAt: editingId ? (tests.find(t => t.id === editingId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
      status: 'active',
      config: testConfig
    };

    if (editingId) onUpdateTest(testData);
    else onCreateTest(testData);

    resetForm();
    setView('LIST');
  };

  const resetForm = () => {
    setEditingId(null); setNewTestName(''); setNewTestType(TestType.QDA); setRandomize(false);
    setProducts([{ id: '1', name: 'Campione A', code: '101' }, { id: '2', name: 'Campione B', code: '254' }]);
    setAttributes([]); resetAttrInput(); setCorrectAnswerCode(''); setProductDescForAi('');
  };

  const resetAttrInput = () => { setAttrName(''); setAttrDesc(''); setAttrMin('Debole'); setAttrMax('Forte'); setAttrScale('linear'); setAttrRefValue(''); setAttrRefLabel(''); };

  const handleAddAttribute = () => {
    if (!attrName.trim()) return;
    setAttributes([...attributes, {
      id: generateId(),
      name: attrName.trim(),
      description: attrDesc.trim(),
      leftAnchor: attrMin,
      rightAnchor: attrMax,
      scaleType: attrScale,
      referenceValue: attrRefValue !== '' ? Number(attrRefValue) : undefined,
      referenceLabel: attrRefLabel.trim() || undefined
    }]);
    resetAttrInput();
  };

  const handleAiSuggest = async () => {
    if (!productDescForAi) return;
    setAiLoading(true);
    const suggestions = await suggestAttributes(productDescForAi);
    const newAttrs: Attribute[] = suggestions.map(name => ({ id: generateId(), name, category: 'taste', scaleType: 'linear', leftAnchor: 'Debole', rightAnchor: 'Forte', description: '' } as Attribute));
    setAttributes([...attributes, ...newAttrs]);
    setAiLoading(false);
  };

  const getDefaultInstructions = (type: TestType): string => {
    switch (type) {
      case TestType.TRIANGLE: return "Seleziona il campione diverso tra i tre presentati.";
      case TestType.QDA: return "Valuta l'intensità di ogni attributo sulla scala indicata.";
      case TestType.TDS: return "Seleziona l'attributo dominante nel tempo.";
      case TestType.NAPPING: return "Posiziona i campioni sulla mappa in base alla loro somiglianza.";
      case TestType.SORTING: return "Raggruppa i campioni simili assegnando lo stesso nome di gruppo.";
      default: return "Assaggia e valuta i campioni seguendo le istruzioni.";
    }
  };

  const handleResetResults = async (test: SensoryTest) => {
    const count = results.filter(r => r.testId === test.id).length;
    if (count === 0) return alert("Nessun risultato da cancellare.");
    if (window.confirm(`⚠️ SEI SICURO? Vuoi cancellare tutte le ${count} risposte per "${test.name}"?`)) {
      try {
        const { error } = await supabase.from('results').delete().eq('test_id', test.id);
        if (error) throw error;
        alert("✅ Risultati azzerati.");
        onUpdateTest(test);
      } catch (err: any) { alert("Errore: " + err.message); }
    }
  };

  const handleExportExcel = (test: SensoryTest) => {
    const testResults = results.filter(r => r.testId === test.id);
    if (testResults.length === 0) return alert("Nessun dato disponibile.");
    const data: any[] = [];

    testResults.forEach(res => {
      const common = { Giudice: res.judgeName, Data: new Date(res.submittedAt).toLocaleString(), Test: test.name, Tipo: test.type };

      if (test.type === TestType.TRIANGLE) {
        data.push({
          ...common,
          'Campione Scelto': res.triangleSelection || '-',
          'Risposta Corretta': test.config.correctOddSampleCode || 'N/D',
          'Esito': res.triangleSelection === test.config.correctOddSampleCode ? 'CORRETTO' : 'ERRATO',
          'Certezza (DIN)': res.certainty === 'differenza_chiara' ? 'Differenza Chiara' : 'Scelta Forzata',
          'Intensità Odore (0-4)': res.odorScore ?? 0,
          'Intensità Sapore (0-4)': res.flavorScore ?? 0,
          'Descrizione Differenza': res.differenceDescription || ''
        });
      } else if (test.type === TestType.QDA) {
        test.config.products.forEach(prod => {
          const row: any = { ...common, Prodotto: prod.name, Codice: prod.code };
          test.config.attributes.forEach(attr => {
            row[attr.name] = res.qdaRatings?.[`${prod.code}_${attr.id}`] || 0;
          });
          data.push(row);
        });
      } else {
        data.push({ ...common, Risposta: JSON.stringify(res) });
      }
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dati");
    XLSX.writeFile(wb, `Report_${test.name.replace(/\s+/g, '_')}.xlsx`);
  };

  const getChartData = (test: SensoryTest) => {
    const testResults = results.filter(r => r.testId === test.id);
    if (testResults.length === 0) return [];
    if (test.type === TestType.TRIANGLE) return [];

    return test.config.attributes.map(attr => {
      const item: any = { attribute: attr.name };
      test.config.products.forEach(prod => {
        let sum = 0, count = 0;
        testResults.forEach(res => {
          const val = res.qdaRatings?.[`${prod.code}_${attr.id}`] || 0;
          if (val > 0) { sum += val; count++; }
        });
        item[prod.name] = count > 0 ? parseFloat((sum / count).toFixed(2)) : 0;
      });
      if (attr.referenceValue !== undefined) item['Riferimento'] = attr.referenceValue;
      return item;
    });
  };

  const dinStats = useMemo(() => {
    if (!selectedTest || selectedTest.type !== TestType.TRIANGLE) return null;
    const res = results.filter(r => r.testId === selectedTest.id);
    if (res.length === 0) return null;

    const correct = res.filter(r => r.triangleSelection === selectedTest.config.correctOddSampleCode).length;
    const avgOdor = res.reduce((acc, curr) => acc + (curr.odorScore || 0), 0) / res.length;
    const avgFlavor = res.reduce((acc, curr) => acc + (curr.flavorScore || 0), 0) / res.length;
    const clearDiff = res.filter(r => r.certainty === 'differenza_chiara').length;

    return { 
      total: res.length, 
      correct, 
      percCorrect: ((correct / res.length) * 100).toFixed(1),
      avgOdor: avgOdor.toFixed(2), 
      avgFlavor: avgFlavor.toFixed(2),
      clearDiffPerc: ((clearDiff / res.length) * 100).toFixed(1)
    };
  }, [selectedTest, results]);

  const handleAnalyze = async (test: SensoryTest) => {
    setAnalysisLoading(true);
    const testResults = results.filter(r => r.testId === test.id);
    let summary = `Analisi test "${test.name}" (${test.type}). Risposte: ${testResults.length}.`;
    
    if (test.type === TestType.TRIANGLE && dinStats) {
      summary += ` Corrette: ${dinStats.percCorrect}%. Media Intensità Odore: ${dinStats.avgOdor}, Sapore: ${dinStats.avgFlavor}. Differenza chiara nel ${dinStats.clearDiffPerc}% dei casi.`;
    }

    const analysis = await analyzeResults(test.name, test.type, summary);
    setAiAnalysis(analysis);
    setAnalysisLoading(false);
  };

  const handleEditClick = (test: SensoryTest) => {
    setEditingId(test.id); setNewTestName(test.name); setNewTestType(test.type);
    setProducts(test.config.products); setAttributes(test.config.attributes);
    setRandomize(test.config.randomizePresentation || false);
    setCorrectAnswerCode(test.config.correctOddSampleCode || '');
    setView('CREATE');
  };

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {/* MODALE INVITO */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowInviteModal(false)}>
          <div className="bg-white rounded-[40px] p-10 max-w-md w-full shadow-2xl relative animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowInviteModal(false)} className="absolute top-6 right-6 text-slate-300 hover:text-slate-600 transition-colors"> <X size={28} /> </button>
            <div className="text-center">
              <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 mx-auto mb-6"> <QrCode size={40} /> </div>
              <h3 className="text-3xl font-black mb-2 tracking-tighter">Invita Giudici</h3>
              <p className="text-slate-400 text-sm mb-8 font-medium">Scansiona il codice o copia il link</p>
              <div className="bg-slate-50 p-4 rounded-3xl mb-8 inline-block border-4 border-white shadow-sm">
                <img src={qrUrl} alt="QR Code" className="w-48 h-48" />
              </div>
              <div className="flex items-center gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-100 mb-4">
                <p className="text-[10px] truncate flex-1 text-left font-mono font-bold text-slate-400">{inviteLink}</p>
                <button onClick={handleCopyLink} className="text-indigo-600 p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all"> {copied ? <Check size={20} /> : <Copy size={20} />} </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === 'CREATE' ? (
        <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4">
          <button onClick={() => setView('LIST')} className="flex items-center gap-2 text-slate-400 mb-8 hover:text-indigo-600 font-black transition-colors uppercase text-xs tracking-widest"> <ArrowLeft size={18} /> Torna alla lista </button>
          <h2 className="text-5xl font-black text-slate-900 mb-10 tracking-tighter">{editingId ? 'Modifica Sessione' : 'Nuovo Progetto'}</h2>
          
          <div className="space-y-10 bg-white p-10 rounded-[50px] shadow-xl border border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Nome del Test</label>
                <input className="w-full p-5 bg-slate-50 border-2 border-transparent rounded-3xl outline-none focus:border-indigo-500 focus:bg-white font-bold transition-all text-lg" value={newTestName} onChange={e => setNewTestName(e.target.value)} placeholder="es. Profilo Aroma Caffè" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Metodologia</label>
                <select className="w-full p-5 bg-slate-50 border-2 border-transparent rounded-3xl outline-none focus:border-indigo-500 focus:bg-white font-bold transition-all text-lg appearance-none" value={newTestType} onChange={e => setNewTestType(e.target.value as TestType)}>
                  <option value={TestType.TRIANGLE}>Test Triangolare (DIN 10955)</option>
                  <option value={TestType.QDA}>Profilo Descrittivo (QDA)</option>
                  <option value={TestType.CATA}>CATA (Check-all-that-apply)</option>
                  <option value={TestType.PAIRED_COMPARISON}>Confronto a Coppie</option>
                  <option value={TestType.NAPPING}>Napping (Mappa Proiettiva)</option>
                  <option value={TestType.SORTING}>Sorting (Raggruppamento)</option>
                </select>
              </div>
            </div>

            {/* RANDOMIZZAZIONE */}
            <div className="flex items-center justify-between p-6 bg-indigo-50/50 rounded-3xl border-2 border-indigo-100/50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-100 rounded-2xl text-indigo-600"> <Shuffle size={20} /> </div>
                <div>
                  <h4 className="font-black text-indigo-900 text-sm">Randomizzazione Bilanciata</h4>
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">L'ordine dei campioni varia per ogni panelista.</p>
                </div>
              </div>
              <button onClick={() => setRandomize(!randomize)} className={`w-16 h-9 rounded-full transition-all relative ${randomize ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                <div className={`absolute top-1.5 w-6 h-6 bg-white rounded-full shadow-md transition-all ${randomize ? 'left-8' : 'left-1.5'}`} />
              </button>
            </div>

            {/* RISPOSTA CORRETTA (Per Triangolare) */}
            {(newTestType === TestType.TRIANGLE || newTestType === TestType.PAIRED_COMPARISON) && (
              <div className="bg-amber-50 p-8 rounded-[32px] border border-amber-100 animate-in zoom-in-95">
                <div className="flex items-center gap-3 mb-4">
                  <Target className="text-amber-600" size={20} />
                  <label className="block text-xs font-black text-amber-700 uppercase tracking-widest">Codice Campione Diverso (Target)</label>
                </div>
                <input className="w-full p-5 bg-white border-2 border-amber-200 rounded-2xl outline-none focus:border-amber-500 font-black font-mono text-2xl tracking-widest text-amber-700 transition-all text-center" value={correctAnswerCode} onChange={e => setCorrectAnswerCode(e.target.value)} placeholder="000" />
              </div>
            )}

            {/* CAMPIONI */}
            <div>
              <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3"> <Layers className="text-indigo-500" /> Campioni in Test</h3>
              <div className="grid grid-cols-1 gap-4">
                {products.map((p, idx) => (
                  <div key={p.id} className="flex gap-4 items-center bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <input className="flex-1 p-4 bg-white rounded-xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none transition-all" value={p.name} onChange={(e) => { const n = [...products]; n[idx].name = e.target.value; setProducts(n); }} placeholder="Nome Prodotto" />
                    <input className="w-32 p-4 bg-white rounded-xl text-center font-black font-mono border-2 border-transparent focus:border-indigo-500 outline-none transition-all" value={p.code} onChange={(e) => { const n = [...products]; n[idx].code = e.target.value; setProducts(n); }} placeholder="Codice" />
                    <button onClick={() => setProducts(products.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-500 p-2 transition-colors"> <Trash2 size={24} /> </button>
                  </div>
                ))}
                <button onClick={() => setProducts([...products, { id: generateId(), name: '', code: '' }])} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-bold hover:border-indigo-300 hover:text-indigo-500 transition-all flex items-center justify-center gap-2"> <Plus size={18} /> Aggiungi Prodotto </button>
              </div>
            </div>

            {/* ATTRIBUTI (Solo se non Triangolare) */}
            {newTestType !== TestType.TRIANGLE && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black text-slate-800 flex items-center gap-3"> <Activity className="text-indigo-500" /> Descrittori Sensoriali</h3>
                  <div className="flex gap-2">
                    <input className="p-3 text-xs border-2 border-slate-100 rounded-xl w-48 font-medium focus:border-indigo-300 outline-none" placeholder="Prompt AI..." value={productDescForAi} onChange={e => setProductDescForAi(e.target.value)} />
                    <button onClick={handleAiSuggest} disabled={aiLoading || !productDescForAi} className="px-5 py-3 bg-purple-600 text-white rounded-xl text-xs font-black flex items-center gap-2 hover:bg-purple-700 transition-all shadow-lg"> {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />} Genera Descrittori </button>
                  </div>
                </div>
                
                <div className="bg-slate-50 p-8 rounded-[32px] border-2 border-slate-100 mb-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Nome Descrittore</label>
                      <input className="w-full p-4 bg-white rounded-xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none transition-all" placeholder="es. Sapidità" value={attrName} onChange={e => setAttrName(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Ancora Min</label>
                      <input className="w-full p-4 bg-white rounded-xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none transition-all" placeholder="Nulla" value={attrMin} onChange={e => setAttrMin(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Ancora Max</label>
                      <input className="w-full p-4 bg-white rounded-xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none transition-all" placeholder="Molto" value={attrMax} onChange={e => setAttrMax(e.target.value)} />
                    </div>
                  </div>
                  <button onClick={handleAddAttribute} disabled={!attrName.trim()} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-indigo-600 transition-all shadow-xl disabled:opacity-30"> AGGIUNGI ALLA LISTA </button>
                </div>

                <div className="flex flex-wrap gap-3">
                  {attributes.map((attr, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl border-2 border-slate-100 shadow-sm animate-in slide-in-from-left-2">
                      <div className="text-left">
                        <div className="font-black text-slate-800 text-sm leading-none mb-1">{attr.name}</div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{attr.leftAnchor} → {attr.rightAnchor}</div>
                      </div>
                      <button onClick={() => setAttributes(attributes.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-500 transition-colors"> <X size={18} /> </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-10 border-t-2 border-slate-50 flex justify-end">
              <button onClick={handleSave} className="px-12 py-5 bg-indigo-600 text-white font-black rounded-3xl shadow-2xl hover:bg-indigo-700 transition-all active:scale-95 flex items-center gap-4 text-xl"> <Save size={28} /> SALVA PROGETTO </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-end mb-12">
            <div>
              <button onClick={onNavigate} className="flex items-center gap-2 text-slate-400 mb-3 font-black hover:text-slate-800 uppercase text-xs tracking-widest"> <ArrowLeft size={16} /> Dashboard Principale </button>
              <h1 className="text-6xl font-black text-slate-900 tracking-tighter">Pannello Leader</h1>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setShowInviteModal(true)} className="bg-white px-8 py-5 border-2 border-slate-100 rounded-3xl font-black flex items-center gap-3 shadow-sm hover:shadow-md transition-all active:scale-95"> <QrCode size={24} /> INVITA </button>
              <button onClick={() => { resetForm(); setView('CREATE'); }} className="bg-indigo-600 px-8 py-5 text-white rounded-3xl font-black shadow-2xl flex items-center gap-3 hover:bg-indigo-700 transition-all active:scale-95"> <Plus size={28} /> NUOVO TEST </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {tests.map(test => (
              <div key={test.id} className="bg-white p-8 rounded-[45px] border border-slate-100 shadow-sm hover:shadow-2xl transition-all relative overflow-hidden group">
                <div className="flex justify-between items-start mb-6">
                  <span className="px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest">{test.type}</span>
                  <button onClick={() => onUpdateTest({...test, status: test.status === 'active' ? 'closed' : 'active'})} className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all ${test.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
                    {test.status === 'active' ? <><Wifi size={14} className="animate-pulse" /> APERTO</> : <><StopCircle size={14}/> CHIUSO</>}
                  </button>
                </div>
                <h3 className="text-3xl font-black text-slate-900 mb-10 leading-none tracking-tighter group-hover:text-indigo-600 transition-colors">{test.name}</h3>
                
                <div className="flex items-center gap-2 border-t-2 border-slate-50 pt-6">
                  <button onClick={() => { setSelectedTest(test); setView('DETAIL'); setAiAnalysis(null); }} className="flex-1 py-4 bg-slate-50 text-slate-900 font-black hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl flex items-center justify-center gap-2 transition-all"> <BarChart2 size={20}/> ANALISI</button>
                  <button onClick={() => handleResetResults(test)} className="p-4 text-amber-500 hover:bg-amber-50 rounded-2xl transition-all" title="Reset Dati"> <RefreshCw size={22}/> </button>
                  <button onClick={() => handleExportExcel(test)} className="p-4 text-emerald-600 hover:bg-emerald-50 rounded-2xl transition-all"> <Download size={22}/> </button>
                  <button onClick={() => handleEditClick(test)} className="p-4 text-slate-300 hover:text-indigo-600 rounded-2xl transition-all"> <Pencil size={20}/> </button>
                  <SlideToDelete onDelete={() => onDeleteTest(test.id)} />
                </div>
              </div>
            ))}
          </div>

          {/* DETTAGLIO ANALISI */}
          {view === 'DETAIL' && selectedTest && (
            <div className="mt-16 bg-white p-12 rounded-[60px] shadow-2xl border border-slate-100 animate-in slide-in-from-bottom-8">
              <div className="flex justify-between items-center mb-12">
                <div>
                  <div className="flex items-center gap-4 mb-2">
                    <span className="px-4 py-1.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-black uppercase tracking-widest">{selectedTest.type}</span>
                    <h2 className="text-5xl font-black text-slate-900 tracking-tighter">{selectedTest.name}</h2>
                  </div>
                  <p className="text-slate-400 font-bold ml-1">Analisi dei risultati degli assaggiatori</p>
                </div>
                <button onClick={() => setView('LIST')} className="bg-slate-100 p-4 rounded-full text-slate-400 hover:text-slate-900 transition-all"> <X size={32} /> </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-8">
                  {/* SEZIONE DIN 10955 PER TRIANGOLARE */}
                  {selectedTest.type === TestType.TRIANGLE && dinStats ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-emerald-50 p-8 rounded-[40px] border border-emerald-100">
                        <div className="flex items-center gap-4 mb-6">
                          <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl"> <Check size={24} /> </div>
                          <h4 className="font-black text-emerald-900">Accuratezza Globale</h4>
                        </div>
                        <div className="text-6xl font-black text-emerald-600 mb-2">{dinStats.percCorrect}%</div>
                        <p className="text-emerald-700/60 font-bold uppercase text-[10px] tracking-widest">{dinStats.correct} risposte corrette su {dinStats.total}</p>
                      </div>
                      
                      <div className="bg-indigo-50 p-8 rounded-[40px] border border-indigo-100">
                        <div className="flex items-center gap-4 mb-6">
                          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl"> <Activity size={24} /> </div>
                          <h4 className="font-black text-indigo-900">Medie Intensità (DIN)</h4>
                        </div>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-indigo-900/50 uppercase text-[10px]">Odore</span>
                            <span className="text-2xl font-black text-indigo-600">{dinStats.avgOdor} <span className="text-xs text-indigo-300">/ 4</span></span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-indigo-900/50 uppercase text-[10px]">Sapore</span>
                            <span className="text-2xl font-black text-indigo-600">{dinStats.avgFlavor} <span className="text-xs text-indigo-300">/ 4</span></span>
                          </div>
                          <div className="pt-2 border-t border-indigo-100 flex justify-between items-center">
                            <span className="font-bold text-indigo-900/50 uppercase text-[10px]">Differenza Chiara</span>
                            <span className="text-xl font-black text-indigo-600">{dinStats.clearDiffPerc}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-[500px] bg-slate-50 rounded-[40px] p-8 border border-slate-100 shadow-inner">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={getChartData(selectedTest)}>
                          <PolarGrid stroke="#e2e8f0" />
                          <PolarAngleAxis dataKey="attribute" tick={{fill: '#94a3b8', fontSize: 11, fontWeight: '900'}} />
                          <PolarRadiusAxis domain={[0, 100]} />
                          {selectedTest.config.products.map((p, idx) => (
                            <Radar key={p.id} name={`${p.name} (${p.code})`} dataKey={p.name} stroke={idx === 0 ? "#4f46e5" : idx === 1 ? "#10b981" : "#f59e0b"} fill={idx === 0 ? "#4f46e5" : idx === 1 ? "#10b981" : "#f59e0b"} fillOpacity={0.15} strokeWidth={4} />
                          ))}
                          <Tooltip contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.1)', padding: '15px'}} />
                          <Legend wrapperStyle={{paddingTop: '20px'}} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* LOG QUALITATIVO PER TRIANGOLARE */}
                  {selectedTest.type === TestType.TRIANGLE && (
                    <div className="bg-white border-2 border-slate-50 rounded-[40px] p-8">
                       <h4 className="font-black text-slate-900 mb-6 flex items-center gap-2"> <AlertCircle size={20} className="text-indigo-500" /> Note degli Assaggiatori</h4>
                       <div className="space-y-3 max-h-60 overflow-y-auto pr-4 scrollbar-thin">
                          {results.filter(r => r.testId === selectedTest.id && r.differenceDescription).map((r, i) => (
                            <div key={i} className="p-4 bg-slate-50 rounded-2xl text-sm italic text-slate-600 border-l-4 border-indigo-500">
                               "{r.differenceDescription}"
                            </div>
                          ))}
                       </div>
                    </div>
                  )}
                </div>

                <div className="bg-gradient-to-br from-indigo-600 to-indigo-900 p-10 rounded-[50px] text-white shadow-2xl flex flex-col h-full relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl" />
                  <h3 className="font-black text-2xl mb-6 flex items-center gap-3 relative z-10"><Wand2 size={28} className="text-indigo-300" /> Gemini AI Insight</h3>
                  <div className="flex-1 overflow-y-auto text-indigo-100/90 text-sm whitespace-pre-line leading-relaxed relative z-10 font-medium pr-2 scrollbar-thin scrollbar-thumb-indigo-400">
                    {aiAnalysis || "L'intelligenza artificiale analizzerà le statistiche e i commenti per fornirti un report dettagliato sul profilo del prodotto."}
                  </div>
                  <button onClick={() => handleAnalyze(selectedTest)} disabled={analysisLoading} className="w-full mt-8 py-5 bg-white text-indigo-900 rounded-3xl font-black shadow-xl hover:bg-indigo-50 disabled:opacity-30 transition-all flex items-center justify-center gap-3 relative z-10 active:scale-95"> 
                    {analysisLoading ? <Loader2 size={24} className="animate-spin text-indigo-600" /> : <Wand2 size={24} className="text-indigo-600" />} {aiAnalysis ? "RIGENERA ANALISI" : "AVVIA INTELLIGENZA"} 
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};