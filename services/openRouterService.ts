
import { ChatMessage, WorkspaceType, AIProvider, GenerationMode, GenerationResult } from "../types";
import { Logger } from "./Logger";
import * as Prompts from "./aiPrompts";

export class OpenRouterService implements AIProvider {
  private parseModelJson(text: string | null): any {
    if (!text) {
      Logger.warn("OpenRouter returned empty or null content.");
      return null;
    }

    try {
      // Clean markdown blocks if present
      let cleaned = text.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      
      return JSON.parse(cleaned);
    } catch (error) {
      Logger.error("Failed to parse OpenRouter JSON response", error, { text });
      
      // Fallback: try to extract JSON from text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e) {
          // ignore
        }
      }
      
      throw new Error("AI returned invalid JSON format. Please try again.");
    }
  }

  async callPhase(
    phase: 'planning' | 'coding' | 'review' | 'security' | 'performance' | 'uiux' | 'file_selection' | 'de_noise',
    input: string,
    modelName: string = 'anthropic/claude-3.5-sonnet',
    retries: number = 3
  ): Promise<any> {
    let systemInstruction = '';
    switch (phase) {
      case 'de_noise':
        systemInstruction = Prompts.DE_NOISE_PROMPT;
        break;
      case 'file_selection':
        systemInstruction = `You are an AI File Selector. Your ONLY job is to analyze the user's request and a list of available file paths, and return a JSON array of the file paths that are absolutely necessary to read or modify to fulfill the request.
Return ONLY a JSON array of strings. Example: ["app/App.tsx", "app/components/Login.tsx"]
Do NOT return any other text.`;
        break;
      case 'planning': 
        systemInstruction = `${Prompts.BASE_ROLE}\n\n${Prompts.DEEP_THINKING}\n\n${Prompts.FIRST_COMMAND_COMPLETION}\n\n${Prompts.STRICT_SCOPE_EDITING}\n\n${Prompts.DEPENDENCY_GRAPH}\n\n${Prompts.GLOBAL_STATE_TRACKER}\n\n${Prompts.MANDATORY_RULES}\n\n${Prompts.MOBILE_UI_PATTERNS}\n\n${Prompts.PLANNING_PROMPT}\n\n${Prompts.E2B_SANDBOX_PROMPT}\n\n${Prompts.RESPONSE_FORMAT}`; 
        break;
      case 'coding': 
        systemInstruction = `${Prompts.BASE_ROLE}\n\n${Prompts.DEEP_THINKING}\n\n${Prompts.FIRST_COMMAND_COMPLETION}\n\n${Prompts.STRICT_SCOPE_EDITING}\n\n${Prompts.UNIT_TESTING}\n\n${Prompts.DEPENDENCY_GRAPH}\n\n${Prompts.GLOBAL_STATE_TRACKER}\n\n${Prompts.SURGICAL_EDITING}\n\n${Prompts.PATCH_MODE_RULE}\n\n${Prompts.MANDATORY_RULES}\n\n${Prompts.DESIGN_SYSTEM}\n\n${Prompts.MOBILE_UI_PATTERNS}\n\n${Prompts.CODING_PROMPT}\n\n${Prompts.E2B_SANDBOX_PROMPT}\n\n${Prompts.RESPONSE_FORMAT}`; 
        break;
      case 'review': 
        systemInstruction = `${Prompts.BASE_ROLE}\n\n${Prompts.STRICT_SCOPE_EDITING}\n\n${Prompts.SURGICAL_EDITING}\n\n${Prompts.PATCH_MODE_RULE}\n\n${Prompts.REVIEW_PROMPT}\n\n${Prompts.RESPONSE_FORMAT}`; 
        break;
      case 'security': 
        systemInstruction = `${Prompts.BASE_ROLE}\n\n${Prompts.STRICT_SCOPE_EDITING}\n\n${Prompts.SURGICAL_EDITING}\n\n${Prompts.PATCH_MODE_RULE}\n\n${Prompts.OPTIMIZATION_PROMPT}\n\n${Prompts.RESPONSE_FORMAT}`; 
        break;
      case 'performance': 
        systemInstruction = `${Prompts.BASE_ROLE}\n\n${Prompts.STRICT_SCOPE_EDITING}\n\n${Prompts.SURGICAL_EDITING}\n\n${Prompts.PATCH_MODE_RULE}\n\n${Prompts.PERFORMANCE_PROMPT}\n\n${Prompts.RESPONSE_FORMAT}`; 
        break;
      case 'uiux': 
        systemInstruction = `${Prompts.BASE_ROLE}\n\n${Prompts.STRICT_SCOPE_EDITING}\n\n${Prompts.DESIGN_SYSTEM}\n\n${Prompts.SURGICAL_EDITING}\n\n${Prompts.PATCH_MODE_RULE}\n\n${Prompts.UI_UX_PROMPT}\n\n${Prompts.RESPONSE_FORMAT}`; 
        break;
    }

    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch("https://oneclick-backend-production.up.railway.app/api/chat/openrouter", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: "user", content: input }],
            systemInstruction: systemInstruction,
            temperature: 0.1
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.details || errorData.error || `Backend error: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || "Unknown backend error");
        }

        return this.parseModelJson(data.content || null);
      } catch (error: any) {
        Logger.warn(`OpenRouter attempt ${attempt} failed`, { component: 'OpenRouterService', model: modelName, attempt }, error);
        lastError = error;
        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw new Error(`OpenRouter API failed after ${retries} attempts: ${lastError?.message}`);
  }
}
