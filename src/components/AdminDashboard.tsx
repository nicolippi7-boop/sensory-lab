import React, { useState, useRef } from 'react';
import { TestType } from '../types';
import type { SensoryTest, Product, Attribute, TestConfig, JudgeResult } from '../types';
import { suggestAttributes, analyzeResults } from '../services/geminiService';
import { Plus, BarChart2, Wand2, Loader2, ArrowLeft, StopCircle, Download, Pencil, Trash2, Save, QrCode, X, Copy, Check, Wifi, Layers, Activity, Target, Anchor, Shuffle, RefreshCw } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { supabase } from './supabaseClient'; // Assicurati che il percorso sia corretto
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

    if (editingId) {
        onUpdateTest(testData);
    } else {
        onCreateTest(testData);
    }

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
      switch(type) {
          case TestType.TRIANGLE: return "Seleziona il campione diverso.";
          case TestType.QDA: return "Valuta l'intensità di ogni attributo.";
          case TestType.TDS: return "Seleziona l'attributo dominante nel tempo.";
          case TestType.NAPPING: return "Posiziona i campioni sulla mappa sensoriale.";
          case TestType.SORTING: return "Raggruppa i campioni simili assegnando lo stesso nome di gruppo.";
          case TestType.TIME_INTENSITY: return "Traccia l'intensità dell'attributo nel tempo.";
          case TestType.CATA: return "Seleziona tutti i descrittori applicabili.";
          case TestType.RATA: return "Seleziona i descrittori e valuta l'intensità.";
          default: return "Assaggia e valuta i campioni.";
      }
  };

  const handleResetResults = async (test: SensoryTest) => {
    const count = results.filter(r => r.testId === test.id).length;
    if (count === 0) return alert("Nessun risultato da cancellare.");
    
    if(window.confirm(`⚠️ SEI SICURO? Vuoi cancellare tutte le ${count} risposte per "${test.name}"? Il test rimarrà configurato, ma perderai tutti i dati degli assaggiatori.`)) {
      try {
        const { error } = await supabase.from('results').delete().eq('test_id', test.id);
        if (error) throw error;
        alert("✅ Risultati azzerati con successo.");
        onUpdateTest(test); // Trigger refresh
      } catch (err: any) {
        alert("Errore durante la cancellazione: " + err.message);
      }
    }
  };

  const handleExportExcel = (test: SensoryTest) => {
    const testResults = results.filter(r => r.testId === test.id);
    if (testResults.length === 0) return alert("Nessun dato disponibile.");
    const data: any[] = [];
    testResults.forEach(res => {
      const commonHeaders = { Giudice: res.judgeName, Data_Invio: res.submittedAt, Test: test.name, Metodo: test.type };
      if (test.type === TestType.TRIANGLE || test.type === TestType.PAIRED_COMPARISON) {
        const selection = test.type === TestType.TRIANGLE ? res.triangleSelection : res.pairedSelection;
        const baseRow = { ...commonHeaders, Scelta_Giudice: selection || '-', Risposta_Corretta: test.config.correctOddSampleCode || 'N/D', Esito: (test.config.correctOddSampleCode && selection) ? (test.config.correctOddSampleCode === selection ? 'CORRETTO' : 'ERRATO') : '-' };
        if (test.type === TestType.TRIANGLE && res.triangleResponse) {
          data.push({
            ...baseRow,
            Tipo_Sentore: res.triangleResponse.sensoryCategoryType || '-',
            Descrizione_Differenza: res.triangleResponse.description || '-',
            Intensita: res.triangleResponse.intensity || 0,
            Risposta_Forzata: res.triangleResponse.isForcedResponse ? 'Si' : 'No'
          });
        } else {
          data.push(baseRow);
        }
      } else if (test.type === TestType.TDS) {
        const tdsStartTime = res.tdsStartTime ? new Date(res.tdsStartTime).toLocaleTimeString('it-IT') : '-';
        const tdsEndTime = res.tdsEndTime ? new Date(res.tdsEndTime).toLocaleTimeString('it-IT') : '-';
        const getAttributeName = (attrId: string) => {
          if (attrId === 'START') return 'START (Inizio Campione)';
          if (attrId === 'END') return 'END (Fine Campione)';
          return test.config.attributes.find(a => a.id === attrId)?.name || attrId;
        };
        Object.entries(res.tdsLogs || {}).forEach(([prodCode, logs]) => {
          const logEntries = logs as any[];
          logEntries.forEach((log: any, idx: number) => {
            data.push({
              ...commonHeaders,
              Campione: prodCode,
              Tempo_Inizio_Test: tdsStartTime,
              Tempo_Fine_Test: tdsEndTime,
              Sequenza: idx + 1,
              Tempo_Registrazione: log.time ? log.time.toFixed(1) + ' s' : '-',
              Attributo_Dominante: getAttributeName(log.attributeId) || '-'
            });
          });
        });
      } else if (test.type === TestType.NAPPING) {
        Object.entries(res.nappingData || {}).forEach(([code, coords]) => { const c = coords as { x: number; y: number }; data.push({ ...commonHeaders, Codice_Campione: code, Coordinata_X: c.x.toFixed(2), Coordinata_Y: c.y.toFixed(2) }); });
      } else if (test.type === TestType.SORTING) {
        Object.entries(res.sortingGroups || {}).forEach(([code, group]) => { data.push({ ...commonHeaders, Codice_Campione: code, Gruppo_Assegnato: group }); });
      } else {
        test.config.products.forEach(prod => {
          const row: any = { ...commonHeaders, Prodotto: prod.name, Codice: prod.code };
          test.config.attributes.forEach(attr => {
            const key = `${prod.code}_${attr.id}`;
            if (test.type === TestType.CATA) row[attr.name] = res.cataSelection?.includes(key) ? 1 : 0;
            else if (test.type === TestType.RATA) row[attr.name] = res.rataSelection?.[key] || 0;
            else row[attr.name] = res.qdaRatings?.[key] || 0;
          });
          data.push(row);
        });
      }
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dati Sensoriali");
    XLSX.writeFile(wb, `SensoryLab_${test.name.replace(/\s+/g, '_')}_Report.xlsx`);
  };

  const getChartData = (test: SensoryTest) => {
    const testResults = results.filter(r => r.testId === test.id);
    if (testResults.length === 0) return [];
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

  const handleAnalyze = async (test: SensoryTest) => {
    setAnalysisLoading(true);
    const testResults = results.filter(r => r.testId === test.id);
    const summary = `Analisi test "${test.name}" (${test.type}). Risposte totali: ${testResults.length}.`;
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
    <div className="max-w-6xl mx-auto">
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowInviteModal(false)}>
            <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl relative" onClick={e => e.stopPropagation()}>
                <button onClick={() => setShowInviteModal(false)} className="absolute top-4 right-4 text-slate-400"> <X size={24} /> </button>
                <div className="text-center">
                    <div className="w-20 h-20 bg-indigo-100 rounded-3xl flex items-center justify-center text-indigo-600 mx-auto mb-6"> <QrCode size={48} /> </div>
                    <h3 className="text-2xl font-black mb-4">Invita Panelisti</h3>
                    <img src={qrUrl} alt="QR" className="mx-auto w-56 h-56 mb-8 border-4 border-slate-50 rounded-[32px] p-2" />
                    <div className="flex items-center gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-200 mb-4">
                        <p className="text-xs truncate flex-1 text-left font-mono font-bold text-slate-500">{inviteLink}</p>
                        <button onClick={handleCopyLink} className="text-indigo-600 p-2 hover:bg-indigo-50 rounded-xl transition-colors"> {copied ? <Check size={20} /> : <Copy size={20} />} </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {view === 'CREATE' ? (
        <div className="max-w-4xl mx-auto">
          <button onClick={() => setView('LIST')} className="flex items-center gap-2 text-slate-500 mb-8 hover:text-indigo-600 font-bold transition-colors"> <ArrowLeft size={20} /> Dashboard </button>
          <h2 className="text-4xl font-black text-slate-900 mb-10 tracking-tighter">{editingId ? 'Modifica Sessione' : 'Nuovo Test'}</h2>
          
          <div className="space-y-10 bg-white p-10 rounded-[40px] shadow-sm border border-slate-100">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Nome del Test</label>
                      <input className="w-full p-4 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 font-bold transition-all" value={newTestName} onChange={e => setNewTestName(e.target.value)} placeholder="es. Profilo Cioccolato" />
                  </div>
                  <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Metodologia</label>
                      <select className="w-full p-4 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 font-bold bg-white transition-all" value={newTestType} onChange={e => setNewTestType(e.target.value as TestType)}>
                          <optgroup label="Descrittivi & Dinamici">
                              <option value={TestType.QDA}>Profilo Descrittivo (QDA)</option>
                              <option value={TestType.TDS}>TDS (Dominanza)</option>
                              <option value={TestType.TIME_INTENSITY}>Time Intensity</option>
                              <option value={TestType.FLASH_PROFILE}>Flash Profile</option>
                          </optgroup>
                          <optgroup label="Discriminanti">
                              <option value={TestType.TRIANGLE}>Test Triangolare</option>
                              <option value={TestType.PAIRED_COMPARISON}>Confronto a Coppie</option>
                          </optgroup>
                          <optgroup label="Raggruppamento">
                              <option value={TestType.NAPPING}>Napping (Mappa)</option>
                              <option value={TestType.SORTING}>Sorting (Raggruppamento)</option>
                              <option value={TestType.CATA}>CATA (Check-all)</option>
                              <option value={TestType.RATA}>RATA (Seleziona & Vota)</option>
                          </optgroup>
                      </select>
                  </div>
              </div>

              <div className="flex items-center justify-between p-6 bg-indigo-50/50 rounded-3xl border-2 border-indigo-100/50">
                  <div className="flex items-center gap-4">
                      <div className="p-3 bg-indigo-100 rounded-2xl text-indigo-600">
                          <Shuffle size={20} />
                      </div>
                      <div>
                          <h4 className="font-black text-indigo-900 text-sm">Randomizzazione Campioni</h4>
                          <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">L'ordine dei campioni sarà diverso per ogni assaggiatore.</p>
                      </div>
                  </div>
                  <button 
                      type="button"
                      onClick={() => setRandomize(!randomize)}
                      className={`w-16 h-9 rounded-full transition-all relative shadow-inner ${randomize ? 'bg-indigo-600' : 'bg-slate-200'}`}
                  >
                      <div className={`absolute top-1.5 w-6 h-6 bg-white rounded-full shadow-md transition-all ${randomize ? 'left-8' : 'left-1.5'}`} />
                  </button>
              </div>

              {(newTestType === TestType.TRIANGLE || newTestType === TestType.PAIRED_COMPARISON) && (
                <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100">
                  <label className="block text-xs font-black text-amber-600 uppercase tracking-widest mb-2 ml-1">Risposta Corretta (Codice Campione)</label>
                  <input className="w-full p-4 border-2 border-white rounded-2xl outline-none focus:border-amber-500 font-black font-mono transition-all" value={correctAnswerCode} onChange={e => setCorrectAnswerCode(e.target.value)} placeholder="Inserisci il codice del campione da indovinare..." />
                </div>
              )}

              <div>
                  <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3"> <Layers className="text-indigo-500" /> Campioni</h3>
                  <div className="space-y-4">
                      {products.map((p, idx) => (
                          <div key={p.id} className="flex gap-4 items-center">
                              <input className="flex-1 p-4 border-2 border-slate-100 rounded-2xl font-bold transition-all focus:border-indigo-500" value={p.name} onChange={(e) => { const n = [...products]; n[idx].name = e.target.value; setProducts(n); }} placeholder="Nome Prodotto" />
                              <input className="w-28 p-4 border-2 border-slate-100 rounded-2xl text-center font-black font-mono transition-all focus:border-indigo-500" value={p.code} onChange={(e) => { const n = [...products]; n[idx].code = e.target.value; setProducts(n); }} placeholder="Cod" />
                              <button onClick={() => setProducts(products.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-500 p-3 transition-colors"> <Trash2 size={24} /> </button>
                          </div>
                      ))}
                      <button onClick={() => setProducts([...products, { id: generateId(), name: '', code: '' }])} className="text-indigo-600 font-black text-sm flex items-center gap-2 px-4 py-2 hover:bg-indigo-50 rounded-xl transition-all"> <Plus size={18} /> Aggiungi Prodotto </button>
                  </div>
              </div>

              <div>
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-black text-slate-800 flex items-center gap-3"> <Activity className="text-indigo-500" /> Attributi</h3>
                      <div className="flex gap-2">
                           <input className="p-3 text-sm border-2 border-slate-100 rounded-xl w-56 font-medium focus:border-indigo-300 outline-none" placeholder="Descrizione AI..." value={productDescForAi} onChange={e => setProductDescForAi(e.target.value)} />
                           <button onClick={handleAiSuggest} disabled={aiLoading || !productDescForAi} className="px-5 py-3 bg-purple-100 text-purple-700 rounded-xl text-sm font-black flex items-center gap-2 hover:bg-purple-200 transition-all"> {aiLoading ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />} AI </button>
                      </div>
                  </div>
                  <div className="bg-slate-50 p-8 rounded-[32px] border-2 border-slate-100 mb-8">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                          <div className="col-span-2">
                              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Nome Attributo</label>
                              <input className="w-full p-4 border-2 border-white rounded-2xl font-bold focus:border-indigo-500 transition-all" placeholder="es. Dolcezza" value={attrName} onChange={e => setAttrName(e.target.value)} />
                          </div>
                          <div className="col-span-1">
                              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Ancora Min</label>
                              <input className="w-full p-4 border-2 border-white rounded-2xl font-bold text-xs focus:border-indigo-500 transition-all" placeholder="Min" value={attrMin} onChange={e => setAttrMin(e.target.value)} />
                          </div>
                          <div className="col-span-1">
                              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Ancora Max</label>
                              <input className="w-full p-4 border-2 border-white rounded-2xl font-bold text-xs focus:border-indigo-500 transition-all" placeholder="Max" value={attrMax} onChange={e => setAttrMax(e.target.value)} />
                          </div>
                          <div className="col-span-2">
                              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Riferimento (Opzionale)</label>
                              <div className="flex gap-2">
                                  <input className="flex-1 p-4 border-2 border-white rounded-2xl font-bold text-sm focus:border-indigo-500 transition-all" placeholder="Etichetta" value={attrRefLabel} onChange={e => setAttrRefLabel(e.target.value)} />
                                  <input type="number" className="w-24 p-4 border-2 border-white rounded-2xl font-bold text-sm focus:border-indigo-500 transition-all" placeholder="Val." value={attrRefValue} onChange={e => setAttrRefValue(e.target.value)} />
                              </div>
                          </div>
                          <div className="col-span-2">
                              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Tipo Scala</label>
                              <select className="w-full p-4 border-2 border-white rounded-2xl bg-white font-bold outline-none focus:border-indigo-500 transition-all" value={attrScale} onChange={e => setAttrScale(e.target.value as any)}>
                                  <option value="linear">Lineare (1-100)</option>
                                  <option value="linear9">Lineare 1-9 (step 0.1)</option>
                                  <option value="likert5">Likert 5 pt</option>
                                  <option value="likert7">Likert 7 pt</option>
                                  <option value="likert9">9 pt (Edonica)</option>
                              </select>
                          </div>
                      </div>
                      <button onClick={handleAddAttribute} disabled={!attrName.trim()} className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black hover:bg-slate-900 transition-all shadow-xl disabled:opacity-30"> AGGIUNGI ATTRIBUTO </button>
                  </div>
                  <div className="flex flex-wrap gap-3">
                      {attributes.map((attr, idx) => (
                          <div key={idx} className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl border-2 border-slate-100 shadow-sm">
                              <div className="text-left">
                                  <div className="font-black text-slate-800 text-sm">{attr.name}</div>
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{attr.scaleType}</div>
                              </div>
                              <button onClick={() => setAttributes(attributes.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-500 transition-colors"> <X size={20} /> </button>
                          </div>
                      ))}
                  </div>
              </div>

              <div className="pt-10 border-t-2 border-slate-50 flex justify-end">
                  <button onClick={handleSave} className="px-12 py-5 bg-indigo-600 text-white font-black rounded-3xl shadow-2xl hover:bg-indigo-700 transition-all active:scale-95 flex items-center gap-3"> <Save size={24} /> SALVA PROGETTO </button>
              </div>
          </div>
        </div>
      ) : (
        <>
            <div className="flex justify-between items-end mb-12">
                <div>
                    <button onClick={onNavigate} className="flex items-center gap-2 text-slate-500 mb-3 font-bold hover:text-slate-800"> <ArrowLeft size={20} /> Home </button>
                    <h1 className="text-5xl font-black text-slate-900 tracking-tighter">Pannello Leader</h1>
                </div>
                <div className="flex gap-4">
                    <button onClick={() => setShowInviteModal(true)} className="bg-white px-8 py-4 border-2 border-slate-100 rounded-3xl font-black flex items-center gap-2"> <QrCode size={24} /> INVITA </button>
                    <button onClick={() => { resetForm(); setView('CREATE'); }} className="bg-indigo-600 px-8 py-4 text-white rounded-3xl font-black shadow-2xl flex items-center gap-2 hover:bg-indigo-700"> <Plus size={24} /> NUOVO TEST </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {tests.map(test => (
                    <div key={test.id} className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm hover:shadow-xl transition-all relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-6">
                            <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-black uppercase tracking-widest">{test.type}</span>
                            <button onClick={() => onUpdateTest({...test, status: test.status === 'active' ? 'closed' : 'active'})} className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all ${test.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
                                {test.status === 'active' ? <><Wifi size={14}/> APERTO</> : <><StopCircle size={14}/> CHIUSO</>}
                            </button>
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 mb-8 leading-tight tracking-tighter">{test.name}</h3>
                        <div className="flex items-center gap-2 border-t-2 border-slate-50 pt-6">
                            <button onClick={() => { setSelectedTest(test); setView('DETAIL'); }} className="flex-1 py-3 text-indigo-600 font-black hover:bg-indigo-50 rounded-2xl flex items-center justify-center gap-2 transition-all"> <BarChart2 size={20}/> ANALISI</button>
                            {/* TASTO RESET AGGIUNTO QUI */}
                            <button onClick={() => handleResetResults(test)} className="p-3 text-amber-500 hover:bg-amber-50 rounded-2xl transition-all" title="Svuota Risposte"><RefreshCw size={22}/></button>
                            <button onClick={() => handleExportExcel(test)} className="p-3 text-emerald-600 hover:bg-emerald-50 rounded-2xl transition-all"><Download size={22}/></button>
                            <button onClick={() => handleEditClick(test)} className="p-3 text-slate-300 hover:text-indigo-600 rounded-2xl transition-all"><Pencil size={20}/></button>
                            <SlideToDelete onDelete={() => onDeleteTest(test.id)} />
                        </div>
                    </div>
                ))}
            </div>

            {view === 'DETAIL' && selectedTest && (
                <div className="mt-16 bg-white p-12 rounded-[50px] shadow-2xl border border-slate-100">
                    <div className="flex justify-between items-center mb-12">
                        <div>
                            <h2 className="text-4xl font-black text-slate-900 tracking-tighter">{selectedTest.name}</h2>
                        </div>
                        <button onClick={() => setView('LIST')} className="text-slate-400 hover:text-slate-900 font-black tracking-widest uppercase text-xs">Chiudi X</button>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                        <div className="lg:col-span-2 h-[500px] bg-slate-50/50 rounded-[40px] p-8">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={getChartData(selectedTest)}>
                                    <PolarGrid stroke="#e2e8f0" />
                                    <PolarAngleAxis dataKey="attribute" tick={{fill: '#64748b', fontSize: 12, fontWeight: 'bold'}} />
                                    <PolarRadiusAxis domain={[0, 100]} />
                                    {selectedTest.config.products.map((p, idx) => (
                                        <Radar key={p.id} name={`${p.name} (${p.code})`} dataKey={p.name} stroke={idx === 0 ? "#4f46e5" : idx === 1 ? "#10b981" : "#f59e0b"} fill={idx === 0 ? "#4f46e5" : idx === 1 ? "#10b981" : "#f59e0b"} fillOpacity={0.2} strokeWidth={3} />
                                    ))}
                                    <Radar name="Target Riferimento" dataKey="Riferimento" stroke="#94a3b8" strokeDasharray="5 5" fill="none" strokeWidth={2} />
                                    <Tooltip contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)'}} />
                                    <Legend />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="bg-gradient-to-br from-indigo-50 to-white p-10 rounded-[40px] border border-indigo-100 flex flex-col h-full">
                            <h3 className="font-black text-indigo-900 text-xl mb-6 flex items-center gap-3"><Wand2 size={24} className="text-indigo-600" /> Gemini AI Report</h3>
                            <div className="flex-1 overflow-y-auto text-slate-700 text-sm whitespace-pre-line leading-relaxed scrollbar-thin scrollbar-thumb-indigo-200">
                                {aiAnalysis || "Avvia l'analisi per generare insight basati sui dati."}
                            </div>
                            <button onClick={() => handleAnalyze(selectedTest)} disabled={analysisLoading} className="w-full mt-8 py-5 bg-indigo-600 text-white rounded-3xl font-black shadow-2xl disabled:opacity-30 transition-all flex items-center justify-center gap-3"> {analysisLoading ? <Loader2 size={24} className="animate-spin" /> : <Wand2 size={24} />} ELABORA ANALISI </button>
                        </div>
                    </div>
                </div>
            )}
        </>
      )}
    </div>
  );
};