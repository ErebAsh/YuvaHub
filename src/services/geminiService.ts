import { GoogleGenAI } from "@google/genai";
import { Event, UserProfile } from "../types";

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing. Please set it in your environment variables or Secrets panel.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export async function fetchEventsAndSchemes(query: string = "", profile?: UserProfile): Promise<Event[]> {
  try {
    const ai = getAiClient();
    const profileContext = profile ? `
      User Profile:
      - Location: ${profile.location}
      - Age: ${profile.age}
      - Interests: ${profile.interests.join(", ")}
    ` : "";

    const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const prompt = `Current Date: ${currentDate}. 
      List 12 ACTIVE and UPCOMING corporate hackathons, government schemes, and free/paid programs offered by companies or universities. 
      IMPORTANT: Only include events that have deadlines or start dates AFTER ${currentDate}. Do not include expired events.
      ${profileContext}
      Include: title, organization, type (hackathon, scheme, or program), a short description, location (city/state or "Online"), date/deadline, price (e.g., "Free", "Paid", or specific amount), and a link.
      Format the response as a JSON array of objects following this structure:
      {
        "id": "string",
        "title": "string",
        "organization": "string",
        "type": "hackathon" | "scheme" | "program",
        "description": "string",
        "location": "string",
        "date": "string",
        "link": "string",
        "price": "string",
        "coordinates": { "lat": number, "lng": number }
      }
      Search query context: ${query}`;

    let response;
    try {
      // First attempt with Google Search tool - limited to 15s
      const searchPromise = ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
        },
      });

      // Race against a timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Search timeout")), 15000)
      );

      response = await Promise.race([searchPromise, timeoutPromise]) as any;
    } catch (searchError: any) {
      console.warn("Gemini search tool failed or timed out, falling back to standard generation:", searchError.message);
      // Fallback attempt without tools - much faster
      response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: prompt + "\n\nNote: Use your internal knowledge to provide the most recent and accurate information possible.",
        config: {
          responseMimeType: "application/json",
        },
      });
    }

    const text = response.text;
    if (!text) {
      console.warn("Gemini returned empty response text.");
      return [];
    }
    
    // Handle potential markdown code blocks
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const jsonString = jsonMatch ? jsonMatch[0] : text;
    
    return JSON.parse(jsonString);
  } catch (error: any) {
    console.error("Detailed Gemini Error:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      cause: error.cause
    });
    return [];
  }
}
