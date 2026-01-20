import React, { useState, useEffect, useRef } from 'react';
import { TestType } from '../types';
import type { SensoryTest, JudgeResult, TDSLogEntry, Product, TILogEntry, Attribute, TriangleResponse } from '../types';
import { Play, Square, CheckCircle, ArrowRight, MousePointer2, Info, Clock, MapPin, RefreshCcw, Target, Layers } from 'lucide-react';
import { supabase } from './supabaseClient';

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
    tdsStartTime: undefined,
    tdsEndTime: undefined,
  });

  const [selectedOne, setSelectedOne] = useState<string | null>(null);
  const [triangleStep, setTriangleStep] = useState<'selection' | 'details'>('selection');
  const [triangleResponse, setTriangleResponse] = useState<TriangleResponse>({
    selectedCode: '',
    sensoryCategoryType: 'aroma',
    description: '',
    intensity: 5,
    isForcedResponse: false
  });
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentDominant, setCurrentDominant] = useState<string | null>(null);
  const [currentIntensity, setCurrentIntensity] = useState(0);
  const [tiHistory, setTiHistory] = useState<{t: number, v: number}[]>([]); 
  const timerRef = useRef<number | null>(null);
  const prevTestIdRef = useRef<string | null>(null);

  const [placedProducts, setPlacedProducts] = useState<string[]>([]);
  const [customAttributes, setCustomAttributes] = useState<string[]>([]);
  const [newAttribute, setNewAttribute] = useState('');

  useEffect(() => {
    if (prevTestIdRef.current !== test.id) {
        if (test.config.randomizePresentation) {
            setProducts(shuffleArray(test.config.products));
        } else {
            setProducts(test.config.products);
        }
        setCurrentProductIndex(0);
        prevTestIdRef.current = test.id;
    }
  }, [test.id, test.config.products, test.config.randomizePresentation]);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
      if (test.type === TestType.TIME_INTENSITY && isTimerRunning && products[currentProductIndex]) {
          const currentProduct = products[currentProductIndex];
          const currentTime = parseFloat(elapsedTime.toFixed(1));
          const logKey = currentProduct.code;
          const newEntry: TILogEntry = { time: currentTime, intensity: currentIntensity };
          
          setTiHistory(prev => [...prev, { t: currentTime, v: currentIntensity }]);
          
          setResult(prev => ({
              ...prev,
              tiLogs: { ...prev.tiLogs, [logKey]: [...(prev.tiLogs?.[logKey] || []), newEntry] }
          }));
      }
  }, [elapsedTime, test.type, isTimerRunning, currentProductIndex, products, currentIntensity]);

  const currentProduct = products[currentProductIndex];

  const handleNextProduct = () => {
    if (currentProductIndex < products.length - 1) {
      if (test.type === TestType.TDS && currentProduct && elapsedTime > 0) {
        const logKey = currentProduct.code;
        const currentLogs = result.tdsLogs?.[logKey] || [];
        // Controlla se c'è già un END, se no lo aggiunge
        const hasEnd = currentLogs.some((log: any) => log.attributeId === 'END');
        if (!hasEnd) {
          const endEntry: TDSLogEntry = { time: parseFloat(elapsedTime.toFixed(1)), attributeId: 'END' };
          setResult(prev => ({
            ...prev,
            tdsLogs: { ...prev.tdsLogs, [logKey]: [...currentLogs, endEntry] }
          }));
        }
      }
      setCurrentProductIndex(prev => prev + 1);
      setSelectedOne(null);
      setIsTimerRunning(false);
      setElapsedTime(0);
      setCurrentDominant(null);
      setCurrentIntensity(0);
      setTiHistory([]);
      if (timerRef.current) clearInterval(timerRef.current);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      if (test.type === TestType.TDS && currentProduct && elapsedTime > 0) {
        const logKey = currentProduct.code;
        const currentLogs = result.tdsLogs?.[logKey] || [];
        // Controlla se c'è già un END, se no lo aggiunge
        const hasEnd = currentLogs.some((log: any) => log.attributeId === 'END');
        if (!hasEnd) {
          const endEntry: TDSLogEntry = { time: parseFloat(elapsedTime.toFixed(1)), attributeId: 'END' };
          setResult(prev => ({
            ...prev,
            tdsLogs: { ...prev.tdsLogs, [logKey]: [...currentLogs, endEntry] },
            tdsEndTime: new Date().toISOString()
          }));
        }
      }
      submitAll();
    }
  };

  // --- FUNZIONE CORRETTA: ALLINEATA AD APP.TSX E AL DATABASE ---
  const submitAll = async () => {
    const finalResult: JudgeResult = {
        ...result as JudgeResult,
        id: generateId(),
        submittedAt: new Date().toISOString(),
        triangleSelection: selectedOne || undefined,
        triangleResponse: test.type === TestType.TRIANGLE ? triangleResponse : undefined
    };
    
    // Non facciamo più la chiamata supabase.from('results').insert qui!
    // Deleghiamo tutto alla funzione onComplete passata da App.tsx
    // che è già configurata per gestire il database correttamente.
    onComplete(finalResult);
  };

  const handleQdaChange = (attrId: string, value: number, prodCode: string = currentProduct?.code || '') => {
    if (!prodCode) return;
    setResult(prev => ({
      ...prev,
      qdaRatings: { ...prev.qdaRatings, [`${prodCode}_${attrId}`]: value }
    }));
  };

  const handleCataToggle = (attrId: string) => {
    if (!currentProduct) return;
    const key = `${currentProduct.code}_${attrId}`;
    const currentSelection = result.cataSelection || [];
    const isSelected = currentSelection.includes(key);
    const newSelection = isSelected ? currentSelection.filter(k => k !== key) : [...currentSelection, key];
    setResult(prev => ({ ...prev, cataSelection: newSelection }));
  };

  const handleRataChange = (attrId: string, intensity: number) => {
      if (!currentProduct) return;
      const key = `${currentProduct.code}_${attrId}`;
      setResult(prev => ({ ...prev, rataSelection: { ...prev.rataSelection, [key]: intensity } }));
  };

  const startTimer = () => {
    setIsTimerRunning(true);
    setElapsedTime(0);
    if (test.type === TestType.TDS && currentProduct) {
      setResult(prev => {
        const logKey = currentProduct.code;
        const currentLogs = prev.tdsLogs?.[logKey] || [];
        const startEntry: TDSLogEntry = { time: 0, attributeId: 'START' };
        return {
          ...prev,
          tdsStartTime: new Date().toISOString(),
          tdsLogs: { ...prev.tdsLogs, [logKey]: [...currentLogs, startEntry] }
        };
      });
    }
    timerRef.current = window.setInterval(() => { setElapsedTime(prev => prev + 0.5); }, 500);
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsTimerRunning(false);
    if (test.type === TestType.TDS && currentProduct) {
      const logKey = currentProduct.code;
      const currentLogs = result.tdsLogs?.[logKey] || [];
      const endEntry: TDSLogEntry = { time: parseFloat(elapsedTime.toFixed(1)), attributeId: 'END' };
      setResult(prev => ({
        ...prev,
        tdsLogs: { ...prev.tdsLogs, [logKey]: [...currentLogs, endEntry] },
        tdsEndTime: new Date().toISOString()
      }));
    }
  };

  const handleDominantClick = (attrId: string) => {
    if (!isTimerRunning || !currentProduct) return;
    setCurrentDominant(attrId);
    const logKey = currentProduct.code;
    const currentLogs = result.tdsLogs?.[logKey] || [];
    const newEntry: TDSLogEntry = { time: parseFloat(elapsedTime.toFixed(1)), attributeId: attrId };
    setResult(prev => ({ ...prev, tdsLogs: { ...prev.tdsLogs, [logKey]: [...currentLogs, newEntry] } }));
  };

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!selectedOne) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const clampedX = Math.max(0, Math.min(100, x));
      const clampedY = Math.max(0, Math.min(100, y));
      setResult(prev => ({ ...prev, nappingData: { ...prev.nappingData, [selectedOne]: { x: clampedX, y: clampedY } } }));
      if (!placedProducts.includes(selectedOne)) { setPlacedProducts([...placedProducts, selectedOne]); }
      setSelectedOne(null);
  };

  const handleSortChange = (prodCode: string, group: string) => {
      setResult(prev => ({ ...prev, sortingGroups: { ...prev.sortingGroups, [prodCode]: group } }));
  };

  const renderTriangle = () => {
    if (triangleStep === 'selection') {
      return (
        <div className="flex flex-col items-center justify-center space-y-12">
          <div className="text-center">
            <h3 className="text-2xl font-bold text-slate-800 mb-2">Test Triangolare</h3>
            <p className="text-slate-500">Seleziona il campione <span className="font-bold text-indigo-600">DIVERSO</span> dagli altri due.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            {products.map(p => (
              <button key={p.code} onClick={() => {
                setSelectedOne(p.code);
                setTriangleResponse(prev => ({ ...prev, selectedCode: p.code }));
              }} className={`w-40 h-40 rounded-full border-4 flex items-center justify-center text-3xl font-black font-mono transition-all shadow-sm active:scale-95 ${selectedOne === p.code ? 'border-indigo-600 bg-indigo-600 text-white scale-110 shadow-xl' : 'border-slate-200 hover:border-indigo-300 bg-white text-slate-700'}`}> {p.code} </button>
            ))}
          </div>
          <button disabled={!selectedOne} onClick={() => setTriangleStep('details')} className="mt-8 px-10 py-4 bg-slate-900 text-white font-bold rounded-2xl disabled:opacity-50 hover:bg-slate-800 shadow-xl transition-all"> Continua </button>
        </div>
      );
    }

    // Step 2: Details
    return (
      <div className="flex flex-col items-center justify-center space-y-8 max-w-2xl">
        <div className="text-center">
          <h3 className="text-2xl font-bold text-slate-800 mb-2">Dettagli della Differenza</h3>
          <p className="text-slate-500">Descrivere la differenza percepita nel campione <span className="font-bold text-indigo-600">{selectedOne}</span></p>
        </div>

        <div className="w-full bg-white rounded-2xl p-8 shadow-sm border border-slate-200 space-y-6">
          {/* Sensory Category */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">Tipo di Sentore *</label>
            <div className="flex gap-4">
              {(['aroma', 'taste'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setTriangleResponse(prev => ({ ...prev, sensoryCategoryType: type }))}
                  className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all border-2 ${
                    triangleResponse.sensoryCategoryType === type
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
                  }`}
                >
                  {type === 'aroma' ? '👃 Odore/Aroma' : '👅 Sapore'}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">Descrizione della Differenza *</label>
            <textarea
              value={triangleResponse.description}
              onChange={e => setTriangleResponse(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Es: Note fruttate, amaro pronunciato, profumo intenso..."
              className="w-full p-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
              rows={3}
            />
          </div>

          {/* Intensity Scale */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">Intensità del Sentore *</label>
            <div className="flex items-center gap-6">
              <input
                type="range"
                min="0"
                max="4"
                value={triangleResponse.intensity}
                onChange={e => setTriangleResponse(prev => ({ ...prev, intensity: parseInt(e.target.value) }))}
                className="flex-1 h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <div className="text-center">
                <span className="text-3xl font-black text-indigo-600">{triangleResponse.intensity}</span>
                <p className="text-xs text-slate-500">/ 4</p>
              </div>
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-2">
              <span>Molto Debole</span>
              <span>Molto Forte</span>
            </div>
          </div>

          {/* Forced Response Question (DIN 10955) */}
          <div className="space-y-3 pt-4 border-t border-slate-200">
            <label className="block text-sm font-semibold text-slate-700">Risposta Forzata? (DIN 10955)</label>
            <p className="text-xs text-slate-500 mb-3">La tua scelta è stata basata su una reale percezione di differenza o è stata una risposta casuale?</p>
            <div className="flex gap-4">
              {[
                { value: false, label: '✓ Percezione Reale', desc: 'Ho percepito chiaramente una differenza' },
                { value: true, label: '? Risposta Forzata', desc: 'Non ero sicuro, ho indovinato' }
              ].map(option => (
                <button
                  key={String(option.value)}
                  onClick={() => setTriangleResponse(prev => ({ ...prev, isForcedResponse: option.value }))}
                  className={`flex-1 p-4 rounded-xl border-2 transition-all text-left ${
                    triangleResponse.isForcedResponse === option.value
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-slate-200 bg-white hover:border-indigo-300'
                  }`}
                >
                  <div className="font-semibold text-slate-800">{option.label}</div>
                  <div className="text-xs text-slate-500 mt-1">{option.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-6">
            <button
              onClick={() => setTriangleStep('selection')}
              className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all"
            >
              Indietro
            </button>
            <button
              disabled={!triangleResponse.description || triangleResponse.description.trim().length === 0}
              onClick={() => {
                const final = {
                  ...result as JudgeResult,
                  id: generateId(),
                  submittedAt: new Date().toISOString(),
                  triangleSelection: selectedOne || '',
                  triangleResponse
                };
                onComplete(final);
              }}
              className="flex-1 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
            >
              Conferma e Invia
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPairedComparison = () => (
    <div className="flex flex-col items-center justify-center space-y-12">
      <div className="text-center">
          <h3 className="text-2xl font-bold text-slate-800 mb-2">Confronto a Coppie</h3>
          <p className="text-slate-500">Quale campione presenta l'intensità <span className="font-bold text-indigo-600">MAGGIORE</span>?</p>
      </div>
      <div className="flex flex-wrap justify-center gap-10">
        {products.map(p => (
          <button key={p.code} onClick={() => setSelectedOne(p.code)} className={`w-48 h-48 rounded-3xl border-4 flex flex-col items-center justify-center gap-2 transition-all shadow-sm active:scale-95 ${selectedOne === p.code ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-4 ring-indigo-200 scale-105' : 'border-slate-200 hover:border-indigo-300 bg-white'}`}> <span className="text-xs text-slate-400 uppercase tracking-widest font-bold">Campione</span> <span className="text-4xl font-black font-mono">{p.code}</span> </button>
        ))}
      </div>
      <button disabled={!selectedOne} onClick={() => {
          const final = { ...result as JudgeResult, id: generateId(), submittedAt: new Date().toISOString(), pairedSelection: selectedOne || '' };
          onComplete(final);
      }} className="mt-8 px-10 py-4 bg-slate-900 text-white font-bold rounded-2xl disabled:opacity-50 hover:bg-slate-800 shadow-xl transition-all"> Conferma Scelta </button>
    </div>
  );

  const renderScaleInput = (attr: Attribute) => {
    if (!currentProduct) return null;
    const scaleType = attr.scaleType || 'linear';
    const val = (result.qdaRatings || {})[`${currentProduct.code}_${attr.id}`] || 0;
    if (scaleType === 'linear9') {
        return (
            <div className="space-y-6">
                <div className="relative h-12 flex items-center mt-12">
                    {attr.referenceValue !== undefined && (
                        <div className="absolute z-20 flex flex-col items-center pointer-events-none" style={{ left: `${((attr.referenceValue - 1) / 8) * 100}%`, transform: 'translateX(-50%)', top: '-42px' }}>
                            <div className="bg-indigo-600 text-white text-[10px] font-black px-2 py-1 rounded-md shadow-lg mb-1 whitespace-nowrap uppercase border border-indigo-400 flex items-center gap-1"> <Target size={10} /> {attr.referenceLabel || 'RIF'}: {attr.referenceValue.toFixed(1)} </div>
                            <div className="w-1 h-10 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(79,70,229,0.4)]" />
                        </div>
                    )}
                    <input type="range" min="1" max="9" step="0.1" value={val} onChange={(e) => handleQdaChange(attr.id, parseFloat(e.target.value))} className="relative w-full h-4 bg-slate-100 rounded-full appearance-none cursor-pointer accent-indigo-600 shadow-inner z-10" />
                </div>
                <div className="flex justify-between px-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{attr.leftAnchor || 'Debole'}</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{attr.rightAnchor || 'Forte'}</span>
                </div>
                <div className="text-center text-lg font-black text-indigo-600">{val.toFixed(1)}</div>
            </div>
        );
    }
    if (scaleType === 'likert9' || scaleType === 'likert7' || scaleType === 'likert5') {
        const points = scaleType === 'likert9' ? 9 : scaleType === 'likert7' ? 7 : 5;
        const range = Array.from({length: points}, (_, i) => i + 1);
        return (
            <div className="flex flex-col gap-4">
                <div className="flex justify-between text-xs font-bold text-slate-400 px-2 uppercase tracking-wider">
                    <span>{attr.leftAnchor || 'Min'}</span>
                    <span>{attr.rightAnchor || 'Max'}</span>
                </div>
                <div className="flex items-center justify-between gap-2 relative py-4">
                    {attr.referenceValue !== undefined && (
                        <div 
                          className="absolute top-0 w-px h-full border-l-2 border-dashed border-indigo-400 pointer-events-none z-0 opacity-50 flex flex-col items-center"
                          style={{ left: `calc(${((attr.referenceValue - 1) / (points - 1)) * 100}% + 0px)` }} 
                        >
                            <div className="bg-indigo-600 text-white text-[8px] px-1 rounded-sm -mt-2 uppercase font-black tracking-tighter shadow-sm whitespace-nowrap">
                                {attr.referenceLabel || 'REF'}
                            </div>
                        </div>
                    )}
                    {range.map(p => (
                         <button key={p} onClick={() => handleQdaChange(attr.id, p)} className={`flex-1 aspect-square rounded-xl border-2 font-bold transition-all active:scale-95 z-10 ${val === p ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg scale-105' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 shadow-sm'}`}> {p} </button>
                    ))}
                </div>
            </div>
        );
    }
    return (
        <div className="space-y-6">
            <div className="relative h-12 flex items-center mt-12">
                {attr.referenceValue !== undefined && (
                    <div className="absolute z-20 flex flex-col items-center pointer-events-none" style={{ left: `${attr.referenceValue}%`, transform: 'translateX(-50%)', top: '-42px' }}>
                        <div className="bg-indigo-600 text-white text-[10px] font-black px-2 py-1 rounded-md shadow-lg mb-1 whitespace-nowrap uppercase border border-indigo-400 flex items-center gap-1"> <Target size={10} /> {attr.referenceLabel || 'RIF'}: {attr.referenceValue} </div>
                        <div className="w-1 h-10 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(79,70,229,0.4)]" />
                    </div>
                )}
                <input type="range" min="0" max="100" step="1" value={val} onChange={(e) => handleQdaChange(attr.id, parseFloat(e.target.value))} className="relative w-full h-4 bg-slate-100 rounded-full appearance-none cursor-pointer accent-indigo-600 shadow-inner z-10" />
            </div>
            <div className="flex justify-between px-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{attr.leftAnchor || 'Debole'}</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{attr.rightAnchor || 'Forte'}</span>
            </div>
        </div>
    );
  };

  const renderQDA = () => {
    if (!currentProduct) return null;
    return (
    <div className="max-w-2xl mx-auto w-full animate-in fade-in duration-500">
      <div className="mb-8 p-6 bg-indigo-50 border border-indigo-100 rounded-3xl flex justify-between items-center shadow-sm">
        <div> <p className="text-sm text-indigo-600 font-bold uppercase tracking-widest mb-1">Campione</p> <p className="text-5xl font-black text-indigo-900 font-mono tracking-tighter">{currentProduct.code}</p> </div>
        <div className="text-right"> <p className="text-xs text-indigo-400 font-bold uppercase mb-1">Progresso</p> <p className="text-lg font-bold text-indigo-900">{currentProductIndex + 1} / {products.length}</p> </div>
      </div>
      <div className="space-y-8">
        {test.config.attributes.map(attr => (
          <div key={attr.id} className="bg-white p-10 rounded-[40px] shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <div className="mb-6">
                 <div className="flex justify-between items-baseline mb-2"> <label className="text-3xl font-black text-slate-900 tracking-tight">{attr.name}</label> </div>
                 {attr.description && <div className="flex gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-sm text-slate-600 leading-relaxed italic"><Info size={16} className="text-slate-400 shrink-0 mt-1"/> <p>{attr.description}</p></div>}
            </div>
            {renderScaleInput(attr)}
          </div>
        ))}
      </div>
      <div className="mt-12 mb-32 flex justify-center">
        <button onClick={handleNextProduct} className="px-12 py-5 bg-indigo-600 text-white font-black rounded-3xl hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all flex items-center gap-3 text-xl active:scale-95 group"> {currentProductIndex < products.length - 1 ? 'PROSSIMO CAMPIONE' : 'INVIA RISULTATI'} <ArrowRight size={28} className="group-hover:translate-x-2 transition-transform" /> </button>
      </div>
    </div>
  )};

  const renderHedonic = () => {
    if (!currentProduct) return null;
    return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="mb-8 p-6 bg-pink-50 border border-pink-100 rounded-3xl flex justify-between items-center shadow-sm">
        <div> <p className="text-sm text-pink-600 font-bold uppercase tracking-widest mb-1">Campione</p> <p className="text-5xl font-black text-pink-900 font-mono">{currentProduct.code}</p> </div>
        <div className="text-right"> <p className="text-xs text-pink-400 font-bold uppercase mb-1">Progresso</p> <p className="text-lg font-bold text-pink-900">{currentProductIndex + 1} / {products.length}</p> </div>
      </div>
      <div className="space-y-8">
        {test.config.attributes.map(attr => {
             const val = result.qdaRatings?.[`${currentProduct.code}_${attr.id}`] || 5;
             return (
              <div key={attr.id} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                <label className="block text-2xl font-bold text-slate-800 mb-8 text-center">{attr.name}</label>
                <div className="flex flex-col gap-3">
                    {[9, 8, 7, 6, 5, 4, 3, 2, 1].map(score => (
                        <label key={score} className={`flex items-center gap-4 p-4 rounded-2xl border cursor-pointer transition-all ${val === score ? 'bg-pink-50 border-pink-500 ring-2 ring-pink-100' : 'hover:bg-slate-50 border-slate-100 shadow-sm'}`}>
                            <input type="radio" name={`hedonic-${attr.id}`} value={score} checked={val === score} onChange={() => handleQdaChange(attr.id, score)} className="w-6 h-6 text-pink-600 accent-pink-600" />
                            <span className={`flex-1 text-lg ${val === score ? 'text-pink-900 font-bold' : 'text-slate-600 font-medium'}`}> {score} </span>
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
        <button onClick={handleNextProduct} className="px-12 py-5 bg-pink-600 text-white font-black rounded-3xl hover:bg-pink-700 shadow-xl shadow-pink-100 transition-all flex items-center gap-3 text-xl active:scale-95"> {currentProductIndex < products.length - 1 ? 'Prossimo Campione' : 'Invia Risultati'} <ArrowRight size={28} /> </button>
      </div>
    </div>
  )};

  const renderCATA = () => {
    if (!currentProduct) return null;
    return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="mb-8 p-6 bg-emerald-50 border border-emerald-100 rounded-3xl flex justify-between items-center shadow-sm">
        <div> <p className="text-sm text-emerald-600 font-bold uppercase tracking-widest mb-1">Campione</p> <p className="text-5xl font-black text-emerald-900 font-mono">{currentProduct.code}</p> </div>
        <div className="text-right"> <p className="text-xs text-emerald-400 font-bold uppercase mb-1">Progresso</p> <p className="text-lg font-bold text-emerald-900">{currentProductIndex + 1} / {products.length}</p> </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {test.config.attributes.map(attr => {
          const isChecked = result.cataSelection?.includes(`${currentProduct.code}_${attr.id}`);
          return (
            <button key={attr.id} onClick={() => handleCataToggle(attr.id)} className={`p-5 rounded-2xl border-2 text-left transition-all active:scale-95 ${isChecked ? 'border-emerald-500 bg-emerald-500 text-white shadow-lg' : 'border-slate-200 hover:border-emerald-200 bg-white'}`}>
              <div className="flex items-center gap-4">
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center ${isChecked ? 'bg-white border-white' : 'border-slate-300 bg-slate-50'}`}> {isChecked && <CheckCircle size={16} className="text-emerald-600" />} </div>
                <span className={`font-bold text-lg ${isChecked ? 'text-white' : 'text-slate-700'}`}>{attr.name}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-12 mb-20 flex justify-center">
        <button onClick={handleNextProduct} className="px-12 py-5 bg-emerald-600 text-white font-black rounded-3xl hover:bg-emerald-700 shadow-xl shadow-emerald-100 transition-all flex items-center gap-3 text-xl active:scale-95"> {currentProductIndex < products.length - 1 ? 'Prossimo Campione' : 'Invia Risultati'} <ArrowRight size={28} /> </button>
      </div>
    </div>
  )};

  const renderRATA = () => {
    if (!currentProduct) return null;
    return (
      <div className="max-w-2xl mx-auto w-full">
        <div className="mb-8 p-6 bg-teal-50 border border-teal-100 rounded-3xl flex justify-between items-center shadow-sm">
           <div> <p className="text-sm text-teal-600 font-bold uppercase tracking-widest mb-1">Campione</p> <p className="text-5xl font-black text-teal-900 font-mono">{currentProduct.code}</p> </div>
           <div className="text-right"> <p className="text-xs text-teal-400 font-bold uppercase mb-1">Progresso</p> <p className="text-lg font-bold text-teal-900">{currentProductIndex + 1} / {products.length}</p> </div>
        </div>
        <div className="grid gap-4">
          {test.config.attributes.map(attr => {
            const key = `${currentProduct.code}_${attr.id}`;
            const currentVal = result.rataSelection?.[key] || 0;
            const isChecked = currentVal > 0;
            return (
              <div key={attr.id} className={`p-6 rounded-[32px] border-2 transition-all ${isChecked ? 'border-teal-500 bg-teal-50/50 shadow-lg scale-[1.02]' : 'border-slate-200 bg-white'}`}>
                <div className="flex flex-col gap-6">
                    <button onClick={() => handleRataChange(attr.id, isChecked ? 0 : 1)} className="flex items-center gap-4 group text-left">
                         <div className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all ${isChecked ? 'bg-teal-500 border-teal-500 shadow-teal-200' : 'border-slate-300 bg-slate-50 group-hover:border-teal-300'}`}> {isChecked && <CheckCircle size={20} className="text-white" />} </div>
                        <span className={`font-black text-2xl tracking-tight transition-colors ${isChecked ? 'text-teal-900' : 'text-slate-700 group-hover:text-teal-600'}`}>{attr.name}</span>
                    </button>
                    {isChecked && (
                        <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
                            <span className="text-[10px] font-black text-teal-600 uppercase tracking-widest ml-1">Quanto è intenso?</span>
                            <div className="flex items-center gap-3">
                                {[1, 2, 3].map(lvl => (
                                    <button key={lvl} onClick={() => handleRataChange(attr.id, lvl)} className={`flex-1 py-4 rounded-2xl font-black text-sm transition-all border-2 ${currentVal === lvl ? 'bg-teal-600 border-teal-600 text-white shadow-xl scale-105' : 'bg-white border-teal-100 text-teal-600 hover:bg-teal-50'}`}> 
                                        {lvl === 1 ? 'Basso' : lvl === 2 ? 'Medio' : 'Alto'} ({lvl})
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-12 mb-20 flex justify-center">
          <button onClick={handleNextProduct} className="px-12 py-5 bg-teal-600 text-white font-black rounded-3xl hover:bg-teal-700 shadow-xl shadow-teal-100 transition-all flex items-center gap-3 text-xl active:scale-95"> {currentProductIndex < products.length - 1 ? 'Prossimo Campione' : 'Invia Risultati'} <ArrowRight size={28} /> </button>
        </div>
      </div>
  )};

  const renderTDS = () => {
    if (!currentProduct) return null;
    const duration = test.config.durationSeconds || 60;
    const progress = (elapsedTime / duration) * 100;
    return (
      <div className="max-w-4xl mx-auto w-full">
         <div className="mb-8 p-6 bg-orange-50 border border-orange-100 rounded-3xl flex justify-between items-center shadow-sm">
            <div> <p className="text-sm text-orange-600 font-bold uppercase tracking-widest mb-1">Campione</p> <p className="text-5xl font-black text-orange-900 font-mono tracking-tighter">{currentProduct.code}</p> </div>
            <div className="text-right flex flex-col items-end"> 
                <div className="flex items-center gap-2 text-3xl font-mono font-black text-orange-900"> <Clock size={24} className="text-orange-400"/> {elapsedTime.toFixed(1)}s </div> 
                <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">Tempo Trascorso</span>
            </div>
          </div>
          <div className="w-full h-6 bg-slate-100 rounded-full mb-10 overflow-hidden shadow-inner border border-slate-200"> <div className="h-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-500 ease-linear" style={{ width: `${Math.min(progress, 100)}%` }} /> </div>
          {!isTimerRunning && elapsedTime === 0 && (
             <button onClick={startTimer} className="w-full py-20 border-4 border-dashed border-slate-200 rounded-3xl hover:border-orange-500 hover:bg-orange-50 flex flex-col items-center gap-6 group transition-all cursor-pointer bg-white"> 
                <div className="p-6 bg-orange-100 rounded-full text-orange-600 group-hover:scale-110 transition-transform"><Play size={64} fill="currentColor" /></div>
                <span className="text-2xl font-black text-slate-400 group-hover:text-orange-700 uppercase tracking-widest">Avvia Timer</span> 
             </button>
          )}
          {isTimerRunning && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {test.config.attributes.map(attr => (
                <button key={attr.id} onClick={() => handleDominantClick(attr.id)} className={`p-8 rounded-2xl font-bold text-xl transition-all shadow-sm active:scale-95 ${currentDominant === attr.id ? 'bg-orange-600 text-white scale-105 shadow-xl ring-4 ring-orange-200' : 'bg-white text-slate-700 border-2 border-slate-100 hover:border-orange-200'}`}> {attr.name} </button>
              ))}
              <button onClick={() => { stopTimer(); handleNextProduct(); }} className="col-span-full mt-8 py-6 bg-slate-900 text-white rounded-2xl font-black hover:bg-black flex items-center justify-center gap-3 shadow-xl uppercase tracking-widest transition-all"> <Square size={24} fill="currentColor" /> STOP & Prossimo </button>
            </div>
          )}
           {!isTimerRunning && elapsedTime > 0 && (
             <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 shadow-sm"> 
                <p className="text-slate-400 font-bold uppercase tracking-widest mb-6">Valutazione Completata</p> 
                <button onClick={handleNextProduct} className="px-12 py-5 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 font-black shadow-xl shadow-indigo-100 transition-all text-xl"> {currentProductIndex < products.length - 1 ? 'Prossimo Campione' : 'Concludi Sessione'} </button> 
             </div>
           )}
      </div>
    );
  };

  const renderTimeIntensity = () => {
    if (!currentProduct) return null;
    const duration = test.config.durationSeconds || 60;
    const progress = (elapsedTime / duration) * 100;
    const attrName = test.config.attributes[0]?.name || "Intensità";
    const chartWidth = 100;
    const chartHeight = 100;
    const polylinePoints = tiHistory.map(p => {
        const x = (p.t / duration) * chartWidth;
        const y = chartHeight - (p.v / 100) * chartHeight;
        return `${x},${y}`;
    }).join(' ');
    const getColor = (intensity: number) => {
        if (intensity < 30) return 'rgb(34, 197, 94)'; 
        if (intensity < 60) return 'rgb(234, 179, 8)'; 
        return 'rgb(239, 68, 68)'; 
    };
    return (
      <div className="max-w-2xl mx-auto w-full">
         <div className="mb-8 p-6 bg-cyan-50 border border-cyan-100 rounded-3xl flex justify-between items-center shadow-sm">
            <div> <p className="text-sm text-cyan-600 font-bold uppercase tracking-widest mb-1">Campione {currentProduct.code}</p> <p className="text-2xl font-black text-cyan-900">Valuta: {attrName}</p> </div>
            <div className="text-right flex flex-col items-end"> 
                <div className="flex items-center gap-2 text-3xl font-mono font-black text-cyan-900"> <Clock size={24} className="text-cyan-400"/> {elapsedTime.toFixed(1)}s </div> 
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Registrazione TI</span>
            </div>
          </div>
          <div className="w-full h-4 bg-slate-100 rounded-full mb-10 overflow-hidden shadow-inner border border-slate-200"> <div className="h-full bg-gradient-to-r from-cyan-400 to-cyan-600 transition-all duration-500 ease-linear" style={{ width: `${Math.min(progress, 100)}%` }} /> </div>
          {!isTimerRunning && elapsedTime === 0 ? (
             <button onClick={startTimer} className="w-full py-20 border-4 border-dashed border-slate-200 rounded-3xl hover:border-cyan-500 hover:bg-cyan-50 flex flex-col items-center gap-6 group transition-all cursor-pointer bg-white"> 
                <div className="p-6 bg-cyan-100 rounded-full text-cyan-600 group-hover:scale-110 transition-transform"><Play size={64} fill="currentColor" /></div>
                <span className="text-2xl font-black text-slate-400 group-hover:text-cyan-700 uppercase tracking-widest">Avvia Registrazione TI</span> 
             </button>
          ) : isTimerRunning ? (
            <div className="flex flex-col items-center gap-8">
                <div className="relative w-full h-[400px] flex gap-4">
                    <div className="flex-1 bg-slate-100 rounded-3xl border-2 border-slate-200 relative overflow-hidden shadow-inner flex flex-col-reverse touch-none">
                        <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none"> <polyline points={polylinePoints} fill="none" stroke="currentColor" strokeWidth="1" /> </svg>
                        <div className="w-full transition-all duration-75 ease-linear flex items-start justify-center relative" style={{ height: `${currentIntensity}%`, backgroundColor: getColor(currentIntensity) }}> <div className="w-full h-1 bg-white/50 absolute top-0"></div> </div>
                        <input type="range" min="0" max="100" step="1" value={currentIntensity} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentIntensity(Number(e.target.value))} className="absolute inset-0 w-full h-full opacity-0 cursor-ns-resize z-10" style={{ writingMode: 'bt-lr', WebkitAppearance: 'slider-vertical' } as any} />
                        <div className="absolute right-4 top-4 text-xs font-bold text-slate-400 uppercase tracking-widest pointer-events-none">Max</div>
                        <div className="absolute right-4 bottom-4 text-xs font-bold text-slate-400 uppercase tracking-widest pointer-events-none">Min</div>
                    </div>
                    <div className="w-24 flex flex-col justify-end items-center pb-4"> <span className="text-6xl font-black tabular-nums tracking-tighter" style={{color: getColor(currentIntensity)}}>{currentIntensity}</span> <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Intensità</span> </div>
                </div>
                <button onClick={() => { stopTimer(); handleNextProduct(); }} className="w-full py-6 bg-slate-900 text-white rounded-2xl font-black hover:bg-black flex items-center justify-center gap-3 shadow-xl uppercase tracking-widest"> <Square size={24} fill="currentColor" /> STOP </button>
            </div>
          ) : (
             <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 shadow-sm"> 
                <button onClick={handleNextProduct} className="px-12 py-5 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 font-black shadow-xl transition-all text-xl"> {currentProductIndex < products.length - 1 ? 'Prossimo' : 'Concludi'} </button> 
             </div>
          )}
      </div>
    );
  };

  const renderNapping = () => (
      <div className="flex flex-col h-[85vh] w-full max-w-7xl mx-auto">
          <div className="mb-4 flex justify-between items-center px-2"> 
              <div>
                  <h3 className="font-bold text-2xl text-slate-900 flex items-center gap-2"><MapPin className="text-indigo-600"/> Mappa Proiettiva</h3>
                  <p className="text-slate-500 text-sm">Trascina i prodotti sulla tovaglia. Vicini = Simili.</p>
              </div>
              <button onClick={submitAll} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg transition-all text-sm">Termina Test</button> 
          </div>
          <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0 bg-white rounded-3xl p-4 shadow-sm border border-slate-200">
              <div className="w-full md:w-48 flex flex-col gap-2 overflow-y-auto pr-2 border-r border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 sticky top-0 bg-white py-2">1. Seleziona</p>
                  {products.map(p => {
                      const isPlaced = placedProducts.includes(p.code);
                      const isSelected = selectedOne === p.code;
                      return (
                          <button key={p.code} onClick={() => setSelectedOne(p.code)} className={`p-3 rounded-xl text-left font-mono font-bold transition-all relative overflow-hidden ${isSelected ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-300' : isPlaced ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-white border-2 border-slate-100 hover:border-indigo-300 text-slate-700'}`}> 
                            <div className="flex justify-between items-center z-10 relative"> <span>{p.code}</span> {isPlaced && <CheckCircle size={14} className="text-green-600"/>} {isSelected && <MousePointer2 size={14} className="text-indigo-200 animate-pulse"/>} </div>
                            {isPlaced && !isSelected && <div className="absolute inset-0 bg-green-100/30" />}
                          </button>
                      );
                  })}
                  <button onClick={() => { setPlacedProducts([]); setResult(prev => ({...prev, nappingData: {}})) }} className="mt-auto p-2 text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 justify-center border-t border-slate-100 pt-4"> <RefreshCcw size={12}/> Reset </button>
              </div>
              <div className="flex-1 relative bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-300 cursor-crosshair overflow-hidden shadow-inner" onClick={handleMapClick}>
                  <div className="absolute top-1/2 left-0 w-full h-px bg-slate-300 z-0"></div> <div className="absolute left-1/2 top-0 h-full w-px bg-slate-300 z-0"></div>
                  {Object.entries(result.nappingData || {}).map(([code, coords]) => { 
                      const c = coords as { x: number, y: number }; 
                      return ( <div key={code} className="absolute w-12 h-12 -ml-6 -mt-6 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg border-4 border-white transition-all transform hover:scale-110 z-10 hover:z-20 cursor-pointer" style={{ left: `${c.x}%`, top: `${c.y}%` }} onClick={(e) => { e.stopPropagation(); setSelectedOne(code); }}> {code} </div> )
                  })}
                  {selectedOne ? ( <div className="absolute top-4 right-4 bg-indigo-600 text-white px-4 py-2 rounded-full text-xs font-bold animate-bounce z-30"> <MousePointer2 size={14}/> Posiziona {selectedOne} </div> ) : ( <div className="absolute bottom-4 left-4 text-slate-400 font-bold text-xs pointer-events-none bg-white/80 px-3 py-1 rounded-full border border-slate-200"> Clicca a sinistra poi qui </div> )}
              </div>
          </div>
      </div>
  );

  const renderSorting = () => {
    return (
        <div className="max-w-4xl mx-auto w-full">
            <div className="text-center mb-10">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mx-auto mb-4"> <Layers size={32} /> </div>
                <h3 className="text-3xl font-black text-slate-900">Sorting</h3>
                <p className="text-slate-500 font-medium">Assegna lo stesso nome ai campioni simili.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {products.map(p => (
                    <div key={p.code} className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm flex flex-col gap-6 group transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-20 h-20 bg-slate-900 text-white rounded-[24px] flex items-center justify-center text-4xl font-black font-mono shadow-lg group-hover:scale-110 transition-transform"> {p.code} </div>
                            <div className="flex-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Campione</span>
                                <p className="font-bold text-slate-800">{p.name || 'Prodotto'}</p>
                            </div>
                        </div>
                        <div className="relative">
                            <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block mb-2 ml-1">Gruppo</label>
                            <input type="text" value={result.sortingGroups?.[p.code] || ''} onChange={(e) => handleSortChange(p.code, e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-indigo-500 focus:bg-white outline-none font-bold text-slate-800 transition-all" placeholder="Es: Dolce..." />
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-16 flex justify-center">
                <button onClick={submitAll} className="px-16 py-6 bg-slate-900 text-white rounded-[32px] font-black shadow-2xl active:scale-95 transition-all text-xl uppercase tracking-widest"> INVIA </button>
            </div>
        </div>
    );
  };

  const renderFlashProfile = () => {
      if (!currentProduct) return null;
      return (
      <div className="w-full max-w-3xl mx-auto">
         <div className="mb-8 p-6 bg-fuchsia-50 border border-fuchsia-100 rounded-3xl flex justify-between items-center shadow-sm">
            <div> <p className="text-sm text-fuchsia-600 font-bold uppercase tracking-widest mb-1">Campione</p> <p className="text-5xl font-black text-fuchsia-900 font-mono">{currentProduct.code}</p> </div>
            <div className="text-right"> <p className="text-xs text-fuchsia-400 font-bold uppercase mb-1">Progresso</p> <p className="text-lg font-bold text-fuchsia-900">{currentProductIndex + 1} / {products.length}</p> </div>
          </div>
          <div className="mb-8 flex gap-3">
              <input value={newAttribute} onChange={e => setNewAttribute(e.target.value)} placeholder="Scrivi un attributo..." className="flex-1 p-4 border-2 border-slate-200 rounded-xl shadow-sm focus:border-fuchsia-500 outline-none font-medium transition-all" onKeyDown={e => { if(e.key === 'Enter' && newAttribute) { if (!customAttributes.includes(newAttribute)) { setCustomAttributes([...customAttributes, newAttribute]); } setNewAttribute(''); } }} />
              <button onClick={() => { if(newAttribute && !customAttributes.includes(newAttribute)) { setCustomAttributes([...customAttributes, newAttribute]); setNewAttribute(''); } }} className="px-6 py-4 bg-slate-900 text-white rounded-xl font-bold active:scale-95 transition-transform"> + </button>
          </div>
          <div className="space-y-6 mb-12">
              {customAttributes.map(attr => (
                  <div key={attr} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-in slide-in-from-bottom-2">
                      <div className="flex justify-between mb-4 items-center"> <span className="text-lg font-bold text-slate-800">{attr}</span> <span className="font-mono text-fuchsia-600 font-black text-xl">{result.qdaRatings?.[`${currentProduct.code}_${attr}`] || 0}</span> </div>
                      <input type="range" min="0" max="10" step="0.5" value={result.qdaRatings?.[`${currentProduct.code}_${attr}`] || 0} onChange={(e) => handleQdaChange(attr, parseFloat(e.target.value))} className="w-full h-3 bg-slate-100 rounded-full appearance-none accent-fuchsia-600" />
                  </div>
              ))}
          </div>
          <div className="flex justify-center">
            <button onClick={handleNextProduct} className="px-12 py-5 bg-fuchsia-600 text-white rounded-2xl hover:bg-fuchsia-700 font-black shadow-xl transition-all flex items-center gap-3 text-xl active:scale-95 uppercase tracking-widest"> {currentProductIndex < products.length - 1 ? 'Prossimo' : 'Concludi'} <ArrowRight size={24} /> </button>
          </div>
      </div>
  )};

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-inter">
      <header className="bg-white border-b p-5 flex justify-between items-center sticky top-0 z-50 backdrop-blur-md bg-white/80">
        <h1 className="text-xl font-black text-slate-900 uppercase tracking-tighter truncate max-w-[50%]">{test.name}</h1>
        <div className="flex items-center gap-6">
          <div className="hidden sm:flex flex-col items-end">
             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Giudice</span>
             <span className="text-sm font-bold text-slate-900">{judgeName}</span>
          </div>
          <button onClick={onExit} className="text-xs font-black text-red-500 hover:text-red-700 uppercase tracking-widest border border-red-100 px-4 py-2 rounded-full bg-red-50/30 transition-colors">Esci</button>
        </div>
      </header>
      <main className="flex-1 p-6 md:p-12">
        <div className="max-w-3xl mx-auto mb-12 text-center">
            <p className="text-lg text-slate-600 leading-relaxed font-medium italic">"{test.config.instructions}"</p>
        </div>
        {test.type === TestType.TRIANGLE && renderTriangle()}
        {test.type === TestType.PAIRED_COMPARISON && renderPairedComparison()}
        {test.type === TestType.QDA && renderQDA()}
        {test.type === TestType.HEDONIC && renderHedonic()}
        {test.type === TestType.CATA && renderCATA()}
        {test.type === TestType.RATA && renderRATA()}
        {test.type === TestType.TDS && renderTDS()}
        {test.type === TestType.TIME_INTENSITY && renderTimeIntensity()}
        {test.type === TestType.NAPPING && renderNapping()}
        {test.type === TestType.SORTING && renderSorting()}
        {test.type === TestType.FLASH_PROFILE && renderFlashProfile()}
      </main>
    </div>
  );
};