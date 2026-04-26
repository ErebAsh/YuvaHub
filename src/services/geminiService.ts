import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { Event, UserProfile, RelatedDomains } from "../types";
import { FALLBACK_EVENTS } from "../constants";

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is missing. Using fallback mode.");
      return null;
    }
    if (!aiClient) {
      aiClient = new GoogleGenAI({ apiKey });
    }
    return aiClient;
  } catch (err) {
    console.error("Failed to initialize AI client:", err);
    return null;
  }
}

/**
 * Robustly parses a string that might contain JSON wrapped in conversational text
 */
function safeJsonParse<T>(text: string, defaultValue: T): T {
  try {
    // 1. Try direct parse first
    return JSON.parse(text.trim());
  } catch (e) {
    try {
      // 2. Try to find the first '{' or '[' and the last '}' or ']'
      const firstCurly = text.indexOf('{');
      const firstSquare = text.indexOf('[');
      
      let start = -1;
      let end = -1;
      
      if (firstCurly !== -1 && (firstSquare === -1 || firstCurly < firstSquare)) {
        start = firstCurly;
        end = text.lastIndexOf('}') + 1;
      } else if (firstSquare !== -1) {
        start = firstSquare;
        end = text.lastIndexOf(']') + 1;
      }
      
      if (start !== -1 && end !== -1) {
        const potentialJson = text.substring(start, end);
        return JSON.parse(potentialJson);
      }
    } catch (innerError) {
      console.warn("Deeper JSON extraction failed:", innerError);
    }
    console.error("Failed to parse AI response as JSON:", text.substring(0, 100) + "...");
    return defaultValue;
  }
}

export async function fetchEventsAndSchemes(query: string = "", profile?: UserProfile): Promise<Event[]> {
  try {
    const ai = getAiClient();
    
    // If no AI client (missing key or init error), return fallback immediately
    if (!ai) {
      console.info("API Key not available. Serving high-quality fallback data.");
      return FALLBACK_EVENTS;
    }

    const profileContext = profile ? `
      User Profile:
      - Location: ${profile.location}
      - Age: ${profile.age}
      - Interests: ${profile.interests.join(", ")}
    ` : "";

    const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const prompt = `Current Date: ${currentDate}. 
      Find 8-10 ACTIVE corporate hackathons, government schemes, or programs. 
      ${query ? `PRIORITY FOCUS: Search specifically for "${query}". If "${query}" refers to a specific known program, ensure it is in the results.` : ''}
      ONLY include events with deadlines AFTER ${currentDate}.
      ${profileContext}
      STRICT REQUIREMENT: Return ONLY a JSON array of objects.`;

    const schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          organization: { type: Type.STRING },
          type: { type: Type.STRING, description: "hackathon, scheme, or program" },
          description: { type: Type.STRING },
          location: { type: Type.STRING },
          date: { type: Type.STRING },
          link: { type: Type.STRING },
          applyLink: { type: Type.STRING },
          price: { type: Type.STRING },
          isPaid: { type: Type.BOOLEAN },
          coordinates: {
            type: Type.OBJECT,
            properties: {
              lat: { type: Type.NUMBER },
              lng: { type: Type.NUMBER }
            },
            required: ["lat", "lng"]
          }
        },
        required: ["id", "title", "organization", "type", "description", "location", "date", "link", "applyLink", "price", "isPaid", "coordinates"]
      }
    };

    let response;
    try {
      response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });
    } catch (error: any) {
      if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED')) {
        return FALLBACK_EVENTS;
      }
      // Fallback attempt without tools - optimized for speed
      response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt + "\n\nNote: Use internal knowledge. Speed is priority. JSON ONLY.",
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });
    }

    return safeJsonParse(response.text, FALLBACK_EVENTS);
  } catch (error: any) {
    console.error("Detailed Gemini Error:", error);
    return FALLBACK_EVENTS;
  }
}

export async function getSearchSuggestions(partialQuery: string): Promise<string[]> {
  if (!partialQuery || partialQuery.length < 2) return [];
  
  try {
    const ai = getAiClient();
    if (!ai) return [];

    const prompt = `Based on the partial search query: "${partialQuery}", suggest 4-5 highly relevant search terms related to corporate hackathons, government student schemes, internships, and educational programs in India.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      },
    });

    return safeJsonParse(response.text, []);
  } catch (error: any) {
    return [];
  }
}

export async function getRelatedDomains(topic: string): Promise<RelatedDomains | null> {
  if (!topic || topic.length < 3) return null;
  
  try {
    const ai = getAiClient();
    if (!ai) return null;

    const prompt = `Analyze the search query: "${topic}". Identify 3-4 highly specific and relevant sub-domains or specialized career paths within this topic for students in India.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING },
        domains: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              relevance: { type: Type.STRING },
              marketTrend: { type: Type.STRING }
            },
            required: ["title", "description", "relevance", "marketTrend"]
          }
        }
      },
      required: ["topic", "domains"]
    };

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: schema
      },
    });

    return safeJsonParse(response.text, null);
  } catch (error) {
    console.error("Related domains error:", error);
    return null;
  }
}

export async function getAssistantResponse(userMessage: string, profile: UserProfile | null, currentEvents: Event[]): Promise<string> {
  try {
    const ai = getAiClient();
    if (!ai) return "I'm sorry, my AI processing is currently offline. Please try again later.";

    const context = `
      User Profile: ${JSON.stringify(profile)}
      Available Opportunities: ${JSON.stringify(currentEvents.map(e => ({ title: e.title, organization: e.organization, type: e.type, isPaid: e.isPaid })))}
    `;

    const prompt = `You are a helpful student opportunity assistant named YuvaHub AI.
    Your goal is to help students find hackathons, scholarships, and programs.
    Use the provided context to answer the user's question accurately.
    If they ask for specific types (e.g., beginner, free, AI-related), look through the available opportunities.
    Be encouraging and concise.
    
    Context: ${context}
    User Message: ${userMessage}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        tools: [{ googleSearch: {} }] // Allow searching for external info if not in context
      },
    });

    return response.text;
  } catch (error) {
    console.error("AI Assistant error:", error);
    return "I encountered an error while processing your request. How else can I help you today?";
  }
}

export async function generateDraft(type: 'SOP' | 'Email', opportunityTitle: string, organization: string, profile: UserProfile | null): Promise<string> {
  try {
    const ai = getAiClient();
    if (!ai) return "";

    const prompt = `Draft a professional ${type === 'SOP' ? 'Statement of Purpose' : 'Application Email'} for a student applying to "${opportunityTitle}" at "${organization}".
    Using the profile: ${JSON.stringify(profile)}.
    Ensure it's structured, professional, and includes placeholders where specific details are needed.
    Add a CLEAR DISCLAIMER at the top that the student MUST customize this content.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
    });

    return response.text;
  } catch (error) {
    console.error("Draft generation error:", error);
    return "Failed to generate draft. Please try again.";
  }
}
