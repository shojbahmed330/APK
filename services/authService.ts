
import { supabase, PRIMARY_ADMIN, MASTER_USER_ID } from './supabaseClient';
import { User, GithubConfig } from '../types';
import { AuthChangeEvent, Session, User as SupabaseUser, Provider, AuthResponse, OAuthResponse } from '@supabase/supabase-js';

export const authService = {
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): { data: { subscription: { unsubscribe: () => void } } } {
    return supabase.auth.onAuthStateChange(callback);
  },

  async getCurrentSession(): Promise<Session | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  async signIn(email: string, password: string): Promise<AuthResponse> {
    const cleanEmail = email.trim().toLowerCase();
    return await supabase.auth.signInWithPassword({ email: cleanEmail, password });
  },

  async signInWithOAuth(provider: Provider): Promise<OAuthResponse> {
    return await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin + '/profile',
        queryParams: { access_type: 'offline', prompt: 'select_account' },
        scopes: provider === 'github' ? 'repo workflow' : undefined
      }
    });
  },

  async getUser(email: string, id?: string): Promise<User | null> {
    try {
      let { data: userRecord } = await supabase
        .from('users')
        .select('*')
        .eq(id ? 'id' : 'email', id || email.trim().toLowerCase())
        .maybeSingle();

      if (!userRecord && email.trim().toLowerCase() === PRIMARY_ADMIN) {
        return {
          id: id || MASTER_USER_ID, email: PRIMARY_ADMIN, name: 'ROOT ADMIN',
          avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=admin`,
          tokens: 9999, isLoggedIn: true, joinedAt: Date.now(), isAdmin: true, is_verified: true
        };
      }

      if (!userRecord) return null;

      return {
        ...userRecord, isLoggedIn: true,
        joinedAt: new Date(userRecord.created_at).getTime(),
        isAdmin: userRecord.is_admin || false
      };
    } catch (e) { return null; }
  },

  async updateGithubConfig(userId: string, config: GithubConfig): Promise<void> {
    await supabase.from('users').update({ 
      github_token: config.token, github_owner: config.owner, github_repo: config.repo 
    }).eq('id', userId);
  },

  async updateGithubTokenOnly(userId: string, token: string): Promise<void> {
    if (token && token.length > 10) {
      await supabase.from('users').update({ github_token: token }).eq('id', userId);
    }
  },

  async linkGithubIdentity(): Promise<OAuthResponse> {
    const session = await this.getCurrentSession();
    if (!session) throw new Error("আপনার সেশন পাওয়া যাচ্ছে না।");
    const res = await supabase.auth.linkIdentity({
      provider: 'github',
      options: {
        redirectTo: window.location.origin + '/profile',
        queryParams: { prompt: 'select_account' },
        scopes: 'repo workflow'
      }
    });
    if (res.error) throw res.error;
    return res;
  },

  async unlinkGithubIdentity(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const githubIdentity = user.identities?.find((id) => id.provider === 'github');
    if (githubIdentity) {
      const { error } = await supabase.auth.unlinkIdentity(githubIdentity);
      if (error) throw error;
    }
  },

  async signUp(email: string, password: string, name?: string): Promise<AuthResponse> {
    return await supabase.auth.signUp({ 
      email, password, options: { data: { full_name: name } } 
    });
  },

  async signOut(): Promise<void> {
    localStorage.removeItem('active_project_id');
    await supabase.auth.signOut();
  }
};
