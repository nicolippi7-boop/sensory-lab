import React, { useState } from 'react';
import { 
  Plus, Trash2, ChevronLeft, LayoutDashboard, Beaker, 
  Settings2, Shuffle, ArrowRight, Database 
} from 'lucide-react';
import { TestType } from '../types';
import type { SensoryTest, JudgeResult, Product, Attribute } from '../types';

interface AdminDashboardProps {
  tests: SensoryTest[];
  results: JudgeResult[];
  onCreateTest: (test: SensoryTest) => void;
  onDeleteTest: (id: string) => void;
  onUpdateTest: () => void;
  onNavigate: () => void;
  peerId: string;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  tests,
  results,
  onCreateTest,
  onDeleteTest,
  onNavigate
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newTestName, setNewTestName] = useState('');
  const [newTestType, setNewTestType] = useState<TestType>(TestType.QDA);
  const [randomize, setRandomize] = useState(false);
  const [correctAnswerCode, setCorrectAnswerCode] = useState('');
  const [products, setProducts] = useState<Product[]>([
    { id: '1', name: 'Campione A', code: '101' }, 
    { id: '2', name: 'Campione B', code: '254' }
  ]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);

  const handleCreate = () => {
    if (!newTestName) return;
    
    const newTest: SensoryTest = {
      id: editingId || Date.now().toString(),
      name: newTestName,
      type: newTestType,
      status: 'active',
      createdAt: new Date().toISOString(),
      config: {
        samples: products,
        attributes: attributes,
        randomizeOrder: randomize, // <-- SALVATAGGIO CONFIGURAZIONE
        correctAnswer: correctAnswerCode
      }
    };

    onCreateTest(newTest);
    setIsCreating(false);
    resetForm();
  };

  const resetForm = () => {
    setNewTestName('');
    setRandomize(false);
    setEditingId(null);
    setProducts([{ id: '1', name: 'Campione A', code: '101' }, { id: '2', name: 'Campione B', code: '254' }]);
    setAttributes([]);
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <div className="flex justify-between items-center">
        <button onClick={onNavigate} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold transition-colors">
          <ChevronLeft size={20} /> Torna alla Home
        </button>
        <button onClick={() => setIsCreating(true)} className="bg-indigo-600 text-white px-8 py-4 rounded-3xl font-black shadow-xl hover:bg-indigo-700 flex items-center gap-2">
          <Plus size={24} /> NUOVO TEST
        </button>
      </div>

      {isCreating ? (
        <div className="bg-white rounded-[40px] p-10 shadow-2xl space-y-8">
          <h2 className="text-3xl font-black tracking-tighter text-slate-900">Configura Sessione</h2>
          
          <div className="grid md:grid-cols-2 gap-8 text-slate-900">
            <div className="space-y-4">
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">Nome del Test</label>
              <input value={newTestName} onChange={e => setNewTestName(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl outline-none font-bold" />
            </div>
            <div className="space-y-4">
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">Tipo di Test</label>
              <select value={newTestType} onChange={e => setNewTestType(e.target.value as TestType)} className="w-full p-5 bg-slate-50 rounded-2xl outline-none font-bold">
                <option value={TestType.QDA}>Analisi Descrittiva (QDA)</option>
                <option value={TestType.TRIANGLE}>Test Triangolare</option>
                <option value={TestType.CATA}>CATA</option>
              </select>
            </div>
          </div>

          {/* IL TUO CODICE PER LA RANDOMIZZAZIONE */}
          <div className="flex items-center justify-between p-6 bg-indigo-50/50 rounded-3xl border-2 border-indigo-100/50">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-100 rounded-2xl text-indigo-600">
                    <Shuffle size={20} />
                </div>
                <div>
                    <h4 className="font-black text-indigo-900 text-sm">Randomizzazione Campioni</h4>
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">L'ordine dei campioni sarà diverso per ogni assaggiatore per bilanciare l'effetto ordine.</p>
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

          <div className="flex gap-4 pt-6">
            <button onClick={() => setIsCreating(false)} className="flex-1 py-5 text-slate-400 font-bold">Annulla</button>
            <button onClick={handleCreate} className="flex-[2] py-5 bg-indigo-600 text-white font-black rounded-3xl shadow-xl hover:bg-indigo-700">CREA SESSIONE</button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden text-slate-900">
           {/* Tabella risultati esistente... */}
           <table className="w-full text-left">
             <thead className="bg-slate-50">
               <tr>
                 <th className="p-6 font-black text-slate-400 uppercase text-xs">Giudice</th>
                 <th className="p-6 font-black text-slate-400 uppercase text-xs">Data</th>
                 <th className="p-6 text-right"></th>
               </tr>
             </thead>
             <tbody>
               {results.map(res => (
                 <tr key={res.id} className="border-t border-slate-100">
                   <td className="p-6 font-bold">{res.judgeName}</td>
                   <td className="p-6 text-slate-500">{new Date(res.submittedAt).toLocaleString()}</td>
                   <td className="p-6 text-right">
                     <button onClick={() => onDeleteTest(res.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={18} /></button>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
        </div>
      )}
    </div>
  );
};