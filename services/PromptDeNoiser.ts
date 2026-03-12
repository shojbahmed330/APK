
import { AIProvider } from "../types";
import { Logger } from "./Logger";

export interface TechnicalSpec {
  intent: string;
  features: string[];
  data_fields: string[];
  style: string;
  technical_notes: string;
}

export class PromptDeNoiser {
  /**
   * Converts a messy user prompt into a structured technical specification.
   * Uses a fast model (Gemini Flash) for cost-efficiency.
   */
  public static async deNoise(prompt: string, ai: AIProvider): Promise<TechnicalSpec | null> {
    try {
      Logger.info("De-noising user prompt...", { component: 'PromptDeNoiser' });
      
      // Always use a fast model for de-noising
      const fastModel = 'gemini-3-flash-preview';
      
      const result = await ai.callPhase('de_noise', prompt, fastModel, 2);
      
      if (result && typeof result === 'object' && result.intent) {
        return result as TechnicalSpec;
      }
      
      return null;
    } catch (error) {
      Logger.error("Prompt de-noising failed", error, { component: 'PromptDeNoiser' });
      return null;
    }
  }

  /**
   * Formats the technical spec into a string for the AI prompt.
   */
  public static formatForAI(spec: TechnicalSpec): string {
    const features = Array.isArray(spec.features) ? spec.features.join(', ') : 'None';
    const dataFields = Array.isArray(spec.data_fields) ? spec.data_fields.join(', ') : 'None';
    
    return `### 📋 TECHNICAL SPECIFICATION (STRICTLY FOLLOW THIS):
- INTENT: ${spec.intent}
- FEATURES: ${features}
- DATA FIELDS: ${dataFields}
- STYLE: ${spec.style || 'Standard'}
- NOTES: ${spec.technical_notes || 'None'}
`;
  }
}
