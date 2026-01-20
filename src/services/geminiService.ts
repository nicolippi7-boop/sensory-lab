
import { GoogleGenAI, Type } from "@google/genai";

const getAiClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("Gemini API Key missing! Insights will not be generated.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

// Simple in-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const isCacheValid = (timestamp: number): boolean => {
  return Date.now() - timestamp < CACHE_TTL;
};

const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> => {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a quota error (429)
      if (error?.message?.includes('"code":429')) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`Quota limit hit. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If it's not a retryable error, throw immediately
      throw error;
    }
  }
  
  throw lastError;
};

export const suggestAttributes = async (productDescription: string): Promise<string[]> => {
  const cacheKey = `attributes:${productDescription}`;
  
  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached && isCacheValid(cached.timestamp)) {
    console.log("Returning cached attributes");
    return cached.data;
  }
  
  const ai = getAiClient();
  if (!ai) return [];
  
  try {
    const result = await retryWithBackoff(async () => {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
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
    });

    // Cache the result
    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (error) {
    console.error("Gemini Suggestion Error:", error);
    return [];
  }
};

export const analyzeResults = async (testName: string, testType: string, summaryData: string): Promise<string> => {
  const cacheKey = `analysis:${testName}:${testType}`;
  
  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached && isCacheValid(cached.timestamp)) {
    console.log("Returning cached analysis");
    return cached.data;
  }
  
  const ai = getAiClient();
  if (!ai) return "Configurazione AI mancante. Controlla la API Key su Vercel.";

  try {
    const result = await retryWithBackoff(async () => {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `Agisci come un esperto Panel Leader di analisi sensoriale. Analizza i seguenti dati aggregati per il test "${testName}" (Tipo: ${testType}). 
        
        Sintesi Dati:
        ${summaryData}

        Fornisci un'interpretazione concisa e professionale dei risultati in lingua italiana.`,
      });
      return response.text || "Impossibile generare l'analisi.";
    });

    // Cache the result
    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Errore durante l'analisi AI. Se il problema persiste, attiva un piano a pagamento su Google Cloud Console.";
  }
};