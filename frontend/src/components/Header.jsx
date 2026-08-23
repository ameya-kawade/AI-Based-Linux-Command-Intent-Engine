import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Terminal, 
  Cpu, 
  Clock, 
  Settings as SettingsIcon, 
  History, 
  Folder, 
  Server, 
  Zap, 
  Sparkles, 
  Layers,
  Sun,
  Moon
} from 'lucide-react';

export default function Header({ 
  status, 
  activeProvider,
  onToggleProvider,
  theme = 'dark',
  onToggleTheme,
  onOpenSettings, 
  onToggleHistory, 
  showHistory 
}) {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString());
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const providerStatus = status?.provider_status || 'Pipeline: SafeCmd + CmdCaliper + Explainshell';
  const promptPath = status?.prompt_path || '~';
  const sandboxAvailable = status?.sandbox?.available;
  const dockerAvailable = status?.sandbox?.docker_available;
  const cmdcaliperAvailable = status?.cmdcaliper?.available;
  const vectorCount = status?.cmdcaliper?.vector_count || 0;

  const isGroq = activeProvider === 'groq' || (!activeProvider && providerStatus.includes('Groq'));

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

        {/* Action buttons & Theme Toggle */}
        <div className="flex items-center gap-2">
          
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
            title="Toggle Command History"
          >
            <History className="w-3.5 h-3.5" />
            <span>History</span>
          </button>

          {/* Settings Modal */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all hover:text-slate-900 dark:hover:text-white"
            title="Configure AI Engine & API Keys"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>

      </div>
    </header>
  );
}
