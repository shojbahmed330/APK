
import { GithubConfig, ProjectConfig } from "../types";
import { WORKFLOW_YAML } from "./github/workflow";
import { toBase64 } from "./github/utils";
import { buildFinalHtml } from "../utils/previewBuilder";
import sodium from 'libsodium-wrappers';

export class GithubService {
  private async handleGithubError(res: Response, context: string): Promise<never> {
    let errorMsg = `GitHub API Error (${res.status}) during ${context}.`;
    let githubMessage = '';
    
    try {
      const errorData = await res.json();
      if (errorData.message) {
        githubMessage = errorData.message;
        errorMsg += ` Message: ${githubMessage}`;
      }
    } catch (e) {
      // Ignore JSON parse errors
    }

    if (res.status === 401) {
      throw new Error(`[GitHub 401] Unauthorized: আপনার গিটহাব টোকেনটি সঠিক নয় অথবা মেয়াদ শেষ হয়ে গেছে। দয়া করে সেটিংস থেকে পুনরায় গিটহাব কানেক্ট করুন। (Context: ${context})`);
    } else if (res.status === 403) {
      if (res.headers.get('x-ratelimit-remaining') === '0') {
        throw new Error(`[GitHub 403] Rate Limit Exceeded: গিটহাব এপিআই লিমিট শেষ হয়ে গেছে। কিছুক্ষণ পর আবার চেষ্টা করুন। (Context: ${context})`);
      }
      throw new Error(`[GitHub 403] Forbidden: আপনার এই কাজটি করার অনুমতি নেই। টোকেন স্কোপ (repo, workflow) চেক করুন। (Context: ${context})`);
    } else if (res.status === 404) {
      throw new Error(`[GitHub 404] Not Found: রিপোজিটরি বা ফাইলটি খুঁজে পাওয়া যায়নি। রিপোজিটরি নাম এবং পারমিশন চেক করুন। (Context: ${context})`);
    } else if (res.status === 422) {
      throw new Error(`[GitHub 422] Unprocessable Entity: গিটহাব ভ্যালিডেশন ফেইল করেছে। সম্ভবত এই নামে রিপোজিটরি ইতিমধ্যে আছে অথবা ডেটা ফরম্যাট ভুল। (Context: ${context}, Detail: ${githubMessage})`);
    }

    throw new Error(errorMsg);
  }

