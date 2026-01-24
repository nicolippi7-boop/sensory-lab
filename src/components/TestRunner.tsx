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
  const prevTestIdRef = useRef<string | null>(null);

  const [placedProducts, setPlacedProducts] = useState<string[]>([]);
  const [customAttributes, setCustomAttributes] = useState<string[]>([]);
  const [newAttribute, setNewAttribute] = useState('');

  useEffect(() => {
    if (prevTestIdRef.current !== test.id) {
        const initialProducts = test.config.randomizePresentation
            ? shuffleArray(test.config.products)
            : [...test.config.products];
        setProducts(initialProducts);
        setCurrentProductIndex(0);
        prevTestIdRef.current = test.id;

        setResult(prev => {
            const baseResult: Partial<JudgeResult> = {
                ...prev,
                qdaRatings: {},
                cataSelection: [],
                rataSelection: {},
                tdsLogs: {},
                tiLogs: {},
                nappingData: {},
                sortingGroups: {},
            };

            if (test.type === TestType.QDA || test.type === TestType.HEDONIC) {
                const defaultRatings: { [key: string]: number } = {};
                initialProducts.forEach(product => {
                    test.config.attributes.forEach(attr => {
                        const key = `${product.code}_${attr.id}`;
                        if (test.type === TestType.HEDONIC) {
                            defaultRatings[key] = 5;
                        } else {
                            const scaleType = attr.scaleType || 'linear';
                            if (scaleType === 'linear9' || scaleType === 'linear10' || scaleType.startsWith('likert')) {
                                defaultRatings[key] = 1;
                            } else {
                                defaultRatings[key] = 0;
                            }
                        }
                    });
                });
                baseResult.qdaRatings = defaultRatings;
            }
            return baseResult;
        });
    }
  }, [test.id, test.config.products, test.config.randomizePresentation, test.type, test.config.attributes]);

  useEffect(() => {
    return () => { 
      if (timerRef.current) clearInterval(timerRef.current); 
    };
  }, []);

  // CORREZIONE 1: Timer effect migliorato (come nel secondo codice)
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = window.setInterval(() => {
        setElapsedTime(prev => {
          const newTime = prev + 0.1;
          const duration = test.config.durationSeconds || 60;
          if (newTime >= duration) {
            stopTimer();
            return duration;
          }
          return parseFloat(newTime.toFixed(1));
        });
      }, 100);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning, test.config.durationSeconds]);

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
      finalizeTDSAndSubmit();
    }
  };

  const finalizeTDSAndSubmit = () => {
    if (test.type === TestType.TDS && currentProduct) {
      const logKey = currentProduct.code;
      const currentLogs = result.tdsLogs?.[logKey] || [];
      const hasEnd = currentLogs.some((log: any) => log.attributeId === 'END');
     
      if (!hasEnd && elapsedTime > 0) {
        const endEntry: TDSLogEntry = { time: parseFloat(elapsedTime.toFixed(1)), attributeId: 'END' };
        const updatedResult: Partial<JudgeResult> = {
          ...result,
          tdsLogs: { ...result.tdsLogs, [logKey]: [...currentLogs, endEntry] },
          tdsEndTime: new Date().toISOString()
        };
       
        const finalResult: JudgeResult = {
          ...updatedResult as JudgeResult,
          id: generateId(),
          submittedAt: new Date().toISOString(),
          triangleSelection: selectedOne || undefined,
          triangleResponse: test.type === TestType.TRIANGLE ? triangleResponse : undefined
        };
        onComplete(finalResult);
      } else {
        submitAll();
      }
    } else {
      submitAll();
    }
  };

  const submitAll = async () => {
    const finalResult: JudgeResult = {
        ...result as JudgeResult,
        id: generateId(),
        submittedAt: new Date().toISOString(),
        triangleSelection: selectedOne || undefined,
        triangleResponse: test.type === TestType.TRIANGLE ? triangleResponse : undefined
    };
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
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsTimerRunning(false);
    if (test.type === TestType.TDS && currentProduct) {
      const logKey = currentProduct.code;
      const currentLogs = result.tdsLogs?.[logKey] || [];
      const hasStart = currentLogs.some((log: any) => log.attributeId === 'START');
      const hasEnd = currentLogs.some((log: any) => log.attributeId === 'END');
     
      let updatedLogs = [...currentLogs];
     
      if (!hasStart) {
        const startEntry: TDSLogEntry = { time: 0, attributeId: 'START' };
        updatedLogs.unshift(startEntry);
      }
     
      if (!hasEnd) {
        const endEntry: TDSLogEntry = { time: parseFloat(elapsedTime.toFixed(1)), attributeId: 'END' };
        updatedLogs.push(endEntry);
      }
     
      setResult(prev => ({
        ...prev,
        tdsLogs: { ...prev.tdsLogs, [logKey]: updatedLogs },
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

  const handleMapClick = (e: React.MouseEvent) => {
      if (!selectedOne) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const clampedX = Math.max(0, Math.min(100, x));
      const clampedY = Math.max(0, Math.min(100, y));
      setResult(prev => ({ 
        ...prev, 
        nappingData: { 
          ...prev.nappingData, 
          [selectedOne]: { x: clampedX, y: clampedY } 
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
        sortingGroups: { ...prev.sortingGroups, [prodCode]: group } 
      }));
  };

  // ===== CORREZIONE TDS =====
  const renderTDS = () => {
    if (!currentProduct) return null;
    const duration = test.config.durationSeconds || 60;
    const progress = (elapsedTime / duration) * 100;
    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Campione {currentProduct.code}</h2>
          <div className="text-right">
            <div className="text-3xl font-black">{elapsedTime.toFixed(1)}s</div>
            <div className="text-sm text-slate-500">Tempo Trascorso</div>
          </div>
        </div>
        
        <div className="h-3 bg-slate-200 rounded-full overflow-hidden mb-8">
          <div className="h-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-500 ease-linear" 
               style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
        
        {!isTimerRunning && elapsedTime === 0 && (
          <div className="text-center py-12">
            <Target size={64} className="mx-auto mb-6 text-orange-500" />
            <h3 className="text-2xl font-bold mb-4">Pronto per iniziare?</h3>
            <p className="text-slate-600 mb-8">Clicca su Avvia Timer e seleziona le sensazioni dominanti</p>
            <button onClick={startTimer} className="px-8 py-4 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-all flex items-center gap-3 mx-auto">
              <Play size={24} />
              Avvia Timer TDS
            </button>
          </div>
        )}
        
        {isTimerRunning && (
          <>
            <h3 className="text-lg font-semibold mb-4">Clicca sulle sensazioni DOMINANTI:</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {test.config.attributes.map(attr => (
                <button key={attr.id} onClick={() => handleDominantClick(attr.id)} 
                  className={`p-6 rounded-2xl font-bold text-lg transition-all shadow-sm ${
                    currentDominant === attr.id
                      ? 'bg-orange-600 text-white scale-105 shadow-xl ring-4 ring-orange-200'
                      : 'bg-white text-slate-700 border-2 border-slate-100 hover:border-orange-200'
                  }`}>
                  {attr.name}
                  {currentDominant === attr.id && (
                    <div className="text-sm font-normal mt-2 opacity-90">
                      Selezionato a {elapsedTime.toFixed(1)}s
                    </div>
                  )}
                </button>
              ))}
            </div>
            
            {/* AGGIUNTO: Cronologia TDS (mancava nel primo codice) */}
            <div className="mt-12">
              <h4 className="text-lg font-semibold mb-4">Cronologia TDS</h4>
              <div className="bg-slate-50 rounded-xl p-4">
                {result.tdsLogs?.[currentProduct.code]?.length > 0 ? (
                  <div className="space-y-2">
                    {result.tdsLogs[currentProduct.code].map((log, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white p-3 rounded-lg">
                        <span className="font-medium">{log.attributeId}</span>
                        <span className="font-bold text-orange-600">{log.time.toFixed(1)}s</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-slate-400 py-8">
                    Nessuna sensazione registrata ancora
                  </div>
                )}
              </div>
            </div>
            
            <button onClick={() => { stopTimer(); handleNextProduct(); }} 
                    className="w-full mt-8 py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition-all flex items-center justify-center gap-3">
              <Square size={24} />
              STOP & Prossimo
            </button>
          </>
        )}
        
        {!isTimerRunning && elapsedTime > 0 && (
          <div className="mt-8 flex gap-4">
            <button onClick={startTimer} className="flex-1 py-4 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300 transition-all flex items-center justify-center gap-3">
              <RefreshCcw size={20} />
              Riprendi
            </button>
            <button onClick={() => { stopTimer(); handleNextProduct(); }} 
                    className="flex-1 py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-black transition-all flex items-center justify-center gap-3">
              <ArrowRight size={20} />
              {currentProductIndex < products.length - 1 ? 'Prossimo Campione' : 'Concludi Sessione'}
            </button>
          </div>
        )}
      </div>
    );
  };

  // ===== CORREZIONE TIME INTENSITY =====
  const renderTimeIntensity = () => {
    if (!currentProduct) return null;
    const duration = test.config.durationSeconds || 60;
    const progress = (elapsedTime / duration) * 100;
    const attrName = test.config.attributes[0]?.name || "Intensità";
    
    const getColor = (intensity: number) => {
      if (intensity < 30) return 'rgb(34, 197, 94)';
      if (intensity < 60) return 'rgb(234, 179, 8)';
      return 'rgb(239, 68, 68)';
    };
    
    // AGGIUNTO: Grafico SVG (mancava nel primo codice)
    const chartWidth = 100;
    const chartHeight = 100;
    const polylinePoints = tiHistory.map(p => {
      const x = (p.t / duration) * chartWidth;
      const y = chartHeight - (p.v / 100) * chartHeight;
      return `${x},${y}`;
    }).join(' ');
    
    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Campione {currentProduct.code} Valuta: {attrName}</h2>
          <div className="text-right">
            <div className="text-3xl font-black text-cyan-600">{elapsedTime.toFixed(1)}s</div>
            <div className="text-sm text-slate-500">Registrazione TI</div>
          </div>
        </div>
        
        <div className="h-3 bg-slate-200 rounded-full overflow-hidden mb-8">
          <div className="h-full bg-gradient-to-r from-cyan-400 to-cyan-600 transition-all duration-500 ease-linear" 
               style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Grafico SVG aggiunto */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
            <h3 className="text-lg font-semibold mb-4">Andamento Temporale</h3>
            <div className="h-64">
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {Array.from({ length: 10 }).map((_, i) => (
                  <g key={i}>
                    <line x1="0" y1={i * 10} x2="100" y2={i * 10} stroke="#e5e7eb" strokeWidth="0.5" />
                    <line x1={i * 10} y1="0" x2={i * 10} y2="100" stroke="#e5e7eb" strokeWidth="0.5" />
                  </g>
                ))}
                <polyline
                  points={polylinePoints}
                  fill="none"
                  stroke="rgb(6, 182, 212)"
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-200">
            <div className="flex flex-col items-center justify-center gap-8">
              <div className="relative h-64 w-32 bg-gradient-to-t from-green-400 via-yellow-400 to-red-500 rounded-2xl overflow-hidden border-4 border-white shadow-xl">
                <div className="absolute bottom-0 w-full transition-all duration-75 ease-linear"
                     style={{ height: `${currentIntensity}%`, backgroundColor: getColor(currentIntensity) }}>
                </div>
                <input type="range" min="1" max="100" step="1" value={currentIntensity} 
                       onChange={(e) => setCurrentIntensity(Number(e.target.value))}
                       className="absolute inset-0 w-full h-full opacity-0 cursor-ns-resize z-10"
                       style={{ writingMode: 'vertical-lr', direction: 'rtl' } as any} />
              </div>
              
              <div className="text-center">
                <div className="text-6xl font-black" style={{color: getColor(currentIntensity)}}>
                  {currentIntensity}
                </div>
                <div className="text-lg font-medium text-slate-600 mt-2">Intensità</div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-8">
          {!isTimerRunning && elapsedTime === 0 ? (
            <button onClick={startTimer} className="w-full py-4 bg-cyan-500 text-white font-bold rounded-xl hover:bg-cyan-600 transition-all flex items-center justify-center gap-3">
              <Play size={24} />
              Avvia Registrazione TI
            </button>
          ) : isTimerRunning ? (
            <button onClick={() => { stopTimer(); handleNextProduct(); }} 
                    className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-black transition-all flex items-center justify-center gap-3">
              <Square size={24} />
              STOP e Prossimo
            </button>
          ) : (
            <button onClick={handleNextProduct} 
                    className="w-full py-4 bg-green-500 text-white font-bold rounded-xl hover:bg-green-600 transition-all flex items-center justify-center gap-3">
              <ArrowRight size={24} />
              {currentProductIndex < products.length - 1 ? 'Prossimo' : 'Concludi'}
            </button>
          )}
        </div>
      </div>
    );
  };

  // ===== CORREZIONE FLASH PROFILE =====
  const renderFlashProfile = () => {
    if (!currentProduct) return null;
    
    // AGGIUNTO: Carica attributi dal localStorage se esistono
    useEffect(() => {
      const savedAttrs = localStorage.getItem(`flashProfile_${test.id}_attributes`);
      if (savedAttrs && customAttributes.length === 0) {
        try {
          setCustomAttributes(JSON.parse(savedAttrs));
        } catch (e) {
          console.error('Error loading saved attributes', e);
        }
      }
    }, [test.id]);
    
    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">Campione {currentProduct.code}</h2>
            <div className="text-slate-600">Flash Profile - Attributi Liberi</div>
          </div>
          <div className="text-sm text-slate-500">
            Progresso: {currentProductIndex + 1} / {products.length}
          </div>
        </div>
        
        {/* AGGIUNGI ATTRIBUTO - migliorato */}
        <div className="mb-8 p-6 bg-white rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold mb-4">Aggiungi un nuovo attributo descrittivo</h3>
          <div className="flex gap-4">
            <input value={newAttribute} onChange={e => setNewAttribute(e.target.value)} 
                   placeholder="Es: Note fruttate, amaro persistente, cremoso..."
                   className="flex-1 p-4 border-2 border-slate-200 rounded-xl shadow-sm focus:border-fuchsia-500 outline-none font-medium"
                   onKeyDown={e => {
                     if(e.key === 'Enter' && newAttribute.trim()) {
                       if (!customAttributes.includes(newAttribute.trim())) {
                         setCustomAttributes([...customAttributes, newAttribute.trim()]);
                       }
                       setNewAttribute('');
                     }
                   }} />
            <button onClick={() => { 
              if(newAttribute.trim() && !customAttributes.includes(newAttribute.trim())) {
                setCustomAttributes([...customAttributes, newAttribute.trim()]);
                setNewAttribute('');
              }
            }} className="px-8 py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition-all flex items-center gap-2">
              <span className="text-xl">+</span> Aggiungi
            </button>
          </div>
          <div className="mt-3 text-sm text-slate-500">
            Suggerimenti: aroma, sapore, texture, aftertaste, aspetto...
          </div>
        </div>
        
        {/* ATTRIBUTI ESISTENTI - migliorato */}
        {customAttributes.length === 0 ? (
          <div className="text-center py-12">
            <Layers size={64} className="mx-auto mb-6 text-slate-300" />
            <h3 className="text-xl font-semibold mb-2">Nessun attributo ancora creato</h3>
            <p className="text-slate-500">Inizia aggiungendo degli attributi descrittivi usando il campo sopra.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">Attributi Creati ({customAttributes.length})</h3>
            
            {customAttributes.map((attr, index) => {
              const currentValue = result.qdaRatings?.[`${currentProduct.code}_${attr}`] || 0;
              
              return (
                <div key={index} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-fuchsia-100 flex items-center justify-center text-fuchsia-700 font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <h4 className="font-bold text-lg">{attr}</h4>
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <div className={`w-2 h-2 rounded-full ${
                            currentValue === 0 ? 'bg-slate-300' :
                            currentValue <= 3 ? 'bg-green-500' :
                            currentValue <= 6 ? 'bg-yellow-500' : 'bg-red-500'
                          }`} />
                          {currentValue === 0 ? 'Non valutato' : `Intensità: ${currentValue}/10`}
                        </div>
                      </div>
                    </div>
                    
                    {/* AGGIUNTO: Pulsante rimuovi */}
                    <button onClick={() => {
                      const newAttrs = [...customAttributes];
                      newAttrs.splice(index, 1);
                      setCustomAttributes(newAttrs);
                    }} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                      ×
                    </button>
                  </div>
                  
                  {/* Slider migliorato */}
                  <div className="space-y-4">
                    <input type="range" min="0" max="10" step="0.5" 
                           value={currentValue}
                           onChange={(e) => handleQdaChange(attr, parseFloat(e.target.value))}
                           className="w-full h-3 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-fuchsia-500 [&::-webkit-slider-thumb]:shadow-lg" />
                    
                    <div className="flex justify-between text-sm text-slate-500">
                      <span>0 - Assente</span>
                      <span className="font-bold">Valore: {currentValue}</span>
                      <span>10 - Molto intenso</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        <div className="mt-8 pt-6 border-t border-slate-200">
          <button onClick={() => {
            // AGGIUNTO: Salva attributi in localStorage
            if (customAttributes.length > 0) {
              localStorage.setItem(`flashProfile_${test.id}_attributes`, JSON.stringify(customAttributes));
            }
            handleNextProduct();
          }} className="w-full py-4 bg-fuchsia-500 text-white font-bold rounded-xl hover:bg-fuchsia-600 transition-all flex items-center justify-center gap-3">
            <ArrowRight size={20} />
            {currentProductIndex < products.length - 1 
              ? `Salva e passa al prossimo (${currentProductIndex + 2}/${products.length})`
              : 'Concludi Flash Profile'}
          </button>
        </div>
      </div>
    );
  };

  // ===== MANTENIAMO TUTTE LE ALTRE FUNZIONI COME NEL PRIMO CODICE =====
  const renderTriangle = () => {
    if (triangleStep === 'selection') {
      return (
        <div>
          <h2 className="text-2xl font-bold mb-2">Test Triangolare</h2>
          <p className="text-slate-600 mb-8">Seleziona il campione DIVERSO dagli altri due.</p>
          
          <div className="flex justify-center gap-8">
            {products.map(p => (
              <button key={p.code} onClick={() => {
                setSelectedOne(p.code);
                setTriangleResponse(prev => ({ ...prev, selectedCode: p.code }));
              }} className={`w-40 h-40 rounded-full border-4 flex items-center justify-center text-3xl font-black font-mono transition-all shadow-sm active:scale-95 ${
                selectedOne === p.code 
                  ? 'border-indigo-600 bg-indigo-600 text-white scale-110 shadow-xl' 
                  : 'border-slate-200 hover:border-indigo-300 bg-white text-slate-700'
              }`}> 
                {p.code} 
              </button>
            ))}
          </div>
          
          <button disabled={!selectedOne} onClick={() => setTriangleStep('forced_response')} 
                  className="mt-8 px-10 py-4 bg-slate-900 text-white font-bold rounded-2xl disabled:opacity-50 hover:bg-slate-800 shadow-xl transition-all">
            Continua
          </button>
        </div>
      );
    }
    
    if (triangleStep === 'forced_response') {
      return (
        <div>
          <h2 className="text-2xl font-bold mb-2">Risposta Forzata? (DIN 10955)</h2>
          <p className="text-slate-600 mb-8">La tua scelta è stata basata su una reale percezione di differenza o è stata una risposta casuale?</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {[
              { value: false, label: '✓ Differenza Chiara', desc: 'Ho percepito chiaramente una differenza' },
              { value: true, label: '? Risposta Forzata', desc: 'Non ero sicuro, ho indovinato' }
            ].map(option => (
              <button key={String(option.value)}
                onClick={() => {
                  setTriangleResponse(prev => ({ ...prev, isForcedResponse: option.value }));
                  if (option.value) {
                    setTriangleStep('confirm');
                  } else {
                    setTriangleStep('details');
                  }
                }}
                className={`flex-1 p-6 rounded-xl border-2 transition-all text-left cursor-pointer ${
                  triangleResponse.isForcedResponse === option.value
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-slate-200 bg-white hover:border-indigo-300'
                }`}
              >
                <div className="font-bold text-lg">{option.label}</div>
                <div className="text-sm text-slate-600 mt-1">{option.desc}</div>
              </button>
            ))}
          </div>
          
          <button onClick={() => setTriangleStep('selection')}
                  className="px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all">
            Indietro
          </button>
        </div>
      );
    }
    
    if (triangleStep === 'details') {
      return (
        <div>
          <h2 className="text-2xl font-bold mb-2">Dettagli della Differenza</h2>
          <p className="text-slate-600 mb-8">Descrivere la differenza percepita nel campione {selectedOne}</p>
          
          <div className="space-y-6">
            <div>
              <label className="block font-medium mb-2">Tipo di Sentore *</label>
              <div className="flex gap-4">
                {(['aroma', 'taste'] as const).map(type => (
                  <button key={type}
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
            
            <div>
              <label className="block font-medium mb-2">Descrizione della Differenza *</label>
              <textarea value={triangleResponse.description}
                       onChange={e => setTriangleResponse(prev => ({ ...prev, description: e.target.value }))}
                       placeholder="Es: Note fruttate, amaro pronunciato, profumo intenso..."
                       className="w-full p-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                       rows={3} />
            </div>
            
            <div>
              <label className="block font-medium mb-2">Intensità del Sentore *</label>
              <div className="flex items-center gap-4">
                <input type="range" min="1" max="4" value={triangleResponse.intensity}
                       onChange={e => setTriangleResponse(prev => ({ ...prev, intensity: parseInt(e.target.value) }))}
                       className="flex-1 h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                <div className="text-2xl font-bold">
                  {triangleResponse.intensity} / 4
                </div>
              </div>
              <div className="flex justify-between text-sm text-slate-500 mt-2">
                <span>Molto Debole</span>
                <span>Molto Forte</span>
              </div>
            </div>
            
            <div className="flex gap-4 pt-4">
              <button onClick={() => setTriangleStep('forced_response')}
                      className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all">
                Indietro
              </button>
              <button disabled={!triangleResponse.description || triangleResponse.description.trim().length === 0}
                      onClick={() => setTriangleStep('confirm')}
                      className="flex-1 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                Continua
              </button>
            </div>
          </div>
        </div>
      );
    }
    
    return (
      <div>
        <h2 className="text-2xl font-bold mb-2">Conferma Risposta</h2>
        <div className="bg-slate-50 p-6 rounded-xl mb-8">
          <div className="font-bold text-lg mb-2">Campione diverso: {selectedOne}</div>
          {!triangleResponse.isForcedResponse && (
            <div className="text-slate-600">
              Sentore: {triangleResponse.sensoryCategoryType === 'aroma' ? 'Aroma/Odore' : 'Sapore'} - 
              Intensità: {triangleResponse.intensity}/4
            </div>
          )}
          {triangleResponse.isForcedResponse && (
            <div className="text-amber-600">⚠️ Risposta forzata (indovinata)</div>
          )}
        </div>
        
        <div className="flex gap-4">
          <button onClick={() => setTriangleStep(triangleResponse.isForcedResponse ? 'forced_response' : 'details')}
                  className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all">
            Modifica
          </button>
          <button onClick={() => {
            const final = {
              ...result as JudgeResult,
              id: generateId(),
              submittedAt: new Date().toISOString(),
              triangleSelection: selectedOne || '',
              triangleResponse
            };
            onComplete(final);
          }}
          className="flex-1 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-lg">
            Conferma e Invia
          </button>
        </div>
      </div>
    );
  };

  const renderPairedComparison = () => (
    <div>
      <h2 className="text-2xl font-bold mb-2">Confronto a Coppie</h2>
      <p className="text-slate-600 mb-8">Quale campione presenta l'intensità MAGGIORE?</p>
      
      <div className="flex justify-center gap-8">
        {products.map(p => (
          <button key={p.code} onClick={() => setSelectedOne(p.code)} 
                  className={`w-48 h-48 rounded-3xl border-4 flex flex-col items-center justify-center gap-2 transition-all shadow-sm active:scale-95 ${
                    selectedOne === p.code 
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-4 ring-indigo-200 scale-105' 
                      : 'border-slate-200 hover:border-indigo-300 bg-white'
                  }`}>
            <div className="text-2xl font-bold">Campione</div>
            <div className="text-4xl font-black font-mono">{p.code}</div>
          </button>
        ))}
      </div>
      
      <button disabled={!selectedOne} onClick={() => {
        const final = { 
          ...result as JudgeResult, 
          id: generateId(), 
          submittedAt: new Date().toISOString(), 
          pairedSelection: selectedOne || '' 
        };
        onComplete(final);
      }} className="mt-8 px-10 py-4 bg-slate-900 text-white font-bold rounded-2xl disabled:opacity-50 hover:bg-slate-800 shadow-xl transition-all">
        Conferma Scelta
      </button>
    </div>
  );

  const renderScaleInput = (attr: Attribute) => {
    if (!currentProduct) return null;
    const scaleType = attr.scaleType || 'linear';
    let defaultValue = 0;
    if (scaleType === 'linear9') defaultValue = 1;
    else if (scaleType === 'linear10') defaultValue = 1;
    else if (scaleType === 'likert5') defaultValue = 1;
    else if (scaleType === 'likert7') defaultValue = 1;
    else if (scaleType === 'likert9') defaultValue = 1;
    const val = (result.qdaRatings || {})[`${currentProduct.code}_${attr.id}`] ?? defaultValue;
    
    if (scaleType === 'linear9') {
      return (
        <div className="relative py-6">
          {attr.referenceValue !== undefined && (
            <div className="absolute z-20 flex flex-col items-center pointer-events-none" 
                 style={{ left: `${((attr.referenceValue - 1) / 8) * 100}%`, transform: 'translateX(-50%)', top: '-42px' }}>
              <div className="text-xs font-bold text-indigo-600">{attr.referenceLabel || 'RIF'}:</div>
              <div className="text-lg font-black">{attr.referenceValue.toFixed(1)}</div>
            </div>
          )}
          <input type="range" min="1" max="9" step="0.1" value={val} 
                 onChange={(e) => handleQdaChange(attr.id, parseFloat(e.target.value))} 
                 className="relative w-full h-4 bg-slate-100 rounded-full appearance-none cursor-pointer accent-indigo-600 shadow-inner z-10" />
          <div className="flex justify-between text-sm text-slate-500 mt-2">
            <span>{attr.leftAnchor || 'Debole'}</span>
            <span className="font-bold">{val.toFixed(1)}</span>
            <span>{attr.rightAnchor || 'Forte'}</span>
          </div>
        </div>
      );
    }
    
    if (scaleType === 'likert9' || scaleType === 'likert7' || scaleType === 'likert5') {
      const points = scaleType === 'likert9' ? 9 : scaleType === 'likert7' ? 7 : 5;
      const range = Array.from({length: points}, (_, i) => i + 1);
      return (
        <div className="relative py-6">
          <div className="flex justify-between text-sm text-slate-500 mb-4">
            <span>{attr.leftAnchor || 'Min'}</span>
            <span>{attr.rightAnchor || 'Max'}</span>
          </div>
          
          {attr.referenceValue !== undefined && (
            <div className="absolute top-0 w-px h-full border-l-2 border-dashed border-indigo-400 pointer-events-none z-0 opacity-50 flex flex-col items-center"
                 style={{ left: `calc(${((attr.referenceValue - 1) / (points - 1)) * 100}% + 0px)` }}>
              <div className="text-xs font-bold text-indigo-600 mt-1">{attr.referenceLabel || 'REF'}</div>
            </div>
          )}
          
          <div className="flex gap-2">
            {range.map(p => (
              <button key={p} onClick={() => handleQdaChange(attr.id, p)} 
                      className={`flex-1 aspect-square rounded-xl border-2 font-bold transition-all active:scale-95 z-10 ${
                        val === p 
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg scale-105' 
                          : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 shadow-sm'
                      }`}>
                {p}
              </button>
            ))}
          </div>
        </div>
      );
    }
    
    return (
      <div className="relative py-6">
        {attr.referenceValue !== undefined && (
          <div className="absolute z-20 flex flex-col items-center pointer-events-none" 
               style={{ left: `${attr.referenceValue}%`, transform: 'translateX(-50%)', top: '-42px' }}>
            <div className="text-xs font-bold text-indigo-600">{attr.referenceLabel || 'RIF'}:</div>
            <div className="text-lg font-black">{attr.referenceValue}</div>
          </div>
        )}
        <input type="range" min="0" max="100" step="1" value={val} 
               onChange={(e) => handleQdaChange(attr.id, parseFloat(e.target.value))} 
               className="relative w-full h-4 bg-slate-100 rounded-full appearance-none cursor-pointer accent-indigo-600 shadow-inner z-10" />
        <div className="flex justify-between text-sm text-slate-500 mt-2">
          <span>{attr.leftAnchor || 'Debole'}</span>
          <span className="font-bold">{val}</span>
          <span>{attr.rightAnchor || 'Forte'}</span>
        </div>
      </div>
    );
  };

  const renderQDA = () => {
    if (!currentProduct) return null;
    return (
      <div>
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold">Campione {currentProduct.code}</h2>
          <div className="text-slate-600">
            Progresso {currentProductIndex + 1} / {products.length}
          </div>
        </div>
        
        <div className="space-y-8">
          {test.config.attributes.map(attr => (
            <div key={attr.id} className="bg-white p-6 rounded-2xl border border-slate-200">
              <div className="mb-4">
                <div className="font-bold text-lg">{attr.name}</div>
                {attr.description && <div className="text-sm text-slate-600 mt-1">{attr.description}</div>}
              </div>
              {renderScaleInput(attr)}
            </div>
          ))}
        </div>
        
        <button onClick={handleNextProduct} 
                className="w-full mt-8 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all">
          {currentProductIndex < products.length - 1 ? 'PROSSIMO CAMPIONE' : 'INVIA RISULTATI'}
        </button>
      </div>
    );
  };

  const renderHedonic = () => {
    if (!currentProduct) return null;
    return (
      <div>
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold">Campione {currentProduct.code}</h2>
          <div className="text-slate-600">
            Progresso {currentProductIndex + 1} / {products.length}
          </div>
        </div>
        
        <div className="space-y-8">
          {test.config.attributes.map(attr => {
            const val = result.qdaRatings?.[`${currentProduct.code}_${attr.id}`] || 5;
            return (
              <div key={attr.id} className="bg-white p-6 rounded-2xl border border-slate-200">
                <div className="font-bold text-lg mb-4">{attr.name}</div>
                <div className="space-y-2">
                  {[9, 8, 7, 6, 5, 4, 3, 2, 1].map(score => (
                    <label key={score} 
                           className={`flex items-center gap-4 p-4 rounded-2xl border cursor-pointer transition-all ${
                             val === score 
                               ? 'bg-pink-50 border-pink-500 ring-2 ring-pink-100' 
                               : 'hover:bg-slate-50 border-slate-100 shadow-sm'
                           }`}>
                      <input type="radio" name={`hedonic-${attr.id}`} value={score} 
                             checked={val === score} 
                             onChange={() => handleQdaChange(attr.id, score)} 
                             className="w-6 h-6 text-pink-600 accent-pink-600" />
                      <span className={`flex-1 text-lg ${
                        val === score ? 'text-pink-900 font-bold' : 'text-slate-600 font-medium'
                      }`}>
                        {score} - {score === 9 && 'Piace moltissimo'}
                        {score === 8 && 'Piace molto'}
                        {score === 7 && 'Piace moderatamente'}
                        {score === 6 && 'Piace leggermente'}
                        {score === 5 && 'Né piace né dispiace'}
                        {score === 4 && 'Dispiace leggermente'}
                        {score === 3 && 'Dispiace moderatamente'}
                        {score === 2 && 'Dispiace molto'}
                        {score === 1 && 'Dispiace moltissimo'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        
        <button onClick={handleNextProduct} 
                className="w-full mt-8 py-4 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 transition-all">
          {currentProductIndex < products.length - 1 ? 'Prossimo Campione' : 'Invia Risultati'}
        </button>
      </div>
    );
  };

  const renderCATA = () => {
    if (!currentProduct) return null;
    return (
      <div>
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold">Campione {currentProduct.code}</h2>
          <div className="text-slate-600">
            Progresso {currentProductIndex + 1} / {products.length}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {test.config.attributes.map(attr => {
            const isChecked = result.cataSelection?.includes(`${currentProduct.code}_${attr.id}`);
            return (
              <button key={attr.id} onClick={() => handleCataToggle(attr.id)} 
                      className={`p-5 rounded-2xl border-2 text-left transition-all active:scale-95 ${
                        isChecked 
                          ? 'border-emerald-500 bg-emerald-500 text-white shadow-lg' 
                          : 'border-slate-200 hover:border-emerald-200 bg-white'
                      }`}>
                <div className="flex items-center gap-4">
                  <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center ${
                    isChecked ? 'bg-white border-white' : 'border-slate-300 bg-slate-50'
                  }`}>
                    {isChecked && <CheckCircle size={16} className="text-emerald-500" />}
                  </div>
                  <span className={`font-bold text-lg ${
                    isChecked ? 'text-white' : 'text-slate-700'
                  }`}>
                    {attr.name}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        
        <button onClick={handleNextProduct} 
                className="w-full mt-8 py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all">
          {currentProductIndex < products.length - 1 ? 'Prossimo Campione' : 'Invia Risultati'}
        </button>
      </div>
    );
  };

  const renderRATA = () => {
    if (!currentProduct) return null;
    return (
      <div>
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold">Campione {currentProduct.code}</h2>
          <div className="text-slate-600">
            Progresso {currentProductIndex + 1} / {products.length}
          </div>
        </div>
        
        <div className="space-y-6">
          {test.config.attributes.map(attr => {
            const key = `${currentProduct.code}_${attr.id}`;
            const currentVal = result.rataSelection?.[key] || 0;
            const isChecked = currentVal > 0;
            return (
              <div key={attr.id} 
                   className={`p-6 rounded-[32px] border-2 transition-all ${
                     isChecked 
                       ? 'border-teal-500 bg-teal-50/50 shadow-lg scale-[1.02]' 
                       : 'border-slate-200 bg-white'
                   }`}>
                <div className="flex items-center justify-between mb-4">
                  <button onClick={() => handleRataChange(attr.id, isChecked ? 0 : 1)} 
                          className="flex items-center gap-4 group text-left">
                    <div className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all ${
                      isChecked 
                        ? 'bg-teal-500 border-teal-500 shadow-teal-200' 
                        : 'border-slate-300 bg-slate-50 group-hover:border-teal-300'
                    }`}>
                      {isChecked && <CheckCircle size={20} className="text-white" />}
                    </div>
                    <span className={`font-black text-2xl tracking-tight transition-colors ${
                      isChecked 
                        ? 'text-teal-900' 
                        : 'text-slate-700 group-hover:text-teal-600'
                    }`}>
                      {attr.name}
                    </span>
                  </button>
                </div>
                
                {isChecked && (
                  <div className="mt-4 pt-4 border-t border-teal-100">
                    <div className="font-medium mb-3">Quanto è intenso?</div>
                    <div className="grid grid-cols-3 gap-3">
                      {[1, 2, 3].map(lvl => (
                        <button key={lvl} onClick={() => handleRataChange(attr.id, lvl)} 
                                className={`flex-1 py-4 rounded-2xl font-black text-sm transition-all border-2 ${
                                  currentVal === lvl 
                                    ? 'bg-teal-600 border-teal-600 text-white shadow-xl scale-105' 
                                    : 'bg-white border-teal-100 text-teal-600 hover:bg-teal-50'
                                }`}>
                          {lvl === 1 ? 'Basso' : lvl === 2 ? 'Medio' : 'Alto'} ({lvl})
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        <button onClick={handleNextProduct} 
                className="w-full mt-8 py-4 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 transition-all">
          {currentProductIndex < products.length - 1 ? 'Prossimo Campione' : 'Invia Risultati'}
        </button>
      </div>
    );
  };

  const renderNapping = () => (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Mappa Proiettiva</h2>
          <p className="text-slate-600">Trascina i prodotti sulla tovaglia. Vicini = Simili.</p>
        </div>
        <button onClick={() => {
          const final = { 
            ...result as JudgeResult, 
            id: generateId(), 
            submittedAt: new Date().toISOString() 
          };
          onComplete(final);
        }} className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700">
          Termina Test
        </button>
      </div>
      
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200">
          <h3 className="font-bold mb-4">1. Seleziona</h3>
          <div className="space-y-3">
            {products.map(p => {
              const isPlaced = placedProducts.includes(p.code);
              const isSelected = selectedOne === p.code;
              return (
                <button key={p.code} onClick={() => setSelectedOne(p.code)} 
                        className={`w-full p-3 rounded-xl text-left font-mono font-bold transition-all relative overflow-hidden ${
                          isSelected 
                            ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-300' 
                            : isPlaced 
                              ? 'bg-green-50 text-green-700 border border-green-200' 
                              : 'bg-white border-2 border-slate-100 hover:border-indigo-300 text-slate-700'
                        }`}>
                  {p.code} {isPlaced && '✓'} {isSelected && '→'}
                  {isPlaced && !isSelected && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <MapPin size={16} className="text-green-500" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <button onClick={() => { 
            setPlacedProducts([]); 
            setResult(prev => ({...prev, nappingData: {}})); 
          }} className="mt-8 w-full p-2 text-slate-400 hover:text-red-500 flex items-center justify-center gap-1">
            <RefreshCcw size={16} /> Reset Mappa
          </button>
        </div>
        
        <div className="lg:col-span-2 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border-2 border-dashed border-slate-300 relative overflow-hidden"
             onClick={handleMapClick}>
          <div className="absolute inset-0">
            {Object.entries(result.nappingData || {}).map(([code, coords]) => {
              const c = coords as { x: number, y: number };
              return (
                <div key={code} 
                     className="absolute w-12 h-12 -ml-6 -mt-6 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg border-4 border-white transition-all transform hover:scale-110 z-10 hover:z-20 cursor-pointer"
                     style={{ left: `${c.x}%`, top: `${c.y}%` }}
                     onClick={(e) => { e.stopPropagation(); setSelectedOne(code); }}>
                  {code}
                </div>
              );
            })}
          </div>
          
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {selectedOne ? (
              <div className="text-center bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-lg">
                <MousePointer2 size={48} className="mx-auto mb-4 text-indigo-600" />
                <div className="font-bold text-xl">Posiziona {selectedOne}</div>
                <div className="text-slate-600 mt-2">Clicca sulla mappa per posizionare il campione</div>
              </div>
            ) : (
              <div className="text-center text-slate-400">
                <MapPin size={64} className="mx-auto mb-4 opacity-50" />
                <div className="text-xl">Seleziona un campione a sinistra</div>
                <div className="mt-2">poi clicca qui per posizionarlo</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderSorting = () => {
    return (
      <div>
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">Sorting</h2>
          <p className="text-slate-600">Assegna lo stesso nome ai campioni simili.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map(p => (
            <div key={p.code} className="bg-white p-6 rounded-2xl border border-slate-200">
              <div className="mb-6">
                <div className="text-3xl font-black font-mono text-indigo-600 mb-2">{p.code}</div>
                <div className="text-slate-600">
                  <div className="font-medium">Campione</div>
                  <div>{p.name || 'Prodotto'}</div>
                </div>
              </div>
              
              <div>
                <label className="block font-medium mb-2">Gruppo</label>
                <input type="text" value={result.sortingGroups?.[p.code] || ''} 
                       onChange={(e) => handleSortChange(p.code, e.target.value)}
                       className="w-full p-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-indigo-500 focus:bg-white outline-none font-bold text-slate-800 transition-all"
                       placeholder="Es: Dolce..." />
              </div>
            </div>
          ))}
        </div>
        
        <button onClick={submitAll} 
                className="w-full mt-8 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all">
          INVIA RISULTATI
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{test.name}</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <span className="font-medium">Giudice: {judgeName}</span>
              </div>
            </div>
          </div>
          <button onClick={onExit} 
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            Esci
          </button>
        </div>
        
        <div className="mb-8">
          <p className="text-lg text-slate-700 italic">"{test.config.instructions}"</p>
        </div>
        
        {/* PROGRESS BAR */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">
              Progresso: {currentProductIndex + 1} di {products.length}
            </span>
            <span className="text-sm font-bold text-indigo-600">
              {Math.round(((currentProductIndex + 1) / products.length) * 100)}%
            </span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-600 transition-all duration-300"
                 style={{ width: `${((currentProductIndex + 1) / products.length) * 100}%` }}>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
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
        </div>
      </div>
    </div>
  );
};