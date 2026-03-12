
import { Logger } from "./Logger";

export interface GlobalStateMap {
  contexts: Array<{
    name: string;
    file: string;
    values: string[];
    description: string;
  }>;
  sharedHooks: Array<{
    name: string;
    file: string;
    returns: string[];
  }>;
  constants: string[];
}

export class StateTracker {
  /**
   * Scans project files to build a map of global states and shared logic.
   */
  public static track(files: Record<string, string>): GlobalStateMap {
    const stateMap: GlobalStateMap = {
      contexts: [],
      sharedHooks: [],
      constants: []
    };

    try {
      for (const [path, content] of Object.entries(files)) {
        // 1. Detect React Contexts
        if (content.includes('createContext') || content.includes('Provider')) {
          const contextMatch = content.match(/const\s+(\w+Context)\s*=\s*createContext/);
          if (contextMatch) {
            const contextName = contextMatch[1];
            // Extract values provided in the Provider
            const valueMatch = content.match(/value=\{\{([\s\S]*?)\}\}/);
            const values = valueMatch 
              ? valueMatch[1].split(',').map(v => v.trim().split(':')[0].trim()).filter(v => v && !v.startsWith('//'))
              : [];

            stateMap.contexts.push({
              name: contextName,
              file: path,
              values,
              description: `Global context found in ${path}`
            });
          }
        }

        // 2. Detect Shared Hooks (useAuth, useTheme, etc.)
        if (path.includes('/hooks/') && content.includes('export const use')) {
          const hookMatch = content.match(/export const (use\w+)/);
          if (hookMatch) {
            const hookName = hookMatch[1];
            // Try to find what it returns
            const returnMatch = content.match(/return\s+\{([\s\S]*?)\}/);
            const returns = returnMatch
              ? returnMatch[1].split(',').map(v => v.trim().split(':')[0].trim()).filter(v => v && !v.startsWith('//'))
              : [];

            stateMap.sharedHooks.push({
              name: hookName,
              file: path,
              returns
            });
          }
        }

        // 3. Detect Global Constants
        if (path.includes('constants.ts') || path.includes('types.ts')) {
          const constMatches = content.matchAll(/export const (\w+)/g);
          for (const match of constMatches) {
            stateMap.constants.push(match[1]);
          }
        }
      }
    } catch (error) {
      Logger.error("State tracking failed", error, { component: 'StateTracker' });
    }

    return stateMap;
  }

  /**
   * Formats the state map into a readable string for the AI prompt.
   */
  public static formatForAI(map: GlobalStateMap): string {
    let output = "### GLOBAL STATE & SHARED LOGIC MAP:\n";
    
    if (map.contexts.length > 0) {
      output += "\nEXISTING CONTEXTS:\n";
      map.contexts.forEach(c => {
        output += `- ${c.name} (${c.file}): Provides [${c.values.join(', ')}]\n`;
      });
    }

    if (map.sharedHooks.length > 0) {
      output += "\nAVAILABLE SHARED HOOKS:\n";
      map.sharedHooks.forEach(h => {
        output += `- ${h.name} (${h.file}): Returns [${h.returns.join(', ')}]\n`;
      });
    }

    if (map.constants.length > 0) {
      output += `\nGLOBAL CONSTANTS/TYPES: [${map.constants.slice(0, 20).join(', ')}${map.constants.length > 20 ? '...' : ''}]\n`;
    }

    output += "\nINSTRUCTION: DO NOT create duplicate states or contexts. ALWAYS check if a value is already available in the map above before creating a new one.";
    
    return output;
  }
}
