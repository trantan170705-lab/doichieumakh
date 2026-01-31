import { GoogleGenAI } from "@google/genai";

export const analyzeDiscrepancies = async (
  listA: string[], 
  listB: string[], 
  missingInB: string[], 
  extraInB: string[]
): Promise<string> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        throw new Error("API Key not found");
    }

    const ai = new GoogleGenAI({ apiKey });
    
    // Construct a concise prompt
    const prompt = `
      You are a data analyst helper.
      I have compared two lists of codes (e.g., Customer Codes vs Actual Scanned Codes).
      
      Summary Stats:
      - List A (Target) size: ${listA.length}
      - List B (Actual) size: ${listB.length}
      - Missing in Actual (In A but not B): ${missingInB.length}
      - Extra in Actual (In B but not A): ${extraInB.length}
      
      Here are the first 20 missing codes: ${missingInB.slice(0, 20).join(', ')}...
      Here are the first 20 extra codes: ${extraInB.slice(0, 20).join(', ')}...
      
      Please provide a brief, professional executive summary (max 3 paragraphs) in Vietnamese. 
      Analyze potential reasons for these discrepancies (e.g., data entry errors, missing shipments, wrong scans) based on the patterns of the codes (e.g., if missing codes look similar, or if extra codes look like typos).
      Be helpful and constructive.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "Could not generate analysis.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Unable to analyze data at this time. Please check your API key.";
  }
};