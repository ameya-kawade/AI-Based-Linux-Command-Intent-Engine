import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, 
  Shield, 
  Zap, 
  Folder, 
  Clock, 
  History, 
  Settings as SettingsIcon, 
  Sun, 
  Moon, 
  Server,
  User,
  ChevronDown,
  Check,
  ShieldAlert,
  Layers,
  Database
} from 'lucide-react';
import { 
  getUserProfiles, 
  getActiveUserProfile, 
  setActiveUserId, 
  getHistoryEntries 
} from '../services/historyStore';

export default function Header({ 
  status, 
  activeProvider, 
  onToggleProvider, 
  theme, 
  onToggleTheme,
  onOpenSettings,
  onToggleHistory,
  showHistory
}) {
  const [timeStr, setTimeStr] = useState('');
  const [profiles, setProfiles] = useState(getUserProfiles());
  const [activeUser, setActiveUser] = useState(getActiveUserProfile());
  const [userHistoryCount, setUserHistoryCount] = useState(0);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setTimeStr(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const refreshUserData = async () => {
    const currentProfiles = getUserProfiles();
    const currentActive = getActiveUserProfile();
    setProfiles(currentProfiles);
    setActiveUser(currentActive);
    try {
      const entries = await getHistoryEntries(currentActive.id);
      setUserHistoryCount(entries.length);
    } catch (e) {
      setUserHistoryCount(0);
    }
  };

  useEffect(() => {
    refreshUserData();

    const handleUserChanged = () => refreshUserData();
    const handleProfilesUpdated = () => refreshUserData();
    const handleHistoryChanged = () => refreshUserData();

    window.addEventListener('lcie-user-changed', handleUserChanged);
    window.addEventListener('lcie-profiles-updated', handleProfilesUpdated);
    window.addEventListener('lcie-history-changed', handleHistoryChanged);

    return () => {
      window.removeEventListener('lcie-user-changed', handleUserChanged);
      window.removeEventListener('lcie-profiles-updated', handleProfilesUpdated);
      window.removeEventListener('lcie-history-changed', handleHistoryChanged);
    };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const promptPath = status?.prompt_path || '~';
  const sandboxAvailable = status?.sandbox?.available ?? status?.sandbox_available ?? false;
  const dockerAvailable = status?.sandbox?.docker_available ?? status?.docker_available ?? false;
  const cmdcaliperAvailable = status?.cmdcaliper?.available ?? status?.cmdcaliper_available ?? false;
  const vectorCount = status?.cmdcaliper?.vector_count ?? status?.cmdcaliper_vectors ?? 896;
  const isGroq = activeProvider === 'groq';

  // Profile avatar color helper
  const getColorClasses = (color) => {
    switch (color) {
      case 'rose':
        return 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30';
      case 'amber':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
      case 'emerald':
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
      case 'purple':
        return 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30';
      case 'blue':
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';
      default:
        return 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30';
    }
  };

  return (
    <header className="border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-obsidian-950/80 backdrop-blur-md sticky top-0 z-40 px-4 py-2.5 transition-colors shadow-sm dark:shadow-none">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/15 to-cyan-500/20 dark:from-brand-500/20 dark:to-cyan-500/20 border border-brand-500/30 dark:border-cyan-500/30 flex items-center justify-center text-brand-600 dark:text-cyan-400 shadow-[0_0_15px_rgba(99,102,241,0.15)] dark:shadow-[0_0_15px_rgba(56,189,248,0.2)]">
            <Zap className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-1.5 font-sans">
                Linux Command Intent Engine
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded-full bg-brand-500/10 dark:bg-cyan-500/20 text-brand-600 dark:text-cyan-300 border border-brand-500/20 dark:border-cyan-500/30 font-semibold">
                  Web Edition
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              AI Pre-flight AST Safety & CmdCaliper Vector Threat Interceptor
            </p>
          </div>
        </div>

        {/* Telemetry Status Pills & Provider Toggle */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          
          {/* Quick AI Provider Toggle Button */}
          <button
            type="button"
            onClick={onToggleProvider}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-sm active:scale-95 ${
              isGroq
                ? 'bg-amber-500/10 dark:bg-amber-950/40 border-amber-500/40 dark:border-amber-500/60 text-amber-800 dark:text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)] hover:border-amber-500'
                : 'bg-brand-500/10 dark:bg-purple-950/40 border-brand-500/40 dark:border-purple-500/60 text-brand-700 dark:text-purple-300 shadow-[0_0_12px_rgba(99,102,241,0.15)] hover:border-brand-500'
            }`}
            title="Click to toggle between Groq Cloud LPU and Local Ollama"
          >
            {isGroq ? (
              <>
                <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500/30 animate-pulse" />
                <span>AI: <strong className="text-amber-900 dark:text-amber-200">Groq LPU</strong></span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 font-bold">Cloud</span>
              </>
            ) : (
              <>
                <Server className="w-3.5 h-3.5 text-brand-500 dark:text-purple-400" />
                <span>AI: <strong className="text-brand-900 dark:text-purple-200">Ollama</strong></span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-brand-500/20 text-brand-800 dark:text-purple-300 font-bold">Local</span>
              </>
            )}
          </button>

          {/* CWD pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
            <Folder className="w-3.5 h-3.5 text-brand-500 dark:text-cyan-400" />
            <span className="text-slate-400 dark:text-slate-500">CWD:</span>
            <span className="text-brand-700 dark:text-cyan-300 max-w-[130px] truncate font-medium" title={status?.current_cwd}>
              {promptPath}
            </span>
          </div>

          {/* CmdCaliper Vector Status */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${
            cmdcaliperAvailable
              ? 'bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800/60 text-cyan-800 dark:text-cyan-300'
              : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
          }`}>
            <Zap className={`w-3.5 h-3.5 ${cmdcaliperAvailable ? 'text-cyan-500 dark:text-cyan-400' : 'text-slate-400'}`} />
            <span>CmdCaliper:</span>
            <span className="font-semibold text-cyan-900 dark:text-cyan-200">
              {cmdcaliperAvailable ? `${vectorCount} Vecs` : 'Offline'}
            </span>
          </div>

          {/* Docker Sandbox status */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${
            sandboxAvailable 
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300' 
              : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
          }`}>
            <Shield className={`w-3.5 h-3.5 ${sandboxAvailable ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400'}`} />
            <span>Sandbox:</span>
            <span className="font-semibold">
              {sandboxAvailable ? (dockerAvailable ? 'Online' : 'No Docker') : 'Offline'}
            </span>
          </div>

          {/* Clock */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 text-slate-600 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{timeStr}</span>
          </div>
        </div>

        {/* Action buttons & User Profile Switcher */}
        <div className="flex items-center gap-2">
          
          {/* User Profile Quick Switcher */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/90 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-sm text-xs font-mono"
              title={`Active Profile: ${activeUser.name} (${activeUser.role})`}
            >
              <div className={`w-5 h-5 rounded-lg flex items-center justify-center border ${getColorClasses(activeUser.color)}`}>
                <User className="w-3 h-3" />
              </div>
              <span className="hidden md:inline font-semibold max-w-[110px] truncate">{activeUser.name}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-brand-500/10 dark:bg-cyan-500/20 text-brand-600 dark:text-cyan-300 font-bold">
                {userHistoryCount}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* Profile Dropdown Menu */}
            {showUserDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-2 animate-fadeIn">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/80 mb-1">
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                    Switch Active User Profile
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    History and audits are isolated per profile
                  </p>
                </div>

                <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
                  {profiles.map((p) => {
                    const isSelected = p.id === activeUser.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setActiveUserId(p.id);
                          setShowUserDropdown(false);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-colors text-xs ${
                          isSelected
                            ? 'bg-brand-50 dark:bg-cyan-950/40 border border-brand-200 dark:border-cyan-800 text-brand-900 dark:text-cyan-200'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center border ${getColorClasses(p.color)}`}>
                            <User className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="font-semibold">{p.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{p.role}</div>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-brand-600 dark:text-cyan-400" />}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 mt-1 border-t border-slate-100 dark:border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      onOpenSettings();
                    }}
                    className="w-full text-center py-1.5 text-xs text-brand-600 dark:text-cyan-400 hover:underline font-semibold flex items-center justify-center gap-1"
                  >
                    <SettingsIcon className="w-3 h-3" />
                    <span>Manage Profiles & Storage</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shadow-sm active:scale-95"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400 animate-spin-once" />
            ) : (
              <Moon className="w-4 h-4 text-brand-600" />
            )}
          </button>

          {/* History Toggle */}
          <button
            onClick={onToggleHistory}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              showHistory
                ? 'bg-brand-500/15 dark:bg-cyan-500/20 text-brand-700 dark:text-cyan-300 border border-brand-500/30 dark:border-cyan-500/40 shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
            title="Toggle Command History Drawer"
          >
            <History className="w-3.5 h-3.5" />
            <span>History</span>
          </button>

          {/* Settings Modal */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all hover:text-slate-900 dark:hover:text-white"
            title="Configure AI Engine, Storage & Profiles"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>

      </div>
    </header>
  );
}
