
import { supabase as supabaseClient } from './supabaseClient';
import { authService } from './authService';
import { projectService, ProjectHistoryItem } from './projectService';
import { paymentService } from './paymentService';
import { User, Package, Transaction, ActivityLog, GithubConfig, Project, ProjectConfig } from '../types';
import { AuthChangeEvent, Session, Provider, AuthResponse, OAuthResponse } from '@supabase/supabase-js';

export type { ProjectHistoryItem };

export class DatabaseService {
  private static instance: DatabaseService;
  public supabase = supabaseClient;
  
  private constructor() {}

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  // Auth Delegation
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): { data: { subscription: { unsubscribe: () => void } } } {
    return authService.onAuthStateChange(callback);
  }
  async getCurrentSession(): Promise<Session | null> {
    return authService.getCurrentSession();
  }
  async signIn(email: string, password: string): Promise<AuthResponse> {
    return authService.signIn(email, password);
  }
  async signInWithOAuth(provider: Provider): Promise<OAuthResponse> {
    return authService.signInWithOAuth(provider);
  }
  async getUser(email: string, id?: string): Promise<User | null> {
    return authService.getUser(email, id);
  }
  async updateGithubConfig(userId: string, config: GithubConfig): Promise<void> {
    return authService.updateGithubConfig(userId, config);
  }
  async updateGithubTokenOnly(userId: string, token: string): Promise<void> {
    return authService.updateGithubTokenOnly(userId, token);
  }
  async linkGithubIdentity(): Promise<OAuthResponse> {
    return authService.linkGithubIdentity();
  }
  async unlinkGithubIdentity(): Promise<void> {
    return authService.unlinkGithubIdentity();
  }
  async signUp(email: string, password: string, name?: string): Promise<AuthResponse> {
    return authService.signUp(email, password, name);
  }
  async signOut(): Promise<void> {
    return authService.signOut();
  }

  // Project Delegation
  getProjects = projectService.getProjects.bind(projectService);
  getProjectById = projectService.getProjectById.bind(projectService);
  deleteProject = projectService.deleteProject.bind(projectService);
  saveProject = projectService.saveProject.bind(projectService);
  updateProject = projectService.updateProject.bind(projectService);
  renameProject = projectService.renameProject.bind(projectService);
  createProjectSnapshot = projectService.createProjectSnapshot.bind(projectService);
  getProjectHistory = projectService.getProjectHistory.bind(projectService);
  deleteProjectSnapshot = projectService.deleteProjectSnapshot.bind(projectService);

  // Payment Delegation
  getPackages = paymentService.getPackages.bind(paymentService);
  getUserTransactions = paymentService.getUserTransactions.bind(paymentService);
  submitPaymentRequest = paymentService.submitPaymentRequest.bind(paymentService);
  getAdminTransactions = paymentService.getAdminTransactions.bind(paymentService);
  updateTransactionStatus = paymentService.updateTransactionStatus.bind(paymentService);

  // Core Utilities & Admin
  async useToken(userId: string, email: string): Promise<User | null> {
    const userResult = await this.getUser(email, userId);
    if (userResult?.isAdmin) return userResult;
    if (userResult && userResult.tokens > 0) {
      await this.supabase.from('users').update({ tokens: userResult.tokens - 1 }).eq('id', userId);
    }
    return this.getUser(email, userId);
  }

  async updatePassword(newPassword: string): Promise<void> { 
    await this.supabase.auth.updateUser({ password: newPassword }); 
  }
  async resetPassword(email: string): Promise<{ data: {}; error: null } | { data: null; error: any }> { 
    return await this.supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/profile' }); 
  }
  async toggleAdminStatus(userId: string, status: boolean): Promise<void> { await this.supabase.from('users').update({ is_admin: status }).eq('id', userId); }
  async toggleBanStatus(userId: string, status: boolean): Promise<void> { await this.supabase.from('users').update({ is_banned: status }).eq('id', userId); }
  async addUserTokens(userId: string, tokens: number): Promise<void> {
    const { data: user } = await this.supabase.from('users').select('tokens').eq('id', userId).single();
    if (user) await this.supabase.from('users').update({ tokens: (user.tokens || 0) + tokens }).eq('id', userId);
  }

  async getAdminStats(): Promise<{ totalRevenue: number; usersToday: number; topPackage: string; salesCount: number; chartData: { date: string; revenue: number }[] }> {
    try {
      const { count: usersToday } = await this.supabase.from('users').select('*', { count: 'exact', head: true });
      const { data: transactions } = await this.supabase.from('transactions').select('amount').eq('status', 'completed');
      const totalRevenue = transactions?.reduce((sum, tx) => sum + (tx.amount || 0), 0) || 0;
      return { totalRevenue, usersToday: usersToday || 0, topPackage: 'Professional', salesCount: transactions?.length || 0, chartData: [{ date: 'Mon', revenue: totalRevenue * 0.1 }, { date: 'Tue', revenue: totalRevenue * 0.2 }, { date: 'Wed', revenue: totalRevenue * 0.15 }, { date: 'Thu', revenue: totalRevenue * 0.25 }, { date: 'Fri', revenue: totalRevenue * 0.3 }] };
    } catch (e) { return { totalRevenue: 0, usersToday: 0, topPackage: 'N/A', salesCount: 0, chartData: [] }; }
  }

  async getActivityLogs(): Promise<ActivityLog[]> { 
    const { data } = await this.supabase.from('activity_logs').select('*').order('created_at', { ascending: false }); 
    return data || []; 
  }
  
  async createPackage(pkg: Partial<Package>): Promise<void> { await this.supabase.from('packages').insert(pkg); }
  async updatePackage(id: string, pkg: Partial<Package>): Promise<void> { await this.supabase.from('packages').update(pkg).eq('id', id); }
  async deletePackage(id: string): Promise<void> { await this.supabase.from('packages').delete().eq('id', id); }
}
