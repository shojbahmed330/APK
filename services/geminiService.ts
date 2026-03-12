
import { GoogleGenAI, Type } from "@google/genai";
import { ChatMessage, WorkspaceType, AIProvider, GenerationMode, GenerationResult } from "../types";
import { Logger } from "./Logger";
import * as Prompts from "./aiPrompts";
import { E2BService } from "./e2bService";

export class GeminiService implements AIProvider {
  private extractBalancedJsonBlock(input: string): string | null {
    const start = input.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < input.length; i++) {
      const ch = input[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          return input.slice(start, i + 1);
        }
      }
    }

    return null;
  }

  private parseModelJson(rawText: string): any {
    const text = (rawText || '{}').trim();

    const tryParse = (str: string) => {
      try {
        return JSON.parse(str);
      } catch (e) {
        // Try repairing truncated/broken JSON
        let fixed = str
          .replace(/[\u0000-\u001F]/g, ' ')  // remove control characters
          .replace(/,\s*([}\]])/g, '$1');    // fix trailing commas
        
        // Attempt to fix missing commas between properties
        // Matches "value" "nextProperty" or 123 "nextProperty"
        fixed = fixed.replace(/("|\d|true|false|null)\s*\n\s*"/g, '$1,\n"');

        try {
          const repaired = JSON.parse(fixed);
          console.log('Successfully repaired JSON with missing commas');
          return repaired;
        } catch (e2) {
          // If still failing, try to close open braces/brackets for truncated JSON
          let truncatedFixed = fixed;
          const openBraces = (truncatedFixed.match(/{/g) || []).length;
          const closeBraces = (truncatedFixed.match(/}/g) || []).length;
          const openBrackets = (truncatedFixed.match(/\[/g) || []).length;
          const closeBrackets = (truncatedFixed.match(/]/g) || []).length;
          
          for (let i = 0; i < openBrackets - closeBrackets; i++) truncatedFixed += ']';
          for (let i = 0; i < openBraces - closeBraces; i++) truncatedFixed += '}';
          
          try {
            const repairedTruncated = JSON.parse(truncatedFixed);
            console.log('Successfully repaired truncated JSON');
            return repairedTruncated;
          } catch (e3) {
            return null;
          }
        }
      }
    };

    // 1) Direct parse first
    let result = tryParse(text);
    if (result) return result;

    // 2) Parse fenced JSON block if present
    const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
    if (fenced) {
      result = tryParse(fenced);
      if (result) return result;
    }

    // 3) Parse first syntactically balanced JSON object from mixed text
    const balanced = this.extractBalancedJsonBlock(text);
    if (balanced) {
      result = tryParse(balanced);
      if (result) return result;
    }

    // 4) Legacy fallback: first { to last }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const slice = text.substring(firstBrace, lastBrace + 1);
      result = tryParse(slice);
      if (result) return result;
    }

    // 5) Ultimate Fallback: Extract Markdown Code Blocks
    // If the model completely failed to output JSON, but output markdown code blocks.
    const files: Record<string, string> = {};
    let foundFiles = false;
    
    // Split by code blocks
    const parts = text.split(/```[a-zA-Z]*\n/);
    for (let i = 1; i < parts.length; i++) {
        const codePart = parts[i].split('```')[0];
        if (codePart) {
            // Try to find a filename in the text immediately preceding the code block
            const precedingText = parts[i-1].trim();
            const lines = precedingText.split('\n');
            const lastLine = lines[lines.length - 1].trim();
            
            // Look for something that looks like a file path
            const fileMatch = lastLine.match(/([a-zA-Z0-9_.\-/]+\.[a-zA-Z0-9]+)/);
            const filename = fileMatch ? fileMatch[1] : `extracted_file_${i}.ts`;
            
            files[filename] = codePart.trim();
            foundFiles = true;
        }
    }

    if (foundFiles) {
      return {
        thought: "JSON parsing failed due to truncation or syntax errors. Extracted files from markdown blocks as a fallback.",
        files: files
      };
    }

    // If all else fails, throw the original error to trigger retry
    return JSON.parse(text);
  }

  private isLocalModel(modelName: string): boolean {
    const name = modelName.toLowerCase();
    return name.includes('local') || name.includes('llama') || name.includes('qwen') || name.includes('coder');
  }

  async callPhase(
    phase: 'planning' | 'coding' | 'review' | 'security' | 'performance' | 'uiux' | 'file_selection' | 'de_noise',
    input: string,
    modelName: string = 'gemini-3-pro-preview',
    retries: number = 3,
    cachedContentName?: string
  ): Promise<any> {
    // ... (systemInstruction setup remains same)
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

    if (this.isLocalModel(modelName)) {
      return this.callPhaseWithOllama(modelName, systemInstruction, input);
    }

    const model = modelName.includes('pro') ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
    const e2b = new E2BService();

    const tools = [{
      functionDeclarations: [
        {
          name: "execute_command",
          description: "Execute a terminal command in the sandbox (e.g., npm install, npm run build, grep, ls, cat).",
          parameters: {
            type: Type.OBJECT,
            properties: { cmd: { type: Type.STRING } },
            required: ["cmd"]
          }
        },
        {
          name: "read_file",
          description: "Read the contents of a file in the sandbox.",
          parameters: {
            type: Type.OBJECT,
            properties: { path: { type: Type.STRING } },
            required: ["path"]
          }
        },
        {
          name: "write_file",
          description: "Write content to a file in the sandbox. Overwrites existing content.",
          parameters: {
            type: Type.OBJECT,
            properties: { path: { type: Type.STRING }, content: { type: Type.STRING } },
            required: ["path", "content"]
          }
        },
        {
          name: "list_files",
          description: "List files and directories in a specific path in the sandbox.",
          parameters: {
            type: Type.OBJECT,
            properties: { dir: { type: Type.STRING } },
            required: ["dir"]
          }
        },
        {
          name: "create_directory",
          description: "Create a new directory in the sandbox.",
          parameters: {
            type: Type.OBJECT,
            properties: { path: { type: Type.STRING } },
            required: ["path"]
          }
        },
        {
          name: "delete_file",
          description: "Delete a file or directory in the sandbox.",
          parameters: {
            type: Type.OBJECT,
            properties: { path: { type: Type.STRING } },
            required: ["path"]
          }
        },
        {
          name: "patch_file",
          description: "Apply a patch or replace specific content in a file.",
          parameters: {
            type: Type.OBJECT,
            properties: { 
              path: { type: Type.STRING }, 
              targetContent: { type: Type.STRING, description: "The exact string to replace" },
              replacementContent: { type: Type.STRING, description: "The new string to insert" }
            },
            required: ["path", "targetContent", "replacementContent"]
          }
        }
      ]
    }];

    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        let isDone = false;
        let finalContent = "";
        let messages: any[] = [{ role: "user", parts: [{ text: input }] }];

        while (!isDone) {
          const response = await fetch("https://oneclick-backend-production.up.railway.app/api/chat/gemini", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: model,
              messages: messages,
              systemInstruction: systemInstruction,
              temperature: 0.1,
              tools: tools
            })
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.details || errData.error || `Backend error: ${response.statusText}`);
          }
          
          const data = await response.json();
          if (!data.success) {
            throw new Error(data.error || "Unknown backend error");
          }

          if (data.functionCalls && data.functionCalls.length > 0) {
            const functionResponses: any[] = [];
            
            for (const call of data.functionCalls) {
              let result;
              try {
                Logger.info(`AI calling tool: ${call.name}`, { component: 'GeminiService', args: call.args });
                
                let actionMsg = `Executing ${call.name}...`;
                if (call.name === 'execute_command') actionMsg = `Running command: ${call.args.cmd}`;
                else if (call.name === 'read_file') actionMsg = `Reading file: ${call.args.path}`;
                else if (call.name === 'write_file') actionMsg = `Writing file: ${call.args.path}`;
                else if (call.name === 'patch_file') actionMsg = `Patching file: ${call.args.path}`;
                else if (call.name === 'list_files') actionMsg = `Listing files in: ${call.args.dir}`;
                else if (call.name === 'create_directory') actionMsg = `Creating directory: ${call.args.path}`;
                else if (call.name === 'delete_file') actionMsg = `Deleting file: ${call.args.path}`;
                
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('ai_tool_action', { detail: actionMsg }));
                }

                if (call.name === 'execute_command') result = await e2b.executeCommand(call.args.cmd);
                else if (call.name === 'read_file') result = await e2b.readFile(call.args.path);
                else if (call.name === 'write_file') result = await e2b.writeFile(call.args.path, call.args.content);
                else if (call.name === 'list_files') result = await e2b.listFiles(call.args.dir);
                else if (call.name === 'create_directory') result = await e2b.createDirectory(call.args.path);
                else if (call.name === 'delete_file') result = await e2b.deleteFile(call.args.path);
                else if (call.name === 'patch_file') result = await e2b.patchFile(call.args.path, call.args.targetContent, call.args.replacementContent);
              } catch (e: any) {
                result = { error: e.message };
              }
              
              functionResponses.push({
                name: call.name,
                response: { result }
              });
            }

            messages.push({ role: "model", parts: data.functionCalls.map((fc: any) => ({ functionCall: fc })) });
            messages.push({ role: "user", parts: functionResponses.map((fr: any) => ({ functionResponse: fr })) });
          } else {
            finalContent = data.content;
            isDone = true;
          }
        }
        
        return this.parseModelJson(finalContent || '{}');
      } catch (error: any) {
        Logger.warn(`Attempt ${attempt} failed`, { component: 'GeminiService', model, attempt }, error);
        lastError = error;
        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw new Error(`Gemini API failed after ${retries} attempts: ${lastError?.message}`);
  }

  async createContextCache(context: string, modelName: string = 'gemini-3-pro-preview'): Promise<string | null> {
    // Context caching is currently disabled when using the Railway backend
    // as it requires direct API key access or a dedicated backend endpoint.
    return null;
  }

  private async callPhaseWithOllama(model: string, system: string, prompt: string): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout for local models

    try {
      const response = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt }
          ],
          stream: false,
          format: 'json'
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
      const data = await response.json();
      
      let content = data.message.content;
      // Sanitize markdown code blocks if present
      content = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
      return JSON.parse(content);
    } catch (e: any) {
      clearTimeout(timeoutId);
      Logger.error("Phase call failed", e, { component: 'GeminiService', model, provider: 'Ollama' });
      throw new Error(`Local model execution failed: ${e.message}. Ensure Ollama is running at http://127.0.0.1:11434 and OLLAMA_ORIGINS="*" is set.`);
    }
  }
}
