
import { GoogleGenAI, Type } from "@google/genai";

const getAiClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("Gemini API Key missing! Insights will not be generated.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const suggestAttributes = async (productDescription: string): Promise<string[]> => {
  const ai = getAiClient();
  if (!ai) return [];
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-pro',
      contents: `Act as a sensory scientist. Generate a list of 10 sensory attributes (Appearance, Aroma, Taste, Texture) suitable for a QDA or CATA analysis of the following product: "${productDescription}". Return ONLY the list of attributes as a JSON array of strings.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Gemini Suggestion Error:", error);
    return [];
  }
};

export const analyzeResults = async (testName: string, testType: string, summaryData: string): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "Configurazione AI mancante. Controlla la API Key su Vercel.";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-pro',
      contents: `Agisci come un esperto Panel Leader di analisi sensoriale. Analizza i seguenti dati aggregati per il test "${testName}" (Tipo: ${testType}). 
      
      Sintesi Dati:
      ${summaryData}

      Fornisci un'interpretazione concisa e professionale dei risultati in lingua italiana.`,
    });

    return response.text || "Impossibile generare l'analisi.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Errore durante l'analisi AI.";
  }
};