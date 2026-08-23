import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, 
  Sparkles, 
  RotateCcw, 
  SlidersHorizontal, 
  ChevronDown, 
  Code2, 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  Info, 
  FileCode, 
  Paperclip, 
  Edit3, 
  Trash2,
  Zap,
  Play,
  X,
  CornerDownLeft,
  Search
} from 'lucide-react';
import ScriptUploadModal from './ScriptUploadModal';
import { SAMPLE_MALICIOUS_SCRIPT, SAMPLE_BENIGN_SCRIPT } from '../utils/sampleScripts';

export default function CommandInput({
  command,
  setCommand,
  onAnalyze,
  isAnalyzing,
  presets = [],
  onSelectPreset,
  promptPath,
  attachedScript,
  setAttachedScript,
}) {
  const [isMultiline, setIsMultiline] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [detectedScriptName, setDetectedScriptName] = useState(null);
  const inputRef = useRef(null);
  const presetsRef = useRef(null);

  // Close presets dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (presetsRef.current && !presetsRef.current.contains(event.target)) {
        setShowPresets(false);
      }
    };
    if (showPresets) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPresets]);

  // Global Ctrl+K / Cmd+K shortcut to focus input
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Real-time detection of script references in the command string
  useEffect(() => {
    if (!command) {
      setDetectedScriptName(null);
      setAttachedScript(null);
      return;
    }
    const scriptRegex = /(?:^|[;&|]\s*)(?:bash|sh|zsh|dash|source|\.)\s+['"]?([^\s;&|'"]+\.(?:sh|bash|py|pl|rb))['"]?|(?:^|[;&|]\s*)\.?\/([^\s;&|'"]+\.(?:sh|bash|py))/i;
    const match = command.match(scriptRegex);
    if (match) {
      const fullPath = match[1] || match[2] || '';
      const baseName = fullPath.split('/').pop();
      setDetectedScriptName(baseName);
      if (attachedScript && attachedScript.name !== baseName) {
        setAttachedScript(prev => prev ? { ...prev, name: baseName } : null);
      }
    } else {
      setDetectedScriptName(null);
      if (attachedScript) {
        setAttachedScript(null);
      }
    }
  }, [command]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (!isMultiline) {
        e.preventDefault();
        onAnalyze(command, attachedScript);
      }
    } else if (e.key === 'Escape') {
      setShowPresets(false);
    }
  };

  const loadPresetScript = (type, autoRun = false) => {
    const sName = detectedScriptName || (type === 'malicious' ? 'deploy_exploit.sh' : 'build_bundle.sh');
    const sContent = type === 'malicious' ? SAMPLE_MALICIOUS_SCRIPT : SAMPLE_BENIGN_SCRIPT;
    const scriptObj = {
      name: sName,
      content: sContent
    };
    setAttachedScript(scriptObj);
    if (autoRun) {
      onAnalyze(command, scriptObj);
    }
  };

  const getRiskBadge = (risk) => {
    switch (risk) {
      case 'CRITICAL':
        return 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800';
      case 'CAUTION':
        return 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800';
      default:
        return 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
    }
  };

  const getRiskIcon = (risk) => {
    switch (risk) {
      case 'CRITICAL':
        return <ShieldAlert className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />;
      case 'CAUTION':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />;
      default:
        return <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
    }
  };

  // Additional script test presets
  const scriptPresets = [
    {
      title: '🚨 Script Test: Malicious Reverse Shell',
      command: 'bash deploy_exploit.sh',
      expected_risk: 'CRITICAL',
      scriptType: 'malicious',
      scriptName: 'deploy_exploit.sh'
    },
    {
      title: '🛡️ Script Test: Benign Build Routine',
      command: 'bash build_bundle.sh',
      expected_risk: 'SAFE',
      scriptType: 'benign',
      scriptName: 'build_bundle.sh'
    }
  ];

  return (
    <div className="relative z-20">
      <div className="rounded-2xl p-4 sm:p-5 shadow-lg dark:shadow-2xl border border-slate-200 dark:border-slate-700/60 bg-white/90 dark:bg-gradient-to-b dark:from-obsidian-900/90 dark:to-obsidian-950/95 backdrop-blur-xl transition-all">
        
        {/* Top Controls Bar */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
            <div className="p-1 rounded-lg bg-brand-500/10 dark:bg-cyan-500/10 text-brand-600 dark:text-cyan-400">
              <Terminal className="w-4 h-4" />
            </div>
            <span className="text-slate-800 dark:text-slate-200 font-semibold font-sans">Command Terminal</span>
            {promptPath && (
              <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 text-[11px] border border-slate-200 dark:border-slate-700 truncate max-w-xs font-mono">
                {promptPath}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Attach Script Button */}
            <button
              type="button"
              onClick={() => setShowScriptModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all border ${
                attachedScript
                  ? 'bg-brand-500/15 dark:bg-indigo-500/20 text-brand-700 dark:text-indigo-300 border-brand-500/30 dark:border-indigo-500/40 shadow-sm font-semibold'
                  : detectedScriptName
                  ? 'bg-amber-500/15 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30 dark:border-amber-500/40 animate-pulse font-medium'
                  : 'bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
              title="Attach bash/shell script for Tracee eBPF Sandbox analysis"
            >
              <FileCode className="w-3.5 h-3.5 text-brand-600 dark:text-indigo-400" />
              <span>{attachedScript ? `Script: ${attachedScript.name}` : 'Attach Script'}</span>
            </button>

            {/* Presets dropdown toggle */}
            <div className="relative" ref={presetsRef}>
              <button
                type="button"
                onClick={() => setShowPresets(!showPresets)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs transition-all border border-slate-200 dark:border-slate-700 shadow-sm"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-brand-600 dark:text-cyan-400" />
                <span>Presets</span>
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showPresets ? 'rotate-180' : ''}`} />
              </button>

              {/* Presets Dropdown */}
              {showPresets && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-obsidian-950 border border-slate-200 dark:border-slate-700 shadow-2xl p-2 z-50 animate-fadeIn custom-scrollbar max-h-96 overflow-y-auto">
                  <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span>Sample Test Commands</span>
                    <span className="text-brand-600 dark:text-cyan-400">1-Click Load</span>
                  </div>

                  {/* Script Test Presets Section */}
                  <div className="my-1.5 p-1.5 rounded-xl bg-brand-50/70 dark:bg-indigo-950/30 border border-brand-100 dark:border-indigo-900/40 space-y-1">
                    <div className="text-[10px] font-mono text-brand-700 dark:text-indigo-300 font-bold px-1 uppercase tracking-wider flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                      <span>Script eBPF Sandbox Demos</span>
                    </div>
                    {scriptPresets.map((sp, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const scriptObj = {
                            name: sp.scriptName,
                            content: sp.scriptType === 'malicious' ? SAMPLE_MALICIOUS_SCRIPT : SAMPLE_BENIGN_SCRIPT
                          };
                          setCommand(sp.command);
                          setAttachedScript(scriptObj);
                          setShowPresets(false);
                          onAnalyze(sp.command, scriptObj);
                        }}
                        className="w-full text-left p-2 rounded-lg hover:bg-brand-100/60 dark:hover:bg-indigo-900/40 transition-colors flex items-center justify-between gap-2 border border-transparent hover:border-brand-200 dark:hover:border-indigo-800/60 group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-800 dark:text-indigo-200 truncate">{sp.title}</div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate group-hover:text-brand-700 dark:group-hover:text-indigo-300">
                            $ {sp.command}
                          </div>
                        </div>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${getRiskBadge(sp.expected_risk)} font-bold shrink-0`}>
                          {sp.expected_risk}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Standard Presets */}
                  <div className="space-y-1">
                    {presets.map((preset, idx) => {
                      const cmdText = preset.command || preset.cmd || "";
                      const titleText = preset.title || preset.label || cmdText;
                      const riskLevel = preset.expected_risk || "SAFE";
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setShowPresets(false);
                            onSelectPreset(cmdText);
                          }}
                          className="w-full text-left p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors flex items-center justify-between gap-2 border border-transparent hover:border-slate-200 dark:hover:border-slate-700/80 group"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                              {getRiskIcon(riskLevel)}
                              <span className="font-semibold">{titleText}</span>
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate group-hover:text-brand-600 dark:group-hover:text-cyan-300">
                              $ {cmdText}
                            </div>
                          </div>
                          {riskLevel && (
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${getRiskBadge(riskLevel)} font-bold shrink-0`}>
                              {riskLevel}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Toggle Multiline */}
            <button
              type="button"
              onClick={() => setIsMultiline(!isMultiline)}
              className={`p-2 rounded-xl text-xs transition-colors border ${
                isMultiline
                  ? 'bg-brand-500/15 dark:bg-cyan-500/20 text-brand-700 dark:text-cyan-300 border-brand-500/30 dark:border-cyan-500/40'
                  : 'bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}
              title="Toggle multiline script editor"
            >
              <Code2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Command Input Area */}
        <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
          <div className="relative flex-1">
            {isMultiline ? (
              <textarea
                ref={inputRef}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. bash deploy.sh or nc -lvnp 4444 or rm -rf /tmp/cache"
                rows={3}
                className="w-full bg-slate-50 dark:bg-obsidian-950/90 border border-slate-300 dark:border-slate-700 focus:border-brand-500 dark:focus:border-cyan-400 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-cyan-400/20 rounded-xl px-4 py-3 font-mono text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none resize-none transition-all shadow-inner"
              />
            ) : (
              <div className="relative flex items-center">
                <input
                  ref={inputRef}
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. tar -czvf backup.tar.gz /var/log or nc -lvnp 4444 or rm -rf /tmp/cache"
                  className="w-full bg-slate-50 dark:bg-obsidian-950/90 border border-slate-300 dark:border-slate-700 focus:border-brand-500 dark:focus:border-cyan-400 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-cyan-400/20 rounded-xl pl-4 pr-10 py-3 font-mono text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition-all shadow-inner"
                />
                {command && (
                  <button
                    type="button"
                    onClick={() => {
                      setCommand('');
                      setAttachedScript(null);
                      inputRef.current?.focus();
                    }}
                    className="absolute right-3 p-1 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                    title="Clear input"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onAnalyze(command, attachedScript)}
            disabled={!command.trim() || isAnalyzing}
            className={`px-5 sm:px-7 py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md select-none whitespace-nowrap ${
              !command.trim() || isAnalyzing
                ? 'bg-slate-200 dark:bg-slate-800/80 text-black/60 dark:text-slate-500 cursor-not-allowed border border-slate-300 dark:border-slate-700'
                : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 dark:border-transparent dark:bg-gradient-to-r dark:from-cyan-500 dark:to-blue-600 dark:hover:from-cyan-400 dark:hover:to-blue-500 text-black dark:text-white shadow-sm dark:shadow-cyan-500/25 active:scale-[0.98]'
            }`}
          >
            {isAnalyzing ? (
              <>
                <div className="w-4 h-4 border-2 border-black/30 dark:border-white/30 border-t-black dark:border-t-white rounded-full animate-spin" />
                <span className="text-black dark:text-white">Inspecting Intent...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-black dark:text-white" />
                <span className="text-black dark:text-white font-bold">Pre-flight Check</span>
                <CornerDownLeft className="w-3.5 h-3.5 opacity-60 ml-0.5 hidden sm:inline-block text-black dark:text-white" />
              </>
            )}
          </button>
        </div>

        {/* Attached Script Bar */}
        {attachedScript ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-brand-50/80 dark:bg-indigo-950/40 border border-brand-200 dark:border-indigo-800/60 text-xs">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-lg bg-brand-500/20 text-brand-600 dark:text-indigo-400">
                <Paperclip className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-slate-600 dark:text-zinc-400">Attached Script: </span>
                <strong className="font-mono text-brand-700 dark:text-indigo-300 font-bold">{attachedScript.name}</strong>
                <span className="text-slate-500 dark:text-zinc-500 text-[11px] ml-1.5">({attachedScript.content.length} bytes)</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Quick Switch payload buttons */}
              <button
                type="button"
                onClick={() => loadPresetScript('malicious')}
                className="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-950/60 hover:bg-rose-200 dark:hover:bg-rose-900/70 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800/80 text-[11px] font-medium transition-colors flex items-center gap-1"
                title="Switch attached content to malicious test payload"
              >
                <ShieldAlert className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                <span>Set Malicious</span>
              </button>
              <button
                type="button"
                onClick={() => loadPresetScript('benign')}
                className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 hover:bg-emerald-200 dark:hover:bg-emerald-900/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/80 text-[11px] font-medium transition-colors flex items-center gap-1"
                title="Switch attached content to benign test payload"
              >
                <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>Set Benign</span>
              </button>
              <button
                type="button"
                onClick={() => setShowScriptModal(true)}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-brand-600 dark:text-indigo-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                title="Edit script content in modal"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setAttachedScript(null)}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                title="Remove attached script"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : detectedScriptName ? (
          /* Real-time Script Detected Smart Pill with 1-click Test Buttons */
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                Script detected: <strong className="font-mono text-slate-900 dark:text-zinc-100 font-bold">{detectedScriptName}</strong>
              </span>
            </div>
            
            {/* Quick Test Script Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadPresetScript('malicious', true)}
                className="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-950/80 hover:bg-rose-200 dark:hover:bg-rose-900 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700/80 text-[11px] font-semibold transition-all shadow-sm flex items-center gap-1"
                title="Load malicious sample script and run pre-flight check immediately"
              >
                <ShieldAlert className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                <span>Test Malicious</span>
              </button>
              <button
                type="button"
                onClick={() => loadPresetScript('benign', true)}
                className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 hover:bg-emerald-200 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/80 text-[11px] font-semibold transition-all shadow-sm flex items-center gap-1"
                title="Load benign sample script and run pre-flight check immediately"
              >
                <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>Test Benign</span>
              </button>
              <button
                type="button"
                onClick={() => setShowScriptModal(true)}
                className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-500/20 hover:bg-amber-200 dark:hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-500/40 text-[11px] font-medium transition-colors"
                title="Upload or paste custom script code"
              >
                Custom Script...
              </button>
            </div>
          </div>
        ) : null}

        {/* Helpful Keyboard Hint */}
        <div className="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span>Press <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono">Enter</kbd> to inspect</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline"><kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono">Ctrl+K</kbd> to focus</span>
          </span>
          <span className="hidden sm:inline text-slate-400 dark:text-slate-500">
            SafeCmd AST • CmdCaliper Vectors • Explainshell • Tracee eBPF • AI
          </span>
        </div>

      </div>

      {/* Script Upload & Editor Modal */}
      <ScriptUploadModal
        isOpen={showScriptModal}
        onClose={() => setShowScriptModal(false)}
        onAttach={(scriptObj) => setAttachedScript(scriptObj)}
        detectedScriptName={detectedScriptName || ''}
        initialScriptContent={attachedScript?.content || ''}
        onRunAnalysisDirectly={(scriptObj) => {
          onAnalyze(command, scriptObj);
        }}
      />
    </div>
  );
}
