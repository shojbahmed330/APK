import { Logger } from "./Logger";

export class E2BService {
  private baseUrl = "https://oneclick-backend-production.up.railway.app/api/sandbox";
  private sandboxId: string;

  constructor(sandboxId: string = "default") {
    this.sandboxId = sandboxId;
  }

  async executeCommand(cmd: string) {
    return this.callSandbox('execute_command', { cmd });
  }

  async readFile(path: string) {
    return this.callSandbox('read_file', { path });
  }

  async writeFile(path: string, content: string) {
    return this.callSandbox('write_file', { path, content });
  }

  async listFiles(dir: string) {
    return this.callSandbox('list_files', { dir });
  }

  async createDirectory(path: string) {
    return this.callSandbox('create_directory', { path });
  }

  async deleteFile(path: string) {
    return this.callSandbox('delete_file', { path });
  }

  async patchFile(path: string, targetContent: string, replacementContent: string) {
    return this.callSandbox('patch_file', { path, targetContent, replacementContent });
  }

  private async callSandbox(action: string, params: any) {
    try {
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, params, sandboxId: this.sandboxId })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.result;
    } catch (error) {
      Logger.error(`E2B ${action} failed:`, error, { component: 'E2BService', action, params });
      throw error;
    }
  }
}
