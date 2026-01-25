import React, { useState, useEffect, useRef } from 'react';
import { TestType } from '../types';
import type { SensoryTest, JudgeResult, TDSLogEntry, Product, TILogEntry, Attribute, TriangleResponse } from '../types';
import { Play, Square, CheckCircle, ArrowRight, MousePointer2, Info, Clock, MapPin, RefreshCcw, Target, Layers, Eye, Grid, List, Tag, Star } from 'lucide-react';
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
  const [selectedTiAttribute, setSelectedTiAttribute] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const prevTestIdRef = useRef<string | null>(null);

  const [placedProducts, setPlacedProducts] = useState<string[]>([]);
  const [customAttributes, setCustomAttributes] = useState<string[]>([]);
  const [newAttribute, setNewAttribute] = useState('');

  // Inizializza attributi da localStorage per Flash Profile
  useEffect(() => {
    if (test.type === TestType.FLASH_PROFILE) {
      const savedAttrs = localStorage.getItem(`flashProfile_${test.id}_attributes`);
      if (savedAttrs) {
        try {
          const parsed = JSON.parse(savedAttrs);
          if (Array.isArray(parsed)) {
            setCustomAttributes(parsed);
          }
        } catch (e) {
          console.error('Errore caricamento attributi salvati', e);
        }
      }
    }
  }, [test.id, test.type]);

  useEffect(() => {
    if (prevTestIdRef.current !== test.id) {
        const initialProducts = test.config.randomizePresentation
            ? shuffleArray(test.config.products)
            : [...test.config.products];
        setProducts(initialProducts);
        setCurrentProductIndex(0);
        prevTestIdRef.current = test.id;

        // Se è TI, imposta il primo attributo come selezionato
        if (test.type === TestType.TIME_INTENSITY && test.config.attributes.length > 0) {
          setSelectedTiAttribute(test.config.attributes[0].id);
        }

        // Reset state and pre-fill ratings to prevent saving 0 for untouched sliders
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
                        } else { // QDA
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
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Timer effect migliorato
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = window.setInterval(() => {
        setElapsedTime(prev => {
          const newTime = prev + 0.1;
          const duration = test.config.durationSeconds || 60;
          if (newTime >= duration) {
            setIsTimerRunning(false);
            if (timerRef.current) clearInterval(timerRef.current);
            return parseFloat(duration.toFixed(1));
          }
          return parseFloat(newTime.toFixed(1));
        });
      }, 100);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isTimerRunning, test.config.durationSeconds]);

  // TI logging effect
  useEffect(() => {
    const logInterval = 0.5; // Log ogni 0.5 secondi
    let lastLoggedTime = -logInterval;
    
    if (test.type === TestType.TIME_INTENSITY && isTimerRunning && products[currentProductIndex] && selectedTiAttribute) {
      const checkAndLog = () => {
        const currentTime = parseFloat(elapsedTime.toFixed(1));
        if (currentTime >= lastLoggedTime + logInterval) {
          const currentProduct = products[currentProductIndex];
          const logKey = currentProduct.code;
          const newEntry: TILogEntry = { 
            time: currentTime, 
            intensity: currentIntensity,
            attributeId: selectedTiAttribute
          };
         
          setTiHistory(prev => [...prev, { t: currentTime, v: currentIntensity }]);
         
          setResult(prev => ({
            ...prev,
            tiLogs: { 
              ...prev.tiLogs, 
              [logKey]: [...(prev.tiLogs?.[logKey] || []), newEntry] 
            }
          }));
          
          lastLoggedTime = currentTime;
        }
      };
      
      checkAndLog();
    }
  }, [elapsedTime, test.type, isTimerRunning, currentProductIndex, products, currentIntensity, selectedTiAttribute]);

  const currentProduct = products[currentProductIndex];

  const handleNextProduct = () => {
    if (currentProductIndex < products.length - 1) {
      setCurrentProductIndex(prev => prev + 1);
      setSelectedOne(null);
      setIsTimerRunning(false);
      setElapsedTime(0);
      setCurrentDominant(null);
      setCurrentIntensity(1);
      setTiHistory([]);
      // Reset attributo TI se necessario
      if (test.type === TestType.TIME_INTENSITY && test.config.attributes.length > 0) {
        setSelectedTiAttribute(test.config.attributes[0].id);
      }
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

  const submitAll = () => {
    const finalResult: JudgeResult = {
      ...result as JudgeResult,
      id: generateId(),
      submittedAt: new Date().toISOString(),
      triangleSelection: selectedOne || undefined,
      triangleResponse: test.type === TestType.TRIANGLE ? triangleResponse : undefined,
      pairedSelection: test.type === TestType.PAIRED_COMPARISON ? selectedOne || '' : undefined
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
     
      if (!hasEnd && elapsedTime > 0) {
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
    setResult(prev => ({ 
      ...prev, 
      tdsLogs: { ...prev.tdsLogs, [logKey]: [...currentLogs, newEntry] } 
    }));
  };

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
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

  // ================ RENDER FUNCTIONS ================

  const renderHedonic = () => {
    if (!currentProduct) return null;
    return (
      <div className="max-w-2xl mx-auto w-full animate-in fade-in duration-500">
        <div className="mb-8 p-6 bg-pink-50 border border-pink-100 rounded-3xl flex justify-between items-center shadow-sm">
          <div>
            <p className="text-sm text-pink-600 font-bold uppercase tracking-widest mb-1">Campione</p>
            <p className="text-5xl font-black text-pink-900 font-mono tracking-tighter">{currentProduct.code}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-pink-400 font-bold uppercase mb-1">Progresso</p>
            <p className="text-lg font-bold text-pink-900">{currentProductIndex + 1} / {products.length}</p>
          </div>
        </div>
        
        <div className="bg-white p-10 rounded-[40px] shadow-sm border border-slate-200">
          <div className="text-center mb-10">
            <h2 className="text-4xl font-black text-slate-900 mb-3">Valutazione Edonica</h2>
            <p className="text-slate-600 text-lg">Quanto ti piace questo prodotto?</p>
          </div>
          
          <div className="space-y-8">
            {test.config.attributes.map((attr, index) => {
              const key = `${currentProduct.code}_${attr.id}`;
              const value = (result.qdaRatings || {})[key] ?? 5;
              
              return (
                <div key={attr.id} className="bg-pink-50 p-8 rounded-3xl border border-pink-100">
                  <div className="mb-6 text-center">
                    <h3 className="text-2xl font-black text-slate-900 mb-2">{attr.name}</h3>
                    {attr.description && <p className="text-slate-600 italic">{attr.description}</p>}
                  </div>
                  
                  {/* Scala Edonica 9 punti */}
                  <div className="space-y-6">
                    <div className="flex justify-between items-center px-4">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                        <button
                          key={num}
                          onClick={() => handleQdaChange(attr.id, num)}
                          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                            value === num 
                              ? 'bg-pink-600 text-white scale-110 shadow-lg' 
                              : 'bg-white text-slate-700 hover:bg-pink-50'
                          }`}
                        >
                          <span className="text-xl font-black">{num}</span>
                          {num === 1 && <span className="text-xs font-bold">Estremamente<br/>dispiaciuto</span>}
                          {num === 5 && <span className="text-xs font-bold">Né piace<br/>né dispiace</span>}
                          {num === 9 && <span className="text-xs font-bold">Estremamente<br/>soddisfatto</span>}
                        </button>
                      ))}
                    </div>
                    
                    <div className="text-center">
                      <div className="text-5xl font-black text-pink-600 mb-2">{value}</div>
                      <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                        {value === 1 && "DISGUSTOSO"}
                        {value === 9 && "ECCELLENTE"}
                        {value === 5 && "NEUTRO"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="mt-12 mb-32 flex justify-center">
            <button onClick={handleNextProduct} className="px-12 py-5 bg-pink-600 text-white font-black rounded-3xl hover:bg-pink-700 shadow-xl shadow-pink-100 transition-all flex items-center gap-3 text-xl active:scale-95 group">
              {currentProductIndex < products.length - 1 ? 'PROSSIMO CAMPIONE' : 'INVIA RISULTATI'}
              <ArrowRight size={28} className="group-hover:translate-x-2 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderFlashProfile = () => {
    const [draggingAttr, setDraggingAttr] = useState<string | null>(null);
    const [sortingMode, setSortingMode] = useState<'grid' | 'list'>('grid');
    
    const handleAddCustomAttribute = () => {
      if (newAttribute.trim() && !customAttributes.includes(newAttribute.trim())) {
        const newAttrs = [...customAttributes, newAttribute.trim()];
        setCustomAttributes(newAttrs);
        localStorage.setItem(`flashProfile_${test.id}_attributes`, JSON.stringify(newAttrs));
        setNewAttribute('');
      }
    };
    
    const handleRemoveAttribute = (attr: string) => {
      const newAttrs = customAttributes.filter(a => a !== attr);
      setCustomAttributes(newAttrs);
        localStorage.setItem(`flashProfile_${test.id}_attributes`, JSON.stringify(newAttrs));
    };
    
    const handleDragStart = (attr: string) => {
      setDraggingAttr(attr);
    };
    
    const handleDrop = (prodCode: string) => {
      if (draggingAttr) {
        const key = `${prodCode}_${draggingAttr}`;
        setResult(prev => ({
          ...prev,
          qdaRatings: { 
            ...prev.qdaRatings, 
            [key]: prev.qdaRatings?.[key] || 50 
          }
        }));
      }
    };
    
    const handleIntensityChange = (prodCode: string, attr: string, value: number) => {
      const key = `${prodCode}_${attr}`;
      setResult(prev => ({
        ...prev,
        qdaRatings: { ...prev.qdaRatings, [key]: value }
      }));
    };
    
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 p-6 bg-purple-50 border border-purple-100 rounded-3xl shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-purple-600 font-bold uppercase tracking-widest mb-1">Flash Profile</p>
              <p className="text-3xl font-black text-purple-900">Associa e valuta gli attributi</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-purple-400 font-bold uppercase mb-1">Progresso</p>
              <p className="text-lg font-bold text-purple-900">{currentProductIndex + 1} / {products.length}</p>
            </div>
          </div>
          <p className="text-slate-600 mt-4">Trascina gli attributi sui campioni e regola l'intensità</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Pannello Attributi */}
          <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-slate-200">
            <div className="flex items-center gap-3 mb-6">
              <Tag className="text-purple-600" size={24} />
              <h3 className="text-xl font-black text-slate-900">I Tuoi Attributi</h3>
            </div>
            
            <div className="mb-6">
              <div className="flex gap-2 mb-4">
                <input
                  value={newAttribute}
                  onChange={(e) => setNewAttribute(e.target.value)}
                  placeholder="Nuovo attributo..."
                  className="flex-1 p-3 border border-slate-300 rounded-xl"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddCustomAttribute()}
                />
                <button 
                  onClick={handleAddCustomAttribute}
                  className="px-4 py-3 bg-purple-600 text-white rounded-xl font-bold"
                >
                  Aggiungi
                </button>
              </div>
              
              <div className="flex gap-2 mb-6">
                <button 
                  onClick={() => setSortingMode('grid')}
                  className={`flex-1 py-2 rounded-xl ${sortingMode === 'grid' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}
                >
                  Griglia
                </button>
                <button 
                  onClick={() => setSortingMode('list')}
                  className={`flex-1 py-2 rounded-xl ${sortingMode === 'list' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}
                >
                  Lista
                </button>
              </div>
            </div>
            
            <div className={`space-y-2 ${sortingMode === 'grid' ? 'grid grid-cols-2 gap-2' : ''}`}>
              {customAttributes.map((attr, idx) => (
                <div
                  key={idx}
                  draggable
                  onDragStart={() => handleDragStart(attr)}
                  className={`p-3 rounded-xl border-2 border-dashed cursor-grab active:cursor-grabbing ${
                    sortingMode === 'grid' 
                      ? 'text-center bg-purple-50 border-purple-200' 
                      : 'flex justify-between items-center bg-white border-slate-200'
                  }`}
                >
                  <span className="font-bold text-slate-800">{attr}</span>
                  <button 
                    onClick={() => handleRemoveAttribute(attr)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {customAttributes.length === 0 && (
                <div className="text-center p-8 text-slate-400 border-2 border-dashed border-slate-300 rounded-xl">
                  <p className="font-bold mb-2">Nessun attributo</p>
                  <p className="text-sm">Aggiungi attributi personalizzati per descrivere i campioni</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Area Campioni */}
          <div className="lg:col-span-2">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <Layers className="text-purple-600" size={24} />
                <h3 className="text-xl font-black text-slate-900">Campioni</h3>
              </div>
              
              <div className="space-y-8">
                {products.map((product) => {
                  const productAttrs = customAttributes.filter(attr => {
                    const key = `${product.code}_${attr}`;
                    return result.qdaRatings?.[key] !== undefined;
                  });
                  
                  return (
                    <div 
                      key={product.id}
                      className="p-6 rounded-2xl border-2 border-slate-100 hover:border-purple-200 transition-all"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(product.code)}
                    >
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-700 font-black text-xl">
                              {product.code}
                            </div>
                            <div>
                              <h4 className="text-2xl font-black text-slate-900">{product.name}</h4>
                              <p className="text-slate-500 text-sm">{productAttrs.length} attributi assegnati</p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <div className="text-xs font-bold text-purple-600 uppercase tracking-widest mb-1">
                            Trascina qui
                          </div>
                          <div className="text-2xl font-black text-slate-900">
                            {productAttrs.length}/{customAttributes.length}
                          </div>
                        </div>
                      </div>
                      
                      {productAttrs.length > 0 ? (
                        <div className="space-y-4">
                          {productAttrs.map((attr) => {
                            const key = `${product.code}_${attr}`;
                            const value = result.qdaRatings?.[key] || 50;
                            
                            return (
                              <div key={key} className="bg-purple-50 p-4 rounded-xl">
                                <div className="flex justify-between items-center mb-3">
                                  <span className="font-bold text-purple-800">{attr}</span>
                                  <button 
                                    onClick={() => handleIntensityChange(product.code, attr, 0)}
                                    className="text-slate-400 hover:text-red-500 text-sm"
                                  >
                                    Rimuovi
                                  </button>
                                </div>
                                
                                <div className="flex items-center gap-4">
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={value}
                                    onChange={(e) => handleIntensityChange(product.code, attr, parseInt(e.target.value))}
                                    className="flex-1 h-3 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                  />
                                  <div className="w-16 text-center">
                                    <span className="text-2xl font-black text-purple-700">{value}</span>
                                    <div className="text-[10px] text-slate-500">/100</div>
                                  </div>
                                </div>
                                
                                <div className="flex justify-between text-xs text-slate-500 mt-2">
                                  <span>Debole</span>
                                  <span>Forte</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div 
                          className="h-32 border-4 border-dashed border-slate-300 rounded-2xl flex items-center justify-center text-slate-400"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleDrop(product.code)}
                        >
                          <div className="text-center">
                            <p className="font-bold mb-2">Trascina attributi qui</p>
                            <p className="text-sm">Oppure clicca e trascina dagli attributi a sinistra</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="flex justify-between">
              <button
                onClick={() => {
                  if (confirm("Vuoi resettare tutti gli attributi?")) {
                    setCustomAttributes([]);
                    localStorage.removeItem(`flashProfile_${test.id}_attributes`);
                    setResult(prev => ({ ...prev, qdaRatings: {} }));
                  }
                }}
                className="px-6 py-3 border-2 border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50"
              >
                Reset
              </button>
              
              <button 
                onClick={handleNextProduct}
                className="px-8 py-4 bg-purple-600 text-white font-black rounded-2xl hover:bg-purple-700 shadow-lg"
              >
                {currentProductIndex < products.length - 1 ? 'Continua' : 'Completa Test'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTDS = () => {
    if (!currentProduct) return null;
    
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 p-6 bg-emerald-50 border border-emerald-100 rounded-3xl flex justify-between items-center shadow-sm">
          <div>
            <p className="text-sm text-emerald-600 font-bold uppercase tracking-widest mb-1">TDS - Dominanza Temporale</p>
            <p className="text-3xl font-black text-emerald-900">Campione: {currentProduct.code}</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-emerald-400 font-bold uppercase mb-1">Timer</div>
            <div className="text-3xl font-black text-emerald-900">{elapsedTime.toFixed(1)}s</div>
          </div>
        </div>
        
        <div className="bg-white p-8 rounded-3xl border border-slate-200 mb-8">
          <div className="text-center mb-10">
            <h2 className="text-4xl font-black text-slate-900 mb-3">Seleziona il sentore dominante</h2>
            <p className="text-slate-600">Clicca sugli attributi quando diventano dominanti durante l'assaggio</p>
          </div>
          
          <div className="mb-8">
            <div className="flex justify-center gap-4 mb-6">
              <button
                onClick={startTimer}
                disabled={isTimerRunning}
                className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold flex items-center gap-3 disabled:opacity-50"
              >
                <Play size={20} /> {isTimerRunning ? 'In corso...' : 'Inizia Assaggio'}
              </button>
              <button
                onClick={stopTimer}
                disabled={!isTimerRunning}
                className="px-8 py-4 bg-red-600 text-white rounded-2xl font-bold flex items-center gap-3 disabled:opacity-50"
              >
                <Square size={20} /> Ferma
              </button>
            </div>
            
            {isTimerRunning && (
              <div className="text-center mb-6">
                <div className="inline-block bg-emerald-100 px-4 py-2 rounded-full">
                  <span className="text-emerald-700 font-bold">⏱️ Timer attivo - Clicca gli attributi dominanti</span>
                </div>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {test.config.attributes.map((attr) => (
              <button
                key={attr.id}
                onClick={() => handleDominantClick(attr.id)}
                disabled={!isTimerRunning}
                className={`p-6 rounded-2xl border-2 font-bold text-lg transition-all ${
                  currentDominant === attr.id
                    ? 'bg-emerald-600 border-emerald-600 text-white scale-105 shadow-lg'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-300 disabled:opacity-50'
                }`}
              >
                {attr.name}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex justify-between">
          <button
            onClick={() => {
              if (confirm("Vuoi resettare i log per questo campione?")) {
                setCurrentDominant(null);
                setElapsedTime(0);
                setIsTimerRunning(false);
                if (timerRef.current) clearInterval(timerRef.current);
                const logKey = currentProduct.code;
                setResult(prev => ({
                  ...prev,
                  tdsLogs: { ...prev.tdsLogs, [logKey]: [] }
                }));
              }
            }}
            className="px-6 py-3 border-2 border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50"
          >
            Reset
          </button>
          
          <button 
            onClick={handleNextProduct}
            className="px-8 py-4 bg-emerald-600 text-white font-black rounded-2xl hover:bg-emerald-700 shadow-lg"
          >
            {currentProductIndex < products.length - 1 ? 'Prossimo Campione' : 'Completa Test'}
          </button>
        </div>
      </div>
    );
  };

  const renderTimeIntensity = () => {
    if (!currentProduct) return null;
    
    // Se non c'è un attributo selezionato, prendi il primo
    if (!selectedTiAttribute && test.config.attributes.length > 0) {
      setSelectedTiAttribute(test.config.attributes[0].id);
    }
    
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 p-6 bg-blue-50 border border-blue-100 rounded-3xl flex justify-between items-center shadow-sm">
          <div>
            <p className="text-sm text-blue-600 font-bold uppercase tracking-widest mb-1">Time Intensity</p>
            <p className="text-3xl font-black text-blue-900">Campione: {currentProduct.code}</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-blue-400 font-bold uppercase mb-1">Timer</div>
            <div className="text-3xl font-black text-blue-900">{elapsedTime.toFixed(1)}s</div>
          </div>
        </div>
        
        <div className="bg-white p-8 rounded-3xl border border-slate-200 mb-8">
          <div className="text-center mb-10">
            <h2 className="text-4xl font-black text-slate-900 mb-3">Traccia l'intensità nel tempo</h2>
            <p className="text-slate-600">Regola lo slider mentre assaggi per tracciare l'evoluzione dell'intensità</p>
          </div>
          
          {/* SELEZIONE ATTRIBUTO */}
          {test.config.attributes.length > 1 && (
            <div className="mb-8">
              <label className="block text-lg font-bold text-slate-700 mb-4">Seleziona Attributo da Tracciare:</label>
              <div className="flex flex-wrap gap-3">
                {test.config.attributes.map((attr) => (
                  <button
                    key={attr.id}
                    onClick={() => setSelectedTiAttribute(attr.id)}
                    className={`px-6 py-3 rounded-xl border-2 font-bold transition-all ${
                      selectedTiAttribute === attr.id
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
                    }`}
                  >
                    {attr.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Attributo selezionato */}
          {selectedTiAttribute && (
            <div className="mb-6 p-4 bg-blue-50 rounded-2xl border border-blue-100">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-blue-600 uppercase tracking-widest">Attributo Tracciato:</span>
                  <span className="ml-3 text-xl font-black text-blue-900">
                    {test.config.attributes.find(a => a.id === selectedTiAttribute)?.name}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-blue-600 uppercase tracking-widest">Progresso:</span>
                  <span className="ml-3 text-xl font-black text-blue-900">
                    {Math.round((elapsedTime / (test.config.durationSeconds || 60)) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          )}
          
          <div className="mb-8">
            <div className="flex justify-center gap-4 mb-6">
              <button
                onClick={startTimer}
                disabled={isTimerRunning}
                className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center gap-3 disabled:opacity-50"
              >
                <Play size={20} /> {isTimerRunning ? 'Tracciamento attivo...' : 'Inizia Tracciamento'}
              </button>
              <button
                onClick={stopTimer}
                disabled={!isTimerRunning}
                className="px-8 py-4 bg-red-600 text-white rounded-2xl font-bold flex items-center gap-3 disabled:opacity-50"
              >
                <Square size={20} /> Ferma
              </button>
            </div>
          </div>
          
          {/* Slider per intensità */}
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <label className="text-lg font-bold text-slate-700">Intensità corrente:</label>
              <div className="text-3xl font-black text-blue-600">{currentIntensity}</div>
            </div>
            
            <input
              type="range"
              min="0"
              max="100"
              value={currentIntensity}
              onChange={(e) => setCurrentIntensity(parseInt(e.target.value))}
              className="w-full h-4 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
              disabled={!isTimerRunning}
            />
            
            <div className="flex justify-between text-sm text-slate-500 mt-2">
              <span>0 - Percepibile</span>
              <span>100 - Massima</span>
            </div>
          </div>
          
          {/* Grafico storico (semplificato) */}
          {tiHistory.length > 0 && (
            <div className="bg-slate-50 p-6 rounded-2xl">
              <h3 className="font-bold text-slate-800 mb-4">Andamento registrato:</h3>
              <div className="h-32 relative">
                <div className="absolute inset-0 flex items-end">
                  {tiHistory.map((point, index) => (
                    <div
                      key={index}
                      className="absolute bottom-0 w-2 bg-blue-600 rounded-t"
                      style={{
                        left: `${(point.t / (test.config.durationSeconds || 60)) * 100}%`,
                        height: `${point.v}%`
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="flex justify-between">
          <button
            onClick={() => {
              setTiHistory([]);
              setCurrentIntensity(1);
              setElapsedTime(0);
              setIsTimerRunning(false);
              if (timerRef.current) clearInterval(timerRef.current);
              const logKey = currentProduct.code;
              setResult(prev => ({
                ...prev,
                tiLogs: { ...prev.tiLogs, [logKey]: [] }
              }));
            }}
            className="px-6 py-3 border-2 border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50"
          >
            Reset
          </button>
          
          <button 
            onClick={handleNextProduct}
            className="px-8 py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 shadow-lg"
          >
            {currentProductIndex < products.length - 1 ? 'Prossimo Campione' : 'Completa Test'}
          </button>
        </div>
      </div>
    );
  };

  const renderCATA = () => {
    if (!currentProduct) return null;
    
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 p-6 bg-orange-50 border border-orange-100 rounded-3xl flex justify-between items-center shadow-sm">
          <div>
            <p className="text-sm text-orange-600 font-bold uppercase tracking-widest mb-1">CATA - Check All That Apply</p>
            <p className="text-3xl font-black text-orange-900">Campione: {currentProduct.code}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-orange-400 font-bold uppercase mb-1">Progresso</p>
            <p className="text-lg font-bold text-orange-900">{currentProductIndex + 1} / {products.length}</p>
          </div>
        </div>
        
        <div className="bg-white p-8 rounded-3xl border border-slate-200">
          <div className="text-center mb-10">
            <h2 className="text-4xl font-black text-slate-900 mb-3">Seleziona tutti i descrittori applicabili</h2>
            <p className="text-slate-600">Clicca su tutti gli attributi che descrivono questo campione</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {test.config.attributes.map((attr) => {
              const key = `${currentProduct.code}_${attr.id}`;
              const isSelected = result.cataSelection?.includes(key) || false;
              
              return (
                <button
                  key={attr.id}
                  onClick={() => handleCataToggle(attr.id)}
                  className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                    isSelected
                      ? 'bg-orange-600 border-orange-600 text-white shadow-lg'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-orange-300'
                  }`}
                >
                  {isSelected ? (
                    <CheckCircle size={24} className="text-white" />
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-slate-300" />
                  )}
                  <span className="font-bold text-lg">{attr.name}</span>
                  {attr.description && (
                    <span className="text-sm opacity-80 mt-2">{attr.description}</span>
                  )}
                </button>
              );
            })}
          </div>
          
          <div className="mt-12 text-center">
            <div className="inline-block bg-orange-50 px-6 py-3 rounded-full mb-6">
              <span className="text-orange-700 font-bold">
                {result.cataSelection?.filter(k => k.startsWith(currentProduct.code)).length || 0} attributi selezionati
              </span>
            </div>
            
            <button 
              onClick={handleNextProduct}
              className="px-12 py-5 bg-orange-600 text-white font-black rounded-2xl hover:bg-orange-700 shadow-xl transition-all flex items-center gap-3 text-xl mx-auto"
            >
              {currentProductIndex < products.length - 1 ? 'PROSSIMO CAMPIONE' : 'INVIA RISULTATI'}
              <ArrowRight size={28} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderRATA = () => {
    if (!currentProduct) return null;
    
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 p-6 bg-rose-50 border border-rose-100 rounded-3xl flex justify-between items-center shadow-sm">
          <div>
            <p className="text-sm text-rose-600 font-bold uppercase tracking-widest mb-1">RATA - Rate All That Apply</p>
            <p className="text-3xl font-black text-rose-900">Campione: {currentProduct.code}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-rose-400 font-bold uppercase mb-1">Progresso</p>
            <p className="text-lg font-bold text-rose-900">{currentProductIndex + 1} / {products.length}</p>
          </div>
        </div>
        
        <div className="bg-white p-8 rounded-3xl border border-slate-200">
          <div className="text-center mb-10">
            <h2 className="text-4xl font-black text-slate-900 mb-3">Seleziona e valuta i descrittori</h2>
            <p className="text-slate-600">Scegli gli attributi applicabili e valuta la loro intensità</p>
          </div>
          
          <div className="space-y-8">
            {test.config.attributes.map((attr) => {
              const key = `${currentProduct.code}_${attr.id}`;
              const intensity = result.rataSelection?.[key] || 0;
              const isSelected = intensity > 0;
              
              return (
                <div key={attr.id} className="p-6 rounded-2xl border-2 border-slate-100">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">{attr.name}</h3>
                      {attr.description && (
                        <p className="text-slate-600 text-sm mt-1">{attr.description}</p>
                      )}
                    </div>
                    
                    <button
                      onClick={() => handleRataChange(attr.id, isSelected ? 0 : 50)}
                      className={`px-4 py-2 rounded-xl font-bold ${
                        isSelected
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {isSelected ? 'Selezionato' : 'Seleziona'}
                    </button>
                  </div>
                  
                  {isSelected && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={intensity}
                          onChange={(e) => handleRataChange(attr.id, parseInt(e.target.value))}
                          className="flex-1 h-3 bg-rose-200 rounded-lg appearance-none cursor-pointer accent-rose-600"
                        />
                        <div className="w-16 text-center">
                          <span className="text-2xl font-black text-rose-700">{intensity}</span>
                          <div className="text-[10px] text-slate-500">/100</div>
                        </div>
                      </div>
                      
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Debole</span>
                        <span>Forte</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          <div className="mt-12 text-center">
            <button 
              onClick={handleNextProduct}
              className="px-12 py-5 bg-rose-600 text-white font-black rounded-2xl hover:bg-rose-700 shadow-xl transition-all flex items-center gap-3 text-xl mx-auto"
            >
              {currentProductIndex < products.length - 1 ? 'PROSSIMO CAMPIONE' : 'INVIA RISULTATI'}
              <ArrowRight size={28} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderNapping = () => {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 p-6 bg-cyan-50 border border-cyan-100 rounded-3xl shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-sm text-cyan-600 font-bold uppercase tracking-widest mb-1">Napping Sensoriale</p>
              <p className="text-3xl font-black text-cyan-900">Posiziona i campioni sulla mappa</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-cyan-400 font-bold uppercase mb-1">Posizionati</p>
              <p className="text-lg font-bold text-cyan-900">{placedProducts.length} / {products.length}</p>
            </div>
          </div>
          <p className="text-slate-600">Clicca su un campione e poi sulla mappa per posizionarlo</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Legenda Campioni */}
          <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-slate-200">
            <div className="flex items-center gap-3 mb-6">
              <Layers className="text-cyan-600" size={24} />
              <h3 className="text-xl font-black text-slate-900">Campioni</h3>
            </div>
            
            <div className="space-y-3">
              {products.map((product) => {
                const isPlaced = placedProducts.includes(product.code);
                const isSelected = selectedOne === product.code;
                const position = result.nappingData?.[product.code];
                
                return (
                  <button
                    key={product.id}
                    onClick={() => setSelectedOne(product.code)}
                    disabled={isPlaced}
                    className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-cyan-600 bg-cyan-50'
                        : isPlaced
                        ? 'border-green-200 bg-green-50 opacity-70'
                        : 'border-slate-200 hover:border-cyan-300'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-black text-slate-900 text-lg">{product.name}</div>
                        <div className="text-slate-500 text-sm font-mono">{product.code}</div>
                      </div>
                      
                      {isPlaced && position && (
                        <div className="text-right">
                          <div className="text-xs font-bold text-green-600">Posizionato</div>
                          <div className="text-xs text-slate-500">
                            ({position.x.toFixed(0)}, {position.y.toFixed(0)})
                          </div>
                        </div>
                      )}
                      
                      {!isPlaced && (
                        <div className="text-slate-400 text-xs font-bold">Clicca per selezionare</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            
            <div className="mt-8 p-4 bg-slate-50 rounded-2xl">
              <div className="flex items-center gap-3 mb-3">
                <MousePointer2 className="text-cyan-600" size={20} />
                <h4 className="font-bold text-slate-800">Istruzioni</h4>
              </div>
              <ol className="text-sm text-slate-600 space-y-2">
                <li>1. Seleziona un campione dalla lista</li>
                <li>2. Clicca sulla mappa per posizionarlo</li>
                <li>3. I campioni simili vanno vicini</li>
                <li>4. I campioni diversi vanno lontani</li>
              </ol>
            </div>
          </div>
          
          {/* Mappa */}
          <div className="lg:col-span-2">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 h-full">
              <div className="flex items-center gap-3 mb-6">
                <MapPin className="text-cyan-600" size={24} />
                <h3 className="text-xl font-black text-slate-900">Mappa Sensoriale</h3>
              </div>
              
              <div className="relative aspect-square w-full border-4 border-slate-200 rounded-3xl bg-gradient-to-br from-cyan-50/50 to-white overflow-hidden">
                {/* Area cliccabile */}
                <div 
                  className="absolute inset-0 cursor-crosshair"
                  onClick={handleMapClick}
                />
                
                {/* Griglia */}
                <div className="absolute inset-0 grid grid-cols-10 grid-rows-10">
                  {Array.from({ length: 100 }).map((_, i) => (
                    <div key={i} className="border border-slate-100" />
                  ))}
                </div>
                
                {/* Campioni posizionati */}
                {Object.entries(result.nappingData || {}).map(([code, pos]) => (
                  <div
                    key={code}
                    className="absolute w-20 h-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-cyan-600 bg-white shadow-xl flex items-center justify-center"
                    style={{
                      left: `${pos.x}%`,
                      top: `${pos.y}%`
                    }}
                  >
                    <div className="text-center">
                      <div className="font-black text-slate-900 text-lg">{code}</div>
                      <div className="text-xs text-slate-500 font-bold">
                        ({pos.x.toFixed(0)}, {pos.y.toFixed(0)})
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Istruzioni */}
                {selectedOne && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-cyan-600 text-white px-6 py-3 rounded-full shadow-lg">
                    <div className="flex items-center gap-2 font-bold">
                      <MousePointer2 size={20} />
                      Clicca sulla mappa per posizionare: {selectedOne}
                    </div>
                  </div>
                )}
                
                {!selectedOne && placedProducts.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                    <div className="text-center">
                      <MousePointer2 size={48} className="mx-auto mb-4 opacity-50" />
                      <p className="text-xl font-bold mb-2">Seleziona un campione dalla lista</p>
                      <p className="text-sm">Poi clicca sulla mappa per posizionarlo</p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Coordinate */}
              <div className="flex justify-between text-xs text-slate-500 mt-4 px-2">
                <span>↑ Basso / Sinistra</span>
                <span>↓ Alto / Destra</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-8 flex justify-between">
          <button
            onClick={() => {
              if (confirm("Vuoi resettare tutte le posizioni?")) {
                setPlacedProducts([]);
                setSelectedOne(null);
                setResult(prev => ({ ...prev, nappingData: {} }));
              }
            }}
            className="px-6 py-3 border-2 border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50"
          >
            Reset Mappa
          </button>
          
          <button 
            onClick={handleNextProduct}
            disabled={placedProducts.length < products.length}
            className="px-8 py-4 bg-cyan-600 text-white font-black rounded-2xl hover:bg-cyan-700 shadow-lg disabled:opacity-50"
          >
            {currentProductIndex < products.length - 1 ? 'Prossimo Set' : 'Completa Test'}
          </button>
        </div>
      </div>
    );
  };

  const renderSorting = () => {
    const [newGroupName, setNewGroupName] = useState('');
    const [groups, setGroups] = useState<string[]>(['Gruppo A', 'Gruppo B', 'Gruppo C']);
    
    const handleAddGroup = () => {
      if (newGroupName.trim() && !groups.includes(newGroupName.trim())) {
        setGroups([...groups, newGroupName.trim()]);
        setNewGroupName('');
      }
    };
    
    const handleRemoveGroup = (group: string) => {
      if (window.confirm(`Rimuovere il gruppo "${group}"? I campioni assegnati verranno sbloccati.`)) {
        const newGroups = groups.filter(g => g !== group);
        setGroups(newGroups);
        
        // Rimuovi assegnazioni per questo gruppo
        const updatedGroups = { ...result.sortingGroups };
        Object.keys(updatedGroups).forEach(code => {
          if (updatedGroups[code] === group) {
            delete updatedGroups[code];
          }
        });
        setResult(prev => ({ ...prev, sortingGroups: updatedGroups }));
      }
    };
    
    const getProductsByGroup = (group: string) => {
      return products.filter(product => result.sortingGroups?.[product.code] === group);
    };
    
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 p-6 bg-violet-50 border border-violet-100 rounded-3xl shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-sm text-violet-600 font-bold uppercase tracking-widest mb-1">Sorting - Raggruppamento</p>
              <p className="text-3xl font-black text-violet-900">Raggruppa i campioni simili</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-violet-400 font-bold uppercase mb-1">Assegnati</p>
              <p className="text-lg font-bold text-violet-900">
                {Object.keys(result.sortingGroups || {}).length} / {products.length}
              </p>
            </div>
          </div>
          <p className="text-slate-600">Trascina i campioni nei gruppi o crea nuovi gruppi per i campioni simili</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Pannello Gruppi */}
          <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-slate-200">
            <div className="flex items-center gap-3 mb-6">
              <Grid className="text-violet-600" size={24} />
              <h3 className="text-xl font-black text-slate-900">Gruppi</h3>
            </div>
            
            <div className="mb-6">
              <div className="flex gap-2 mb-4">
                <input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Nuovo gruppo..."
                  className="flex-1 p-3 border border-slate-300 rounded-xl"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddGroup()}
                />
                <button 
                  onClick={handleAddGroup}
                  className="px-4 py-3 bg-violet-600 text-white rounded-xl font-bold"
                >
                  +
                </button>
              </div>
            </div>
            
            <div className="space-y-4">
              {groups.map((group) => {
                const groupProducts = getProductsByGroup(group);
                
                return (
                  <div
                    key={group}
                    className="p-4 rounded-2xl border-2 border-violet-100 bg-violet-50"
                  >
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-bold text-violet-800 text-lg">{group}</h4>
                      <div className="flex gap-2">
                        <span className="bg-violet-100 text-violet-700 text-xs font-bold px-2 py-1 rounded-full">
                          {groupProducts.length}
                        </span>
                        <button
                          onClick={() => handleRemoveGroup(group)}
                          className="text-violet-400 hover:text-red-500"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    
                    <div className="min-h-[60px] p-3 bg-white rounded-xl border border-violet-200">
                      {groupProducts.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {groupProducts.map((product) => (
                            <div
                              key={product.id}
                              className="px-3 py-1 bg-violet-100 text-violet-700 rounded-full text-sm font-bold flex items-center gap-1"
                            >
                              {product.code}
                              <button
                                onClick={() => handleSortChange(product.code, '')}
                                className="text-violet-400 hover:text-violet-700"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center text-slate-400 text-sm py-4">
                          Trascina qui i campioni
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              
              {groups.length === 0 && (
                <div className="text-center p-8 text-slate-400 border-2 border-dashed border-slate-300 rounded-xl">
                  <p className="font-bold mb-2">Nessun gruppo</p>
                  <p className="text-sm">Crea gruppi per iniziare a classificare</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Area Campioni */}
          <div className="lg:col-span-2">
            <div className="bg-white p-6 rounded-3xl border border-slate-200">
              <div className="flex items-center gap-3 mb-6">
                <Layers className="text-violet-600" size={24} />
                <h3 className="text-xl font-black text-slate-900">Campioni da Classificare</h3>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {products.map((product) => {
                  const assignedGroup = result.sortingGroups?.[product.code];
                  const isAssigned = !!assignedGroup;
                  
                  return (
                    <div
                      key={product.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('productCode', product.code);
                      }}
                      className={`p-4 rounded-2xl border-2 text-center cursor-move transition-all ${
                        isAssigned
                          ? 'border-green-300 bg-green-50 opacity-70'
                          : 'border-slate-200 hover:border-violet-300 bg-white'
                      }`}
                    >
                      <div className="font-black text-slate-900 text-xl mb-2">{product.code}</div>
                      <div className="text-slate-600 text-sm mb-3">{product.name}</div>
                      
                      {isAssigned ? (
                        <div className="text-xs">
                          <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">
                            {assignedGroup}
                          </span>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">Trascina in un gruppo</div>
                      )}
                      
                      {isAssigned && (
                        <button
                          onClick={() => handleSortChange(product.code, '')}
                          className="mt-3 text-xs text-slate-400 hover:text-red-500"
                        >
                          Rimuovi
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {/* Istruzioni drag & drop */}
              <div className="mt-8 p-4 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <MousePointer2 className="text-violet-600" size={20} />
                  <h4 className="font-bold text-slate-800">Come classificare</h4>
                </div>
                <ol className="text-sm text-slate-600 space-y-2">
                  <li>1. Clicca e trascina i campioni nei gruppi</li>
                  <li>2. I campioni simili vanno nello stesso gruppo</li>
                  <li>3. Crea nuovi gruppi se necessario</li>
                  <li>4. I campioni diversi vanno in gruppi diversi</li>
                </ol>
              </div>
            </div>
            
            {/* Gestione drag & drop */}
            <div className="grid grid-cols-3 gap-4 mt-6">
              {groups.map((group) => (
                <div
                  key={group}
                  className="p-4 rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/50 text-center"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const productCode = e.dataTransfer.getData('productCode');
                    if (productCode) {
                      handleSortChange(productCode, group);
                    }
                  }}
                >
                  <div className="font-bold text-violet-700 mb-2">Rilascia qui per</div>
                  <div className="text-xl font-black text-violet-900">{group}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="mt-8 flex justify-between">
          <button
            onClick={() => {
              if (confirm("Vuoi resettare tutte le classificazioni?")) {
                setResult(prev => ({ ...prev, sortingGroups: {} }));
              }
            }}
            className="px-6 py-3 border-2 border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50"
          >
            Reset Classifiche
          </button>
          
          <button 
            onClick={handleNextProduct}
            className="px-8 py-4 bg-violet-600 text-white font-black rounded-2xl hover:bg-violet-700 shadow-lg"
          >
            Completa Test
          </button>
        </div>
      </div>
    );
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
    );
  };

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
            <div className="space-y-6">
                <div className="relative h-12 flex items-center mt-12">
                    {attr.referenceValue !== undefined && (
                        <div className="absolute z-20 flex flex-col items-center pointer-events-none" style={{ left: `${((attr.referenceValue - 1) / 8) * 100}%`, transform: 'translateX(-50%)', top: '-42px' }}>
                            <div className="bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded-md shadow-lg mb-1 whitespace-nowrap uppercase border border-red-400 flex items-center gap-1"> <Target size={10} /> {attr.referenceLabel || 'RIF'}: {attr.referenceValue.toFixed(1)} </div>
                            <div className="w-1 h-10 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.4)]" />
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
                        <div className="bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded-md shadow-lg mb-1 whitespace-nowrap uppercase border border-red-400 flex items-center gap-1"> <Target size={10} /> {attr.referenceLabel || 'RIF'}: {attr.referenceValue} </div>
                        <div className="w-1 h-10 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.4)]" />
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
          <button disabled={!selectedOne} onClick={() => setTriangleStep('forced_response')} className="mt-8 px-10 py-4 bg-slate-900 text-white font-bold rounded-2xl disabled:opacity-50 hover:bg-slate-800 shadow-xl transition-all"> Continua </button>
        </div>
      );
    }

    if (triangleStep === 'forced_response') {
      return (
        <div className="flex flex-col items-center justify-center space-y-8 max-w-2xl">
          <div className="text-center">
            <h3 className="text-2xl font-bold text-slate-800 mb-2">Risposta Forzata? (DIN 10955)</h3>
            <p className="text-slate-500">La tua scelta è stata basata su una <span className="font-bold text-indigo-600">reale percezione</span> di differenza o è stata una <span className="font-bold text-amber-600">risposta casuale</span>?</p>
          </div>

          <div className="w-full bg-white rounded-2xl p-8 shadow-sm border border-slate-200 space-y-6">
            <div className="flex gap-4">
              {[
                { value: false, label: '✓ Differenza Chiara', desc: 'Ho percepito chiaramente una differenza' },
                { value: true, label: '? Risposta Forzata', desc: 'Non ero sicuro, ho indovinato' }
              ].map(option => (
                <button
                  key={String(option.value)}
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
                  <div className="font-semibold text-slate-800 text-lg">{option.label}</div>
                  <div className="text-xs text-slate-500 mt-2">{option.desc}</div>
                </button>
              ))}
            </div>

            <div className="flex gap-4 pt-6">
              <button
                onClick={() => setTriangleStep('selection')}
                className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all"
              >
                Indietro
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (triangleStep === 'details') {
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
                  min="1"
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

            {/* Action Buttons */}
            <div className="flex gap-4 pt-6">
              <button
                onClick={() => setTriangleStep('forced_response')}
                className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all"
              >
                Indietro
              </button>
              <button
                disabled={!triangleResponse.description || triangleResponse.description.trim().length === 0}
                onClick={() => setTriangleStep('confirm')}
                className="flex-1 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Continua
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Step: Confirm (per risposta forzata o dettagli completati)
    return (
      <div className="flex flex-col items-center justify-center space-y-8 max-w-2xl">
        <div className="text-center">
          <h3 className="text-2xl font-bold text-slate-800 mb-2">Conferma Risposta</h3>
          <p className="text-slate-500">Campione diverso: <span className="font-bold text-indigo-600">{selectedOne}</span></p>
          {!triangleResponse.isForcedResponse && (
            <p className="text-slate-500 mt-2">Sentore: <span className="font-bold">{triangleResponse.sensoryCategoryType === 'aroma' ? 'Aroma/Odore' : 'Sapore'}</span> - Intensità: <span className="font-bold">{triangleResponse.intensity}/4</span></p>
          )}
          {triangleResponse.isForcedResponse && (
            <p className="text-amber-600 font-semibold mt-2">⚠️ Risposta forzata (indovinata)</p>
          )}
        </div>

        <div className="w-full bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
          <div className="flex gap-4 pt-6">
            <button
              onClick={() => setTriangleStep(triangleResponse.isForcedResponse ? 'forced_response' : 'details')}
              className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all"
            >
              Modifica
            </button>
            <button
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
              className="flex-1 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-lg"
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

  // ================ MAIN RENDER ================
  const renderTestContent = () => {
    switch (test.type) {
      case TestType.QDA:
        return renderQDA();
      case TestType.HEDONIC:
        return renderHedonic();
      case TestType.TRIANGLE:
        return renderTriangle();
      case TestType.PAIRED_COMPARISON:
        return renderPairedComparison();
      case TestType.TDS:
        return renderTDS();
      case TestType.TIME_INTENSITY:
        return renderTimeIntensity();
      case TestType.CATA:
        return renderCATA();
      case TestType.RATA:
        return renderRATA();
      case TestType.NAPPING:
        return renderNapping();
      case TestType.SORTING:
        return renderSorting();
      case TestType.FLASH_PROFILE:
        return renderFlashProfile();
      default:
        return <div className="text-center text-2xl font-bold text-slate-500">Tipo di test non supportato</div>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900">{test.name}</h1>
            <p className="text-slate-600">Giudice: <span className="font-bold">{judgeName}</span></p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (window.confirm("Vuoi uscire dal test? I progressi verranno persi.")) {
                  onExit();
                }
              }}
              className="px-4 py-2 border-2 border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-50"
            >
              Esci
            </button>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="max-w-6xl mx-auto">
        {renderTestContent()}
      </div>
    </div>
  );
};