import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. IMPORTANTE: Usa import.meta.env per Vite
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

export const suggestAttributes = async (productDescription: string): Promise<string[]> => {
  try {
    // 2. Usa un modello stabile come gemini-1.5-flash
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Act as a sensory scientist. Generate a list of 10 sensory attributes (Appearance, Aroma, Taste, Texture) suitable for a QDA or CATA analysis of the following product: "${productDescription}". Return ONLY the list of attributes as a JSON array of strings.`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (text) {
      return JSON.parse(text);
    }
    return [];
  } catch (error) {
    console.error("Error generating attributes:", error);
    return [];
  }
};

export const analyzeResults = async (testName: string, testType: string, summaryData: string): Promise<string> => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const prompt = `Act as a senior sensory panel leader. Analyze the following aggregated data for the test "${testName}" (Type: ${testType}). 
    
    Data Summary:
    ${summaryData}

    Provide a concise interpretation of the results in Italian. Highlight significant differences or dominant attributes.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;

    return response.text() || "Impossibile generare l'analisi.";
  } catch (error) {
    console.error("Error analyzing results:", error);
    return "Errore durante l'analisi AI.";
  }
};