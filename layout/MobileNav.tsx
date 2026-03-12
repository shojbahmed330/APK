
import React from 'react';
import { LayoutDashboard, Code2, FolderKanban, ShoppingCart, User as UserIcon, Settings } from 'lucide-react';
import { AppMode, User } from '../types';

interface MobileNavProps {
  path: string;
  mode: AppMode;
  user?: User;
  navigateTo: (path: string, mode: AppMode) => void;
}

const MobileNav: React.FC<MobileNavProps> = ({ path, mode, user, navigateTo }) => {
  return (
    <div className="lg:hidden flex-none bg-[#09090b]/95 backdrop-blur-2xl border-t border-white/10 z-[500] pb-safe">
      <div className="flex items-center justify-around p-2">
        <button 
          onClick={() => navigateTo('/dashboard', AppMode.PREVIEW)} 
          className={`relative p-3 flex flex-col items-center gap-1 transition-all rounded-xl ${path === '/dashboard' && mode === AppMode.PREVIEW ? 'text-pink-500' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          {path === '/dashboard' && mode === AppMode.PREVIEW && <div className="absolute inset-0 bg-pink-500/10 rounded-xl"></div>}
          <LayoutDashboard size={20} className="relative z-10"/>
          <span className="text-[9px] font-bold relative z-10">Preview</span>
        </button>
        
        <button 
          onClick={() => navigateTo('/dashboard', AppMode.EDIT)} 
          className={`relative p-3 flex flex-col items-center gap-1 transition-all rounded-xl ${path === '/dashboard' && mode === AppMode.EDIT ? 'text-pink-500' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          {path === '/dashboard' && mode === AppMode.EDIT && <div className="absolute inset-0 bg-pink-500/10 rounded-xl"></div>}
          <Code2 size={20} className="relative z-10"/>
          <span className="text-[9px] font-bold relative z-10">Code</span>
        </button>

        <button 
          onClick={() => navigateTo('/projects', AppMode.PROJECTS)} 
          className={`relative p-3 flex flex-col items-center gap-1 transition-all rounded-xl ${path === '/projects' ? 'text-pink-500' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          {path === '/projects' && <div className="absolute inset-0 bg-pink-500/10 rounded-xl"></div>}
          <FolderKanban size={20} className="relative z-10"/>
          <span className="text-[9px] font-bold relative z-10">Projects</span>
        </button>

        <button 
          onClick={() => navigateTo('/shop', AppMode.SHOP)} 
          className={`relative p-3 flex flex-col items-center gap-1 transition-all rounded-xl ${path === '/shop' ? 'text-pink-500' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          {path === '/shop' && <div className="absolute inset-0 bg-pink-500/10 rounded-xl"></div>}
          <ShoppingCart size={20} className="relative z-10"/>
          <span className="text-[9px] font-bold relative z-10">Shop</span>
        </button>

        <button 
          onClick={() => navigateTo('/dashboard', AppMode.CONFIG)} 
          className={`relative p-3 flex flex-col items-center gap-1 transition-all rounded-xl ${path === '/dashboard' && mode === AppMode.CONFIG ? 'text-pink-500' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          {path === '/dashboard' && mode === AppMode.CONFIG && <div className="absolute inset-0 bg-pink-500/10 rounded-xl"></div>}
          <Settings size={20} className="relative z-10"/>
          <span className="text-[9px] font-bold relative z-10">Settings</span>
        </button>

        <button 
          onClick={() => navigateTo('/profile', AppMode.PROFILE)} 
          className={`relative p-3 flex flex-col items-center gap-1 transition-all rounded-xl ${path === '/profile' ? 'text-pink-500' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          {path === '/profile' && <div className="absolute inset-0 bg-pink-500/10 rounded-xl"></div>}
          <UserIcon size={20} className="relative z-10"/>
          <span className="text-[9px] font-bold relative z-10">Profile</span>
        </button>
      </div>
    </div>
  );
};

export default MobileNav;
