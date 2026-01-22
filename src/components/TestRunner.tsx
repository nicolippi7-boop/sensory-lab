import React, { useState, useEffect, useRef } from 'react';
import { TestType } from '../types';
import type { SensoryTest, JudgeResult, TDSLogEntry, Product, TILogEntry, Attribute, TriangleResponse } from '../types';
import { Play, Square, CheckCircle, ArrowRight, MousePointer2, Info, Clock, MapPin, RefreshCcw, Target, Layers, ChevronRight, Trash2, Plus } from 'lucide-react';

interface TestRunnerProps {
  test: SensoryTest;
  judgeName: string;
  onComplete: (result: JudgeResult) => void;
  onExit: () => void;
}

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

const shuffleArray = <T,>(array: T[]): T[] => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

export const TestRunner: React.FC<TestRunnerProps> = ({ test, judgeName, onComplete, onExit }) => {
  // --- CHIAVE UNICA PER IL RECOVERY ---
  const STORAGE_KEY = `sensory_test_progress_${test.id}_${judgeName.replace(/\s+/g, '_')}`;

  // --- STATO ---
  const [products, setProducts] = useState<Product[]>([]);
  const [currentProductIndex, setCurrentProductIndex] = useState(0);
  const [result, setResult] = useState<Partial<JudgeResult>>({
    testId: test.id,
    judgeName,
    qdaRatings: {},
    cataSelection: [],
    rataSelection: {},
    tdsLogs: {},
    tiLogs: {},
    nappingData: {},
    sortingGroups: {},
  });

  // Stati specifici per i test
  const [selectedOne, setSelectedOne] = useState<string | null>(null);
  const [triangleStep, setTriangleStep] = useState<'selection' | 'forced_response' | 'details' | 'confirm'>('selection');
  const [triangleResponse, setTriangleResponse] = useState<TriangleResponse>({
    selectedCode: '',
    sensoryCategoryType: 'aroma',
    description: '',
    intensity: 1,
    isForcedResponse: false
  });
  
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentDominant, setCurrentDominant] = useState<string | null>(null);
  const [currentIntensity, setCurrentIntensity] = useState(1);
  const [tiHistory, setTiHistory] = useState<{t: number, v: number}[]>([]); 
  const timerRef = useRef<number | null>(null);

  const [placedProducts, setPlacedProducts] = useState<string[]>([]);
  const [customAttributes, setCustomAttributes] = useState<string[]>([]);
  const [newAttribute, setNewAttribute] = useState('');

  // --- LOGICA DI RECOVERY AL CARICAMENTO ---
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setProducts(parsed.products || []);
        setCurrentProductIndex(parsed.currentProductIndex || 0);
        setResult(parsed.result || {});
        setTriangleStep(parsed.triangleStep || 'selection');
        setTriangleResponse(parsed.triangleResponse || { selectedCode: '', sensoryCategoryType: 'aroma', description: '', intensity: 1, isForcedResponse: false });
        setSelectedOne(parsed.selectedOne || null);
        setPlacedProducts(parsed.placedProducts || []);
        setCustomAttributes(parsed.customAttributes || []);
      } catch (e) {
        console.error("Errore nel ripristino dei dati", e);
      }
    } else {
      // Se non ci sono dati salvati, inizializza normalmente
      const initialProducts = test.config.randomizePresentation 
        ? shuffleArray(test.config.products) 
        : [...test.config.products];
      setProducts(initialProducts);
    }
  }, [test.id, STORAGE_KEY]);

  // --- LOGICA DI SALVATAGGIO AUTOMATICO ---
  useEffect(() => {
    if (products.length > 0) {
      const stateToSave = {
        products,
        currentProductIndex,
        result,
        triangleStep,
        triangleResponse,
        selectedOne,
        placedProducts,
        customAttributes
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    }
  }, [products, currentProductIndex, result, triangleStep, triangleResponse, selectedOne, placedProducts, customAttributes, STORAGE_KEY]);

  // --- TIMER LOGIC ---
  useEffect(() => {
    if (test.type === TestType.TIME_INTENSITY && isTimerRunning && products[currentProductIndex]) {
      const logKey = products[currentProductIndex].code;
      const newEntry: TILogEntry = { 
        time: parseFloat(elapsedTime.toFixed(1)), 
        intensity: currentIntensity 
      };
      setTiHistory(prev => [...prev, { t: newEntry.time, v: currentIntensity }]);
      setResult(prev => ({
          ...prev,
          tiLogs: {
              ...prev.tiLogs,
              [logKey]: [...(prev.tiLogs?.[logKey] || []), newEntry]
          }
      }));
    }
    
    // Per TDS il timer serve solo per l'elapsed time visuale e log
    if (test.type === TestType.TDS && isTimerRunning) {
        timerRef.current = window.setInterval(() => {
            setElapsedTime(prev => prev + 0.1);
        }, 100);
    } else if (test.type === TestType.TIME_INTENSITY && isTimerRunning) {
        timerRef.current = window.setInterval(() => {
             setElapsedTime(prev => prev + 0.5);
        }, 500);
    }

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [elapsedTime, isTimerRunning, test.type, currentProductIndex, currentIntensity, products]);

  const startTimer = () => {
    setIsTimerRunning(true);
    setElapsedTime(0);
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsTimerRunning(false);
  };

  // --- HANDLERS ---
  const handleNextProduct = () => {
    if (currentProductIndex < products.length - 1) {
      setCurrentProductIndex(prev => prev + 1);
      stopTimer();
      setElapsedTime(0);
      setTiHistory([]);
      setPlacedProducts([]); // Reset visuale parziale se necessario
      window.scrollTo(0, 0);
    } else {
      submitAll();
    }
  };

  const submitAll = () => {
    const finalResult: JudgeResult = {
        ...result as JudgeResult,
        id: generateId(),
        submittedAt: new Date().toISOString(),
        triangleSelection: selectedOne || undefined,
        triangleResponse: test.type === TestType.TRIANGLE ? triangleResponse : undefined
    };
    // Pulizia dopo il successo
    localStorage.removeItem(STORAGE_KEY);
    onComplete(finalResult);
  };

  const handleQdaChange = (attrId: string, value: number, prodCode: string = products[currentProductIndex]?.code) => {
    setResult(prev => ({
      ...prev,
      qdaRatings: {
        ...prev.qdaRatings,
        [`${prodCode}_${attrId}`]: value
      }
    }));
  };

  const handleCataToggle = (attrId: string) => {
    const key = `${products[currentProductIndex].code}_${attrId}`;
    const current = result.cataSelection || [];
    setResult(prev => ({
      ...prev,
      cataSelection: current.includes(key) 
        ? current.filter(k => k !== key)
        : [...current, key]
    }));
  };

  const handleRataChange = (attrId: string, intensity: number) => {
      setResult(prev => ({
          ...prev,
          rataSelection: {
              ...prev.rataSelection,
              [`${products[currentProductIndex].code}_${attrId}`]: intensity
          }
      }));
  };

  const handleDominantClick = (attrId: string) => {
    if (!isTimerRunning) return;
    setCurrentDominant(attrId);
    const logKey = products[currentProductIndex].code;
    const newEntry: TDSLogEntry = {
      time: parseFloat(elapsedTime.toFixed(1)),
      attributeId: attrId
    };
    setResult(prev => ({
      ...prev,
      tdsLogs: {
        ...prev.tdsLogs,
        [logKey]: [...(prev.tdsLogs?.[logKey] || []), newEntry]
      }
    }));
  };

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!selectedOne) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
      setResult(prev => ({
          ...prev,
          nappingData: {
              ...prev.nappingData,
              [selectedOne]: { x, y }
          }
      }));
      if (!placedProducts.includes(selectedOne)) {
          setPlacedProducts([...placedProducts, selectedOne]);
      }
      setSelectedOne(null);
  };

  const handleSortChange = (prodCode: string, group: string) => {
      setResult(prev => ({
          ...prev,
          sortingGroups: {
              ...prev.sortingGroups,
              [prodCode]: group
          }
      }));
  };

  // --- RENDERERS ---

  const currentProduct = products[currentProductIndex];

  const renderTriangle = () => {
    if (triangleStep === 'selection') {
      return (
        <div className="flex flex-col items-center justify-center space-y-12 animate-in fade-in">
          <div className="text-center">
            <h3 className="text-4xl font-black text-slate-800 mb-2">Test Triangolare</h3>
            <p className="text-xl text-slate-500">Seleziona il campione che ritieni <span className="font-bold text-indigo-600">DIVERSO</span> dagli altri due.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-10">
            {products.map(p => (
              <button
                key={p.code}
                onClick={() => {
                  setSelectedOne(p.code);
                  setTriangleResponse(prev => ({...prev, selectedCode: p.code}));
                }}
                className={`w-48 h-48 rounded-full border-4 flex flex-col items-center justify-center gap-2 transition-all shadow-sm active:scale-95
                  ${selectedOne === p.code 
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-4 ring-indigo-200 scale-105' 
                    : 'border-slate-200 hover:border-indigo-300 bg-white'}`}
              >
                <span className="text-xs text-slate-400 uppercase tracking-widest font-bold">Campione</span>
                <span className="text-5xl font-black font-mono">{p.code}</span>
              </button>
            ))}
          </div>
          <button 
            disabled={!selectedOne}
            onClick={() => setTriangleStep('forced_response')}
            className="mt-8 px-12 py-5 bg-slate-900 text-white font-black rounded-2xl disabled:opacity-50 hover:bg-slate-800 shadow-xl transition-all text-xl uppercase tracking-widest"
          >
            Continua
          </button>
        </div>
      );
    }

    if (triangleStep === 'forced_response') {
      return (
        <div className="flex flex-col items-center justify-center space-y-8 max-w-2xl mx-auto animate-in slide-in-from-right-8">
          <div className="text-center">
            <h3 className="text-2xl font-bold text-slate-800 mb-2">Risposta Forzata? (DIN 10955)</h3>
            <p className="text-slate-500">La tua scelta è stata basata su una <span className="font-bold text-indigo-600">reale percezione</span> di differenza o è stata una <span className="font-bold text-amber-600">risposta casuale</span>?</p>
          </div>
          <div className="w-full bg-white rounded-2xl p-8 shadow-sm border border-slate-200 space-y-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => {
                  setTriangleResponse(prev => ({ ...prev, isForcedResponse: false }));
                  setTriangleStep('details');
                }}
                className={`flex-1 p-6 rounded-xl border-2 transition-all text-left cursor-pointer border-slate-200 bg-white hover:border-indigo-300`}
              >
                <div className="font-semibold text-slate-800 text-lg">✓ Differenza Chiara</div>
                <div className="text-xs text-slate-500 mt-2">Ho percepito chiaramente una differenza</div>
              </button>
              <button 
                onClick={() => {
                  setTriangleResponse(prev => ({ ...prev, isForcedResponse: true }));
                  setTriangleStep('confirm');
                }}
                className={`flex-1 p-6 rounded-xl border-2 transition-all text-left cursor-pointer border-slate-200 bg-white hover:border-indigo-300`}
              >
                <div className="font-semibold text-slate-800 text-lg">? Risposta Forzata</div>
                <div className="text-xs text-slate-500 mt-2">Non ero sicuro, ho indovinato</div>
              </button>
            </div>
            <button onClick={() => setTriangleStep('selection')} className="w-full px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50">Indietro</button>
          </div>
        </div>
      );
    }

    if (triangleStep === 'details') {
      return (
        <div className="flex flex-col items-center justify-center space-y-8 max-w-2xl mx-auto animate-in slide-in-from-right-8">
          <div className="text-center">
            <h3 className="text-2xl font-bold text-slate-800 mb-2">Dettagli della Differenza</h3>
            <p className="text-slate-500">Descrivere la differenza percepita nel campione <span className="font-bold text-indigo-600">{selectedOne}</span></p>
          </div>
          <div className="w-full bg-white rounded-2xl p-8 shadow-sm border border-slate-200 space-y-6">
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">Tipo di Sentore *</label>
              <div className="flex gap-4">
                {(['aroma', 'taste'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setTriangleResponse(prev => ({ ...prev, sensoryCategoryType: type }))}
                    className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all border-2
                      ${triangleResponse.sensoryCategoryType === type 
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                        : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'}`}
                  >
                    {type === 'aroma' ? '👃 Odore/Aroma' : '👅 Sapore'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">Descrizione della Differenza *</label>
              <textarea
                value={triangleResponse.description}
                onChange={e => setTriangleResponse(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Es: Note fruttate, amaro pronunciato..."
                className="w-full p-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                rows={3}
              />
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">Intensità del Sentore *</label>
              <div className="flex items-center gap-6">
                <input 
                  type="range" min="1" max="4" 
                  value={triangleResponse.intensity}
                  onChange={e => setTriangleResponse(prev => ({ ...prev, intensity: parseInt(e.target.value) }))}
                  className="flex-1 h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" 
                />
                <div className="text-center">
                  <span className="text-3xl font-black text-indigo-600">{triangleResponse.intensity}</span>
                  <p className="text-xs text-slate-500">/ 4</p>
                </div>
              </div>
            </div>
            <div className="flex gap-4 pt-6">
              <button onClick={() => setTriangleStep('forced_response')} className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50">Indietro</button>
              <button 
                disabled={!triangleResponse.description?.trim()}
                onClick={() => setTriangleStep('confirm')} 
                className="flex-1 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all"
              >
                Continua
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center space-y-8 max-w-2xl mx-auto animate-in fade-in">
        <div className="text-center">
          <h3 className="text-2xl font-bold text-slate-800 mb-2">Conferma Risposta</h3>
          <p className="text-slate-500">Campione diverso: <span className="font-bold text-indigo-600">{selectedOne}</span></p>
          {!triangleResponse.isForcedResponse ? (
            <p className="text-slate-500 mt-2">Sentore: <span className="font-bold">{triangleResponse.sensoryCategoryType === 'aroma' ? 'Aroma' : 'Sapore'}</span> - Intensità: <span className="font-bold">{triangleResponse.intensity}/4</span></p>
          ) : (
            <p className="text-amber-600 font-semibold mt-2">⚠️ Risposta forzata (indovinata)</p>
          )}
        </div>
        <div className="w-full bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
          <div className="flex gap-4">
            <button onClick={() => setTriangleStep(triangleResponse.isForcedResponse ? 'forced_response' : 'details')} className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50">Modifica</button>
            <button onClick={submitAll} className="flex-1 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-lg">Conferma e Invia</button>
          </div>
        </div>
      </div>
    );
  };

  const renderPairedComparison = () => (
    <div className="flex flex-col items-center justify-center space-y-12 animate-in fade-in">
      <div className="text-center">
          <h3 className="text-2xl font-bold text-slate-800 mb-2">Confronto a Coppie</h3>
          <p className="text-slate-500">Quale campione presenta l'intensità <span className="font-bold text-indigo-600">MAGGIORE</span>?</p>
      </div>
      <div className="flex flex-wrap justify-center gap-10">
        {products.map(p => (
          <button
            key={p.code}
            onClick={() => setSelectedOne(p.code)}
            className={`w-48 h-48 rounded-3xl border-4 flex flex-col items-center justify-center gap-2 transition-all shadow-sm active:scale-95
              ${selectedOne === p.code 
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-4 ring-indigo-200 scale-105' 
                : 'border-slate-200 hover:border-indigo-300 bg-white'}`}
          >
            <span className="text-xs text-slate-400 uppercase tracking-widest font-bold">Campione</span>
            <span className="text-4xl font-black font-mono">{p.code}</span>
          </button>
        ))}
      </div>
      <button 
        disabled={!selectedOne}
        onClick={submitAll}
        className="mt-8 px-10 py-4 bg-slate-900 text-white font-bold rounded-2xl disabled:opacity-50 hover:bg-slate-800 shadow-xl transition-all"
      >
        Conferma Scelta
      </button>
    </div>
  );

  const renderScaleInput = (attr: Attribute) => {
    if (!currentProduct) return null;
    const scaleType = attr.scaleType || 'linear';
    const val = result.qdaRatings?.[`${currentProduct.code}_${attr.id}`] ?? 0;

    if (scaleType === 'linear' || scaleType === 'linear9' || scaleType === 'linear10') {
        const isStandardLinear = scaleType === 'linear';
        const maxVal = isStandardLinear ? 100 : (scaleType === 'linear9' ? 9 : 10);
        const minVal = isStandardLinear ? 0 : 1;
        const step = isStandardLinear ? 1 : 0.1;
        
        return (
            <div className="space-y-6">
                <div className="relative h-12 flex items-center mt-12">
                    {/* --- QUI C'È IL RIFERIMENTO ROSSO CHE VOLEVI --- */}
                    {attr.referenceValue !== undefined && (
                        <div 
                            className="absolute z-20 flex flex-col items-center pointer-events-none"
                            style={{ 
                                left: `${((attr.referenceValue - minVal) / (maxVal - minVal)) * 100}%`,
                                transform: 'translateX(-50%)',
                                top: '-42px'
                            }}
                        >
                            <div className="bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded-md shadow-lg mb-1 whitespace-nowrap uppercase border border-red-400 flex items-center gap-1">
                                <Target size={10} /> {attr.referenceLabel || 'RIF'}: {attr.referenceValue.toFixed(1)}
                            </div>
                            <div className="w-1 h-10 bg-red-500 rounded-full" />
                        </div>
                    )}
                    
                    <input 
                        type="range" min={minVal} max={maxVal} step={step}
                        value={val}
                        onChange={(e) => handleQdaChange(attr.id, parseFloat(e.target.value))}
                        className="relative w-full h-4 bg-slate-100 rounded-full appearance-none cursor-pointer accent-indigo-600 shadow-inner z-10"
                    />
                </div>
                <div className="flex justify-between px-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{attr.leftAnchor || 'Debole'}</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{attr.rightAnchor || 'Forte'}</span>
                </div>
                <div className="text-center text-lg font-black text-indigo-600">
                    {isStandardLinear ? Math.round(val) : val.toFixed(1)}
                </div>
            </div>
        );
    }
    
    if (scaleType.startsWith('likert')) {
        const points = parseInt(scaleType.replace('likert', '')) || 5;
        const range = Array.from({length: points}, (_, i) => i + 1);
        return (
            <div className="flex flex-col gap-4">
                <div className="flex justify-between text-xs font-bold text-slate-400 px-2 uppercase tracking-wider">
                    <span>{attr.leftAnchor || 'Min'}</span>
                    <span>{attr.rightAnchor || 'Max'}</span>
                </div>
                <div className="flex items-center justify-between gap-2 relative py-4">
                    {range.map(p => (
                         <button 
                            key={p}
                            onClick={() => handleQdaChange(attr.id, p)}
                            className={`flex-1 aspect-square rounded-xl border-2 font-bold transition-all active:scale-95 z-10
                                ${val === p 
                                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg scale-105' 
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 shadow-sm'}`}
                         >
                             {p}
                         </button>
                    ))}
                </div>
            </div>
        );
    }

    return null;
  };

  const renderQDA = () => {
    if (!currentProduct) return null;
    return (
    <div className="max-w-2xl mx-auto w-full animate-in fade-in duration-500">
      <div className="mb-8 p-6 bg-indigo-50 border border-indigo-100 rounded-3xl flex justify-between items-center shadow-sm">
        <div>
            <p className="text-sm text-indigo-600 font-bold uppercase tracking-widest mb-1">Campione</p>
            <p className="text-5xl font-black text-indigo-900 font-mono tracking-tighter">{currentProduct.code}</p>
        </div>
        <div className="text-right">
            <p className="text-xs text-indigo-400 font-bold uppercase mb-1">Progresso</p>
            <p className="text-lg font-bold text-indigo-900">{currentProductIndex + 1} / {products.length}</p>
        </div>
      </div>

      <div className="space-y-8">
        {test.config.attributes.map(attr => (
          <div key={attr.id} className="bg-white p-10 rounded-[40px] shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <div className="mb-6">
                 <div className="flex justify-between items-baseline mb-2">
                    <label className="text-3xl font-black text-slate-900 tracking-tight">{attr.name}</label>
                 </div>
                 {attr.description && (
                    <div className="flex gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-sm text-slate-600 leading-relaxed italic">
                        <Info size={16} className="text-slate-400 shrink-0 mt-1"/>
                        <p>{attr.description}</p>
                    </div>
                 )}
            </div>
            {renderScaleInput(attr)}
          </div>
        ))}
      </div>

      <div className="mt-12 mb-32 flex justify-center">
        <button 
            onClick={handleNextProduct}
            className="px-12 py-5 bg-indigo-600 text-white font-black rounded-3xl hover:bg-indigo-700 shadow-xl transition-all flex items-center gap-3 text-xl active:scale-95 group"
        >
          {currentProductIndex < products.length - 1 ? 'PROSSIMO CAMPIONE' : 'INVIA RISULTATI'}
          <ArrowRight size={28} className="group-hover:translate-x-2 transition-transform" />
        </button>
      </div>
    </div>
  )};

  const renderHedonic = () => {
    if (!currentProduct) return null;
    return (
    <div className="max-w-2xl mx-auto w-full animate-in fade-in">
      <div className="mb-8 p-6 bg-pink-50 border border-pink-100 rounded-3xl flex justify-between items-center shadow-sm">
        <div>
            <p className="text-sm text-pink-600 font-bold uppercase tracking-widest mb-1">Campione</p>
            <p className="text-5xl font-black text-pink-900 font-mono">{currentProduct.code}</p>
        </div>
        <div className="text-right">
            <p className="text-xs text-pink-400 font-bold uppercase mb-1">Progresso</p>
            <p className="text-lg font-bold text-pink-900">{currentProductIndex + 1} / {products.length}</p>
        </div>
      </div>
      <div className="space-y-8">
        {test.config.attributes.map(attr => {
             const val = result.qdaRatings?.[`${currentProduct.code}_${attr.id}`] || 5;
             return (
              <div key={attr.id} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                <label className="block text-2xl font-bold text-slate-800 mb-8 text-center">{attr.name}</label>
                <div className="flex flex-col gap-3">
                    {[9, 8, 7, 6, 5, 4, 3, 2, 1].map(score => (
                        <label 
                            key={score} 
                            className={`flex items-center gap-4 p-4 rounded-2xl border cursor-pointer transition-all
                                ${val === score ? 'bg-pink-50 border-pink-500 ring-2 ring-pink-100' : 'hover:bg-slate-50 border-slate-100 shadow-sm'}`}
                        >
                            <input 
                                type="radio" 
                                name={`hedonic-${attr.id}`} 
                                value={score} 
                                checked={val === score}
                                onChange={() => handleQdaChange(attr.id, score)}
                                className="w-6 h-6 text-pink-600 accent-pink-600"
                            />
                            <span className={`flex-1 text-lg ${val === score ? 'text-pink-900 font-bold' : 'text-slate-600 font-medium'}`}>
                                {score}
                            </span>
                            {score === 9 && <span className="text-xs font-bold text-pink-300 uppercase tracking-widest">Piace moltissimo</span>}
                            {score === 1 && <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Dispiace moltissimo</span>}
                        </label>
                    ))}
                </div>
              </div>
            );
        })}
      </div>
      <div className="mt-12 mb-20 flex justify-center">
        <button 
            onClick={handleNextProduct}
            className="px-12 py-5 bg-pink-600 text-white font-black rounded-3xl hover:bg-pink-700 shadow-xl transition-all flex items-center gap-3 text-xl active:scale-95"
        >
          {currentProductIndex < products.length - 1 ? 'Prossimo Campione' : 'Invia Risultati'}
          <ArrowRight size={28} />
        </button>
      </div>
    </div>
  )};

  const renderCATA = () => {
    if (!currentProduct) return null;
    return (
    <div className="max-w-2xl mx-auto w-full animate-in fade-in">
      <div className="mb-8 p-6 bg-emerald-50 border border-emerald-100 rounded-3xl flex justify-between items-center shadow-sm">
        <div>
            <p className="text-sm text-emerald-600 font-bold uppercase tracking-widest mb-1">Campione</p>
            <p className="text-5xl font-black text-emerald-900 font-mono">{currentProduct.code}</p>
        </div>
        <div className="text-right">
            <p className="text-xs text-emerald-400 font-bold uppercase mb-1">Progresso</p>
            <p className="text-lg font-bold text-emerald-900">{currentProductIndex + 1} / {products.length}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {test.config.attributes.map(attr => {
          const isChecked = result.cataSelection?.includes(`${currentProduct.code}_${attr.id}`);
          return (
            <button
              key={attr.id}
              onClick={() => handleCataToggle(attr.id)}
              className={`p-5 rounded-2xl border-2 text-left transition-all active:scale-95
                ${isChecked 
                    ? 'border-emerald-500 bg-emerald-500 text-white shadow-lg' 
                    : 'border-slate-200 hover:border-emerald-200 bg-white'}`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center
                    ${isChecked ? 'bg-white border-white' : 'border-slate-300 bg-slate-50'}`}>
                    {isChecked && <CheckCircle size={16} className="text-emerald-600" />}
                </div>
                <span className={`font-bold text-lg ${isChecked ? 'text-white' : 'text-slate-700'}`}>{attr.name}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-12 mb-20 flex justify-center">
        <button 
            onClick={handleNextProduct}
            className="px-12 py-5 bg-emerald-600 text-white font-black rounded-3xl hover:bg-emerald-700 shadow-xl transition-all flex items-center gap-3 text-xl active:scale-95"
        >
          {currentProductIndex < products.length - 1 ? 'Prossimo Campione' : 'Invia Risultati'}
          <ArrowRight size={28} />
        </button>
      </div>
    </div>
  )};

  const renderRATA = () => {
    if (!currentProduct) return null;
    return (
      <div className="max-w-2xl mx-auto w-full animate-in fade-in">
        <div className="mb-8 p-6 bg-teal-50 border border-teal-100 rounded-3xl flex justify-between items-center shadow-sm">
           <div>
               <p className="text-sm text-teal-600 font-bold uppercase tracking-widest mb-1">Campione</p>
               <p className="text-5xl font-black text-teal-900 font-mono">{currentProduct.code}</p>
           </div>
           <div className="text-right">
               <p className="text-xs text-teal-400 font-bold uppercase mb-1">Progresso</p>
               <p className="text-lg font-bold text-teal-900">{currentProductIndex + 1} / {products.length}</p>
           </div>
        </div>
        <div className="space-y-6">
            {test.config.attributes.map(attr => {
                const selectionKey = `${currentProduct.code}_${attr.id}`;
                const intensity = result.rataSelection?.[selectionKey] || 0;
                const isSelected = intensity > 0;

                return (
                    <div key={attr.id} className={`p-6 rounded-3xl border-2 transition-all ${isSelected ? 'border-teal-500 bg-teal-50/50' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-center gap-4 mb-4">
                             <button 
                                onClick={() => handleRataChange(attr.id, isSelected ? 0 : 1)}
                                className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-teal-500 border-teal-500 text-white' : 'bg-white border-slate-300'}`}
                             >
                                 {isSelected && <CheckCircle size={20} />}
                             </button>
                             <span className="font-bold text-xl text-slate-800">{attr.name}</span>
                        </div>
                        {isSelected && (
                            <div className="pl-12 animate-in slide-in-from-top-2">
                                <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-2">Intensità</p>
                                <div className="flex gap-2">
                                    {[1, 2, 3, 4, 5].map(v => (
                                        <button 
                                            key={v}
                                            onClick={() => handleRataChange(attr.id, v)}
                                            className={`flex-1 h-12 rounded-xl border-2 font-black transition-all ${intensity === v ? 'bg-teal-600 border-teal-600 text-white shadow-lg' : 'bg-white border-teal-100 text-teal-600 hover:border-teal-300'}`}
                                        >
                                            {v}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
        <div className="mt-12 mb-20 flex justify-center">
            <button onClick={handleNextProduct} className="px-12 py-5 bg-teal-600 text-white font-black rounded-3xl hover:bg-teal-700 shadow-xl transition-all flex items-center gap-3 text-xl active:scale-95">
              {currentProductIndex < products.length - 1 ? 'Prossimo' : 'Concludi'} <ArrowRight size={28} />
            </button>
        </div>
      </div>
    );
  };

  const renderTDS = () => {
    const duration = test.config.durationSeconds || 60;
    const progress = (elapsedTime / duration) * 100;
    return (
      <div className="max-w-4xl mx-auto w-full animate-in fade-in">
          <div className="mb-10 p-8 bg-orange-50 border border-orange-100 rounded-[40px] flex justify-between items-center">
            <div className="flex items-center gap-6">
                <div className="w-20 h-20 bg-orange-600 text-white rounded-3xl flex items-center justify-center text-3xl font-black font-mono">{currentProduct.code}</div>
                <p className="text-2xl font-black text-orange-900 uppercase">Temporal Dominance</p>
            </div>
            <div className="text-5xl font-mono font-black text-orange-600 flex items-center gap-3"><Clock size={32}/> {elapsedTime.toFixed(1)}s</div>
          </div>
          <div className="w-full h-8 bg-slate-100 rounded-full mb-12 overflow-hidden shadow-inner p-1">
              <div className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all duration-100 ease-linear" style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
          {!isTimerRunning && elapsedTime === 0 ? (
            <button onClick={startTimer} className="w-full py-32 border-4 border-dashed border-slate-200 rounded-[48px] hover:border-orange-500 hover:bg-orange-50 flex flex-col items-center gap-8 group transition-all bg-white">
                <div className="p-10 bg-orange-100 rounded-full text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-all shadow-xl"><Play size={80} fill="currentColor" /></div>
                <span className="text-3xl font-black text-slate-400 group-hover:text-orange-600 uppercase tracking-widest">Avvia Valutazione</span>
            </button>
          ) : (
            <div className="space-y-8">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                {test.config.attributes.map(attr => (
                  <button key={attr.id} disabled={!isTimerRunning} onClick={() => handleDominantClick(attr.id)} className={`p-10 rounded-[32px] font-black text-2xl transition-all shadow-sm active:scale-95 border-b-8 ${currentDominant === attr.id ? 'bg-orange-600 text-white border-orange-800 -translate-y-2' : 'bg-white text-slate-700 border-slate-100'}`}>{attr.name}</button>
                ))}
              </div>
              <button onClick={handleNextProduct} className="w-full py-8 bg-slate-900 text-white rounded-[32px] font-black text-xl flex items-center justify-center gap-4 shadow-2xl transition-all uppercase tracking-widest"><Square size={24} fill="currentColor" /> Termina Campione</button>
            </div>
          )}
      </div>
    );
  };

  const renderNapping = () => (
    <div className="flex flex-col h-[80vh] w-full max-w-full mx-auto animate-in fade-in">
        <div className="mb-6 flex justify-between items-center px-4">
            <div><h3 className="font-black text-4xl text-slate-900 tracking-tighter flex items-center gap-4"><div className="p-3 bg-indigo-600 text-white rounded-2xl"><MapPin /></div>Mappa Proiettiva</h3></div>
            <button onClick={submitAll} className="px-10 py-5 bg-slate-900 text-white rounded-2xl font-black shadow-2xl uppercase tracking-widest">Invia Mappa</button>
        </div>
        <div className="flex-1 flex gap-6 min-h-0 bg-white rounded-[40px] p-6 shadow-2xl border border-slate-100">
            <div className="w-64 flex flex-col gap-3 overflow-y-auto pr-4 border-r-2 border-slate-50">
                {products.map(p => (
                    <button key={p.code} onClick={() => setSelectedOne(p.code)} className={`p-5 rounded-2xl text-left font-mono font-black text-xl transition-all ${selectedOne === p.code ? 'bg-indigo-600 text-white shadow-xl scale-105' : placedProducts.includes(p.code) ? 'bg-green-50 text-green-700 border-2 border-green-100' : 'bg-slate-50 border-2 border-transparent text-slate-600'}`}>{p.code}</button>
                ))}
            </div>
            <div className="flex-1 relative bg-slate-50/50 rounded-[32px] border-4 border-dashed border-slate-200 cursor-crosshair overflow-hidden" onClick={handleMapClick}>
                <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-200"></div><div className="absolute left-1/2 top-0 h-full w-0.5 bg-slate-200"></div>
                {Object.entries(result.nappingData || {}).map(([code, coords]) => (
                    <div key={code} className="absolute w-16 h-16 -ml-8 -mt-8 bg-indigo-600 rounded-[20px] flex items-center justify-center text-white text-xl font-black font-mono shadow-2xl border-4 border-white cursor-pointer hover:scale-125 transition-transform" style={{ left: `${(coords as any).x}%`, top: `${(coords as any).y}%` }} onClick={(e) => { e.stopPropagation(); setSelectedOne(code); }}>{code}</div>
                ))}
            </div>
        </div>
    </div>
  );

  const renderSorting = () => (
    <div className="max-w-4xl mx-auto w-full animate-in fade-in">
        <div className="text-center mb-16"><div className="w-24 h-24 bg-indigo-100 text-indigo-600 rounded-[32px] flex items-center justify-center mx-auto mb-6 shadow-xl"><Layers size={40} /></div><h3 className="text-5xl font-black text-slate-900 tracking-tighter uppercase">Sorting Test</h3></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {products.map(p => (
                <div key={p.code} className="bg-white p-10 rounded-[40px] border-2 border-slate-50 shadow-sm hover:shadow-xl group transition-all">
                    <div className="flex items-center gap-6 mb-8"><div className="w-24 h-24 bg-slate-900 text-white rounded-[32px] flex items-center justify-center text-4xl font-black font-mono shadow-2xl">{p.code}</div><p className="text-2xl font-black text-slate-800">Prodotto {p.code}</p></div>
                    <input type="text" value={result.sortingGroups?.[p.code] || ''} onChange={(e) => handleSortChange(p.code, e.target.value)} className="w-full p-6 bg-slate-50 border-4 border-transparent rounded-[24px] focus:border-indigo-500 outline-none font-black text-xl" placeholder="Nome del Gruppo..." />
                </div>
            ))}
        </div>
        <div className="mt-24 mb-40 flex justify-center"><button onClick={submitAll} className="px-20 py-8 bg-slate-900 text-white rounded-[40px] font-black shadow-2xl text-2xl hover:bg-black transition-all">INVIA RISULTATI</button></div>
    </div>
  );

  const renderFlashProfile = () => (
      <div className="w-full max-w-3xl mx-auto animate-in fade-in">
         <div className="mb-12 p-10 bg-fuchsia-50 border-2 border-fuchsia-100 rounded-[48px] flex justify-between items-center shadow-lg">
            <div className="flex items-center gap-8"><div className="w-28 h-28 bg-fuchsia-600 text-white rounded-[32px] flex items-center justify-center text-5xl font-black font-mono shadow-2xl">{currentProduct.code}</div><p className="text-3xl font-black text-fuchsia-900">Flash Profile</p></div>
            <p className="text-4xl font-black text-fuchsia-900">{currentProductIndex + 1}/{products.length}</p>
         </div>
         <div className="bg-white p-10 rounded-[40px] shadow-sm border border-slate-100 mb-12">
            <div className="flex gap-4">
                <input value={newAttribute} onChange={e => setNewAttribute(e.target.value)} placeholder="Aggiungi descrittore..." className="flex-1 p-6 bg-slate-50 border-2 border-transparent rounded-3xl focus:border-fuchsia-500 outline-none font-bold text-lg" onKeyDown={e => { if (e.key === 'Enter' && newAttribute) { setCustomAttributes([...customAttributes, newAttribute]); setNewAttribute(''); } }} />
                <button onClick={() => { if (newAttribute) { setCustomAttributes([...customAttributes, newAttribute]); setNewAttribute(''); } }} className="px-10 bg-fuchsia-600 text-white rounded-3xl font-black text-2xl shadow-lg"><Plus /></button>
            </div>
         </div>
         <div className="space-y-6 mb-40">
            {customAttributes.map(attr => (
                <div key={attr} className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm transition-all">
                    <div className="flex justify-between items-center mb-8"><span className="text-2xl font-black text-slate-800 tracking-tight">{attr}</span><div className="flex items-center gap-4"><span className="text-3xl font-black text-fuchsia-600">{(result.qdaRatings?.[`${currentProduct.code}_${attr}`] || 0).toFixed(1)}</span><button onClick={() => setCustomAttributes(customAttributes.filter(a => a !== attr))} className="text-slate-200 hover:text-red-500"><Trash2 size={20} /></button></div></div>
                    <input type="range" min="0" max="10" step="0.5" value={result.qdaRatings?.[`${currentProduct.code}_${attr}`] || 0} onChange={(e) => handleQdaChange(attr, parseFloat(e.target.value))} className="w-full h-4 bg-slate-100 rounded-full appearance-none accent-fuchsia-600" />
                </div>
            ))}
         </div>
         <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-3xl px-6"><button onClick={handleNextProduct} className="w-full py-8 bg-fuchsia-600 text-white font-black rounded-[32px] shadow-2xl text-2xl flex items-center justify-center gap-4">{currentProductIndex < products.length - 1 ? 'PROSSIMO' : 'CONCLUDI'} <ArrowRight size={32} /></button></div>
      </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <header className="bg-white/80 backdrop-blur-xl border-b border-slate-100 p-6 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-4"><div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black">S</div><h1 className="text-xl font-black uppercase tracking-tighter">{test.name}</h1></div>
        <div className="flex items-center gap-8">
          <div className="hidden md:flex flex-col items-end"><span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Giudice</span><span className="text-sm font-black text-slate-700">{judgeName}</span></div>
          <button onClick={onExit} className="px-5 py-3 rounded-2xl bg-red-50 hover:bg-red-600 text-red-600 hover:text-white font-black text-xs uppercase transition-all flex items-center gap-3">Esci <RefreshCcw size={16} /></button>
        </div>
      </header>
      
      <main className="flex-1 p-6 md:p-12">
        <div className="max-w-4xl mx-auto mb-16"><div className="bg-white/50 border border-white rounded-[32px] p-8 text-center backdrop-blur-sm"><p className="text-2xl font-black text-slate-700 leading-tight">"{test.config.instructions}"</p></div></div>
        
        {test.type === TestType.TRIANGLE && renderTriangle()}
        {test.type === TestType.PAIRED_COMPARISON && renderPairedComparison()}
        {test.type === TestType.QDA && renderQDA()}
        {test.type === TestType.HEDONIC && renderHedonic()}
        {test.type === TestType.CATA && renderCATA()}
        {test.type === TestType.RATA && renderRATA()}
        {test.type === TestType.TDS && renderTDS()}
        {test.type === TestType.NAPPING && renderNapping()}
        {test.type === TestType.SORTING && renderSorting()}
        {test.type === TestType.FLASH_PROFILE && renderFlashProfile()}
      </main>

      <footer className="fixed bottom-0 w-full bg-white/80 backdrop-blur-md p-4 flex justify-center border-t border-slate-100 z-40"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Auto-salvataggio attivo • {judgeName}</span></footer>
    </div>
  );
};