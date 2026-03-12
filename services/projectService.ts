
import { supabase } from './supabaseClient';
import { Project, ProjectConfig } from '../types';
import { Logger } from "./Logger";

export interface ProjectHistoryItem {
  id: string;
  project_id: string;
  files: Record<string, string>;
  message: string;
  created_at: string;
}


export const projectService = {
  async getProjects(userId: string): Promise<Project[]> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    
    if (error) {
      Logger.error("Error fetching projects", error, { component: 'ProjectService', userId });
      throw new Error(error.message);
    }
    return data || [];
  },

  async getProjectById(projectId: string): Promise<Project | null> {
    const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle();
    if (error) {
      Logger.error("Error fetching project", error, { component: 'ProjectService', projectId });
      throw new Error(error.message);
    }
    return data;
  },

  async deleteProject(userId: string, projectId: string) {
    // Attempt to delete history, but don't let it block project deletion if it fails
    try {
      const { error: historyError } = await supabase.from('project_history').delete().eq('project_id', projectId);
      if (historyError) Logger.warn("Could not clear project history", { component: 'ProjectService', projectId }, historyError);
    } catch (e) {
      Logger.warn("Could not clear project history", { component: 'ProjectService', projectId }, e);
    }
    
    const { error } = await supabase.from('projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', userId);
      
    if (error) {
      Logger.error("Project delete error", error, { component: 'ProjectService', projectId, userId });
      throw new Error(error.message || "Failed to delete project from cloud.");
    }
    return true;
  },
// ... (rest of the file)

  async saveProject(userId: string, name: string, files: Record<string, string>, config?: ProjectConfig) {
    const { data, error } = await supabase.from('projects').insert({ 
      user_id: userId, 
      name, 
      files, 
      config,
      messages: [] // Start with empty history for new projects
    }).select().single();
    if (error) throw error;
    return data;
  },

  async updateProject(userId: string, projectId: string, files: Record<string, string>, config?: ProjectConfig) {
    const { error } = await supabase.from('projects').update({ files, config, updated_at: new Date().toISOString() }).eq('id', projectId).eq('user_id', userId);
    if (error) throw error;
  },

  async renameProject(userId: string, projectId: string, newName: string) {
    const { error } = await supabase.from('projects').update({ name: newName, updated_at: new Date().toISOString() }).eq('id', projectId).eq('user_id', userId);
    if (error) throw error;
  },

  async createProjectSnapshot(projectId: string, files: Record<string, string>, message: string) {
    const { data, error } = await supabase.from('project_history').insert({ project_id: projectId, files, message }).select().single();
    if (error) throw error;
    return data;
  },


  async getProjectHistory(projectId: string): Promise<ProjectHistoryItem[]> {
    const { data, error } = await supabase.from('project_history').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
    if (error) {
      Logger.error("Error fetching history", error, { component: 'ProjectService', projectId });
      throw new Error(error.message);
    }
    return data || [];
  },

  async deleteProjectSnapshot(snapshotId: string) {
    const { error } = await supabase.from('project_history').delete().eq('id', snapshotId);
    if (error) throw error;
  }
};