  async setRepoSecret(config: GithubConfig, name: string, value: string) {
    const { token, owner, repo } = config;
    
    if (!token) throw new Error("GitHub token is missing.");

    const headers = { 
      'Authorization': `token ${token}`, 
      'Accept': 'application/vnd.github.v3+json' 
    };

    // 1. Get public key
    const keyRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/secrets/public-key`, { headers });
    if (!keyRes.ok) await this.handleGithubError(keyRes, 'fetching public key');
    const { key_id, key } = await keyRes.json();

    // 2. Encrypt the secret
    await sodium.ready;
    const binKey = sodium.from_base64(key, sodium.base64_variants.ORIGINAL);
    const binSec = sodium.from_string(value);
    const encSec = sodium.crypto_box_seal(binSec, binKey);
    const output = sodium.to_base64(encSec, sodium.base64_variants.ORIGINAL);

    // 3. Update secret
    const updateRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/secrets/${name}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        encrypted_value: output,
        key_id: key_id
      })
    });
    if (!updateRes.ok) await this.handleGithubError(updateRes, `updating secret ${name}`);
  }

  async createRepo(token: string, repoName: string): Promise<string> {
    const headers = { 
      'Authorization': `token ${token}`, 
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };
    
    const userRes = await fetch('https://api.github.com/user', { headers });
    if (!userRes.ok) await this.handleGithubError(userRes, 'authenticating user');
    const userData = await userRes.json();
    const username = userData.login;
    
    const checkRes = await fetch(`https://api.github.com/repos/${username}/${repoName}`, { headers });
    
    if (!checkRes.ok) {
      if (checkRes.status === 404) {
        const createRes = await fetch('https://api.github.com/user/repos', {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: repoName, private: false, auto_init: true })
        });
        if (!createRes.ok) await this.handleGithubError(createRes, 'creating repository');
        
        await new Promise(r => setTimeout(r, 4000));
        
        try {
          const pagesRes = await fetch(`https://api.github.com/repos/${username}/${repoName}/pages`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ build_type: 'workflow' })
          });
          if (!pagesRes.ok) {
             console.warn(`Could not auto-enable Pages: ${pagesRes.status}`);
          }
        } catch (e) {
          console.warn("Could not auto-enable Pages.");
        }
      } else {
        await this.handleGithubError(checkRes, 'checking repository existence');
      }
    }

    return username;
  }

  async pushToGithub(config: GithubConfig, files: Record<string, string>, appConfig?: ProjectConfig, customMessage?: string) {
    const { token, owner, repo } = config;
    const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const headers = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' };

    let sanitizedAppId = (appConfig?.packageName || 'com.oneclick.studio').toLowerCase().replace(/[^a-z0-9.]/g, '');
    const capConfig = { appId: sanitizedAppId, appName: appConfig?.appName || 'OneClickApp', webDir: 'www' };
    
    // CRITICAL: Isolate App workspace from Admin workspace during bundling
    const appOnlyFiles = Object.fromEntries(
        Object.entries(files).filter(([path]) => path.startsWith('app/') || !path.includes('/'))
    );

    const entryPath = files['app/index.html'] ? 'app/index.html' : 'index.html';
    const bundledAppHtml = buildFinalHtml(appOnlyFiles, entryPath, appConfig, true);
    
    const allFiles: Record<string, string> = { ...files };
    
    // Overwrite the entry HTML files with the bundled versions so the app works on devices
    allFiles[entryPath] = bundledAppHtml;
    
    const adminEntryPath = files['admin/index.html'] ? 'admin/index.html' : (files['admin.html'] ? 'admin.html' : null);
    if (adminEntryPath) {
        const adminOnlyFiles = Object.fromEntries(
            Object.entries(files).filter(([path]) => path.startsWith('admin/') || path === 'admin.html' || !path.includes('/'))
        );
        allFiles[adminEntryPath] = buildFinalHtml(adminOnlyFiles, adminEntryPath, appConfig, true);
    }
    
    allFiles['capacitor.config.json'] = JSON.stringify(capConfig, null, 2);

    if (appConfig?.icon) allFiles['assets/icon-only.png'] = appConfig.icon;
    if (appConfig?.keystore_base64) allFiles['android/app/release-key.jks'] = appConfig.keystore_base64;

    const filePaths = Object.keys(allFiles);
    
    for (const path of filePaths) {
      const content = allFiles[path];
      const isBinary = content.startsWith('data:') || path.startsWith('assets/') || path.endsWith('.jks');
      const finalContent = isBinary ? content.split(',')[1] || content : toBase64(content);

      const getRes = await fetch(`${baseUrl}/contents/${path}`, { headers });
      let sha: string | undefined;
      if (getRes.ok) {
        const data = await getRes.json();
        sha = data.sha;
      } else if (getRes.status !== 404) {
        await this.handleGithubError(getRes, `fetching file info for ${path}`);
      }

      const putRes = await fetch(`${baseUrl}/contents/${path}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `${customMessage || "Production Bundle"} [${path}]`, content: finalContent, sha })
      });
      if (!putRes.ok) await this.handleGithubError(putRes, `pushing file ${path}`);
    }

    const workflowPath = '.github/workflows/android.yml';
    const getWorkflowRes = await fetch(`${baseUrl}/contents/${workflowPath}`, { headers });
    let workflowSha: string | undefined;
    if (getWorkflowRes.ok) {
      const data = await getWorkflowRes.json();
      workflowSha = data.sha;
    } else if (getWorkflowRes.status !== 404) {
      await this.handleGithubError(getWorkflowRes, `fetching workflow info`);
    }

    let finalWorkflow = WORKFLOW_YAML;
    if (appConfig?.keystore_base64) {
        finalWorkflow = finalWorkflow
            .replace('SIGNING_STORE_PASSWORD: ""', `SIGNING_STORE_PASSWORD: "${appConfig.keystore_password}"`)
            .replace('SIGNING_KEY_ALIAS: ""', `SIGNING_KEY_ALIAS: "${appConfig.key_alias}"`)
            .replace('SIGNING_KEY_PASSWORD: ""', `SIGNING_KEY_PASSWORD: "${appConfig.key_password}"`);
    }

    const putWorkflowRes = await fetch(`${baseUrl}/contents/${workflowPath}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: `Uplink Build Engine [${workflowPath}]`, 
        content: toBase64(finalWorkflow), 
        sha: workflowSha 
      })
    });
    if (!putWorkflowRes.ok) await this.handleGithubError(putWorkflowRes, `pushing workflow file`);
  }

  async getRunDetails(config: GithubConfig) {
    const headers = { 'Authorization': `token ${config.token}`, 'Accept': 'application/vnd.github.v3+json' };
    try {
      const runsRes = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/actions/runs?per_page=1`, { headers });
      if (!runsRes.ok) {
        if (runsRes.status === 404) return null; // Repo or runs not found yet
        await this.handleGithubError(runsRes, 'fetching workflow runs');
      }
      const data = await runsRes.json();
      const latestRun = data.workflow_runs?.[0];
      if (!latestRun) return null;

      const jobsRes = await fetch(latestRun.jobs_url, { headers });
      if (!jobsRes.ok) await this.handleGithubError(jobsRes, 'fetching job details');
      const jobsData = await jobsRes.json();
      return { run: latestRun, jobs: jobsData.jobs || [] };
    } catch (e) { 
      console.error("Error getting run details:", e);
      return null; 
    }
  }

  async getLatestApk(config: GithubConfig) {
    const details = await this.getRunDetails(config);
    if (!details || details.run.status !== 'completed') return null;

    const headers = { 'Authorization': `token ${config.token}`, 'Accept': 'application/vnd.github.v3+json' };
    const artifactsRes = await fetch(details.run.artifacts_url, { headers });
    if (!artifactsRes.ok) await this.handleGithubError(artifactsRes, 'fetching artifacts');
    const data = await artifactsRes.json();
    
    const apk = data.artifacts?.find((a: any) => a.name === 'app-debug' || a.name === 'app-release');
    
    return { 
      downloadUrl: apk?.archive_download_url, 
      webUrl: `https://${config.owner}.github.io/${config.repo}/`,
      runUrl: details.run.html_url
    };
  }

  async getJobLogs(config: GithubConfig, jobId: number): Promise<string | null> {
    const headers = { 'Authorization': `token ${config.token}`, 'Accept': 'application/vnd.github.v3+json' };
    try {
      const res = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/actions/jobs/${jobId}/logs`, { headers });
      if (!res.ok) {
        if (res.status === 404) return null; // Logs might not be ready
        await this.handleGithubError(res, 'fetching job logs');
      }
      return await res.text();
    } catch (e) { 
      console.error("Error getting job logs:", e);
      return null; 
    }
  }

  async downloadArtifact(config: GithubConfig, url: string) {
    const res = await fetch(url, { headers: { 'Authorization': `token ${config.token}` } });
    if (!res.ok) await this.handleGithubError(res, 'downloading artifact');
    return await res.blob();
  }
}
