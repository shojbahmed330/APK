
import React from 'react';
import { AppMode, Project, User } from '../types';
import LandingPage from '../landing/LandingPage';
import ScanPage from '../biometric/ScanPage';
import AuthPage from '../auth/AuthPage';
import AdminLoginPage from '../auth/AdminLoginPage';
import AdminPanel from '../admin/AdminPanel';
import ShopView from '../shop/ShopView';
import ProfileView from '../profile/ProfileView';
import DashboardView from '../dashboard/DashboardView';
import ProjectsView from '../projects/ProjectsView';
import GithubSettingsView from '../settings/GithubSettingsView';
import LivePreviewView from '../preview/LivePreviewView';
import HelpCenterView from '../help/HelpCenterView';
import AuthenticatedLayout from '../layout/AuthenticatedLayout';
import { DatabaseService } from '../services/dbService';

interface AppRouterProps {
  path: string;
  mode: AppMode;
  setMode: (m: AppMode) => void;
  user: User | null;
  setUser: (u: User | null) => void;
  showScan: boolean;
  setShowScan: (b: boolean) => void;
  handleLogout: () => void;
  logic: any;
  payment: any;
  liveProject: Project | null;
  liveLoading: boolean;
  navigateTo: (path: string, mode?: AppMode) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

const getDefaultHtml = (appName: string) => `<div class="w-full h-full flex flex-col items-center justify-center p-8 bg-[#09090b] text-center space-y-8 relative overflow-hidden min-h-screen">
  <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] bg-[conic-gradient(from_90deg_at_50%_50%,#00000000_50%,#ec4899_100%)] opacity-20 animate-[spin_4s_linear_infinite] blur-3xl"></div>
  <div class="absolute inset-0 bg-[#09090b]/80 backdrop-blur-sm"></div>
  <div class="relative z-10 flex flex-col items-center justify-center space-y-6">
    <div class="relative group">
      <div class="absolute -inset-4 bg-pink-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
      <div class="w-24 h-24 rounded-3xl border border-white/10 bg-black/50 backdrop-blur-md flex items-center justify-center shadow-2xl relative overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-br from-pink-500/20 to-transparent"></div>
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-pink-500 relative z-10 animate-pulse"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>
      </div>
    </div>
    <div class="space-y-2">
      <h2 class="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-pink-200 to-white uppercase tracking-widest animate-pulse">${appName}</h2>
      <div class="flex items-center justify-center gap-2">
        <span class="w-2 h-2 rounded-full bg-pink-500 animate-ping"></span>
        <p class="text-[10px] font-bold text-pink-500/80 uppercase tracking-[0.4em]">Ready to Build</p>
      </div>
    </div>
  </div>
</div>`;

const AppRouter: React.FC<AppRouterProps> = ({
  path, mode, setMode, user, setUser, showScan, setShowScan, handleLogout,
  logic, payment, liveProject, liveLoading, navigateTo, fileInputRef
}) => {
  const db = DatabaseService.getInstance();

  // 1. Live Preview Route
  if (path.startsWith('/preview/')) {
    return (
      <LivePreviewView 
        project={liveProject} 
        loading={liveLoading} 
        onReturnToTerminal={() => navigateTo('/login')} 
      />
    );
  }

  // 2. Admin Route
  if (path === '/admin') {
    if (!user || !user.isAdmin) {
      return <AdminLoginPage onLoginSuccess={(u) => { setUser(u); navigateTo('/admin', AppMode.ADMIN); }} />;
    }
    return (
      <AuthenticatedLayout user={user} path={path} mode={mode} navigateTo={navigateTo}>
        <AdminPanel 
          user={user} 
          onApprovePayment={payment.handleApprovePayment} 
          onRejectPayment={payment.handleRejectPayment} 
        />
      </AuthenticatedLayout>
    );
  }

  // 3. Unauthenticated Routes
  if (!user) {
    if (path === '/login') {
      return showScan ? (
        <ScanPage onFinish={() => setShowScan(false)} />
      ) : (
        <AuthPage onLoginSuccess={(u) => { setUser(u); navigateTo('/dashboard', AppMode.PREVIEW); }} />
      );
    }
    return <LandingPage onGetStarted={() => navigateTo('/login')} />;
  }

  // 4. Authenticated Application Shell
  return (
    <AuthenticatedLayout user={user} path={path} mode={mode} navigateTo={navigateTo}>
      {mode === AppMode.HELP ? (
        <HelpCenterView onBack={() => setMode(AppMode.PREVIEW)} />
      ) : mode === AppMode.SETTINGS ? (
        <GithubSettingsView 
          config={logic.githubConfig} 
          onSave={(c) => { logic.setGithubConfig(c); db.updateGithubConfig(user.id, c); }} 
          onBack={() => setMode(AppMode.PREVIEW)} 
          onDisconnect={async () => {
            if (window.confirm("গিটহাব ডিসকানেক্ট করতে চান?")) {
              await db.unlinkGithubIdentity();
              const empty = { token: '', owner: '', repo: '' };
              logic.setGithubConfig(empty);
              db.updateGithubConfig(user.id, empty);
            }
          }} 
        />
      ) : path === '/shop' ? (
        <ShopView {...payment} handlePaymentScreenshotUpload={() => fileInputRef.current?.click()} />
      ) : path === '/profile' ? (
        <ProfileView 
          user={user} userTransactions={payment.userTransactions} githubConfig={logic.githubConfig} 
          navigateTo={navigateTo} handleLogout={handleLogout}
          oldPassword={""} setOldPassword={() => {}} newPass={""} setNewPass={() => {}} passError={""} 
          isUpdatingPass={false} handlePasswordChange={() => {}} handleAvatarUpload={() => {}}
          onSaveGithubConfig={(c) => { logic.setGithubConfig(c); db.updateGithubConfig(user.id, c); }}
          clearGithubConfig={() => {}}
        />
      ) : path === '/projects' ? (
        <ProjectsView 
          userId={user.id} 
          currentFiles={logic.projectFiles} 
          onLoadProject={(p) => { logic.loadProject(p); navigateTo('/dashboard', AppMode.PREVIEW); }} 
          onSaveCurrent={(n) => db.saveProject(user.id, n, logic.projectFiles, logic.projectConfig)} 
          onCreateNew={(n) => db.saveProject(user.id, n, { 'index.html': getDefaultHtml(n) }, { appName: n, packageName: 'com.' + n.toLowerCase() })} 
        />
      ) : (
        <DashboardView 
          {...logic} mode={mode} setMode={setMode} 
          handleBuildAPK={() => { 
            logic.handleBuildAPK(() => navigateTo('/dashboard', AppMode.SETTINGS)); 
            if (logic.githubConfig.token.length > 10) setMode(AppMode.EDIT); 
          }} 
          projectId={logic.currentProjectId}
        />
      )}
    </AuthenticatedLayout>
  );
};

export default AppRouter;
