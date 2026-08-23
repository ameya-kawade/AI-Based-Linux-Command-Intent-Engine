import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { 
  Square, 
  Trash2, 
  Copy, 
  Check, 
  Terminal as TerminalIcon, 
  Shield, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertOctagon,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

export default function TerminalStream({
  outputChunks = [],
  isExecuting,
  executionResult,
  target = 'host',
  theme = 'dark',
  onAbort,
}) {
  const terminalRef = useRef(null);
  const xtermInstance = useRef(null);
  const fitAddonRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [showTraceeAlerts, setShowTraceeAlerts] = useState(false);

  // Initialize xterm.js instance
  useEffect(() => {
    if (!terminalRef.current) return;

    const termTheme = theme === 'dark' ? {
      background: '#030712',
      foreground: '#f8fafc',
      cursor: '#38bdf8',
      selectionBackground: 'rgba(56, 189, 248, 0.3)',
      black: '#0f172a',
      red: '#f43f5e',
      green: '#10b981',
      yellow: '#f59e0b',
      blue: '#38bdf8',
      magenta: '#c084fc',
      cyan: '#22d3ee',
      white: '#f8fafc',
      brightBlack: '#475569',
      brightRed: '#fb7185',
      brightGreen: '#34d399',
      brightYellow: '#fbbf24',
      brightBlue: '#60a5fa',
      brightMagenta: '#e879f9',
      brightCyan: '#67e8f9',
      brightWhite: '#ffffff',
    } : {
      background: '#0f172a',
      foreground: '#f8fafc',
      cursor: '#6366f1',
      selectionBackground: 'rgba(99, 102, 241, 0.3)',
      black: '#020617',
      red: '#ef4444',
      green: '#22c55e',
      yellow: '#f59e0b',
      blue: '#6366f1',
      magenta: '#a855f7',
      cyan: '#06b6d4',
      white: '#f8fafc',
      brightBlack: '#64748b',
      brightRed: '#f87171',
      brightGreen: '#4ade80',
      brightYellow: '#fde047',
      brightBlue: '#818cf8',
      brightMagenta: '#c084fc',
      brightCyan: '#22d3ee',
      brightWhite: '#ffffff',
    };

    const term = new Terminal({
      theme: termTheme,
      fontFamily: '"JetBrains Mono", Menlo, Monaco, monospace',
      fontSize: 13,
      lineHeight: 1.35,
      cursorBlink: isExecuting,
      convertEol: true,
      disableStdin: true,
      rows: 14,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermInstance.current = term;
    fitAddonRef.current = fitAddon;

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, [theme]);

  // Write new chunks to terminal
  useEffect(() => {
    if (xtermInstance.current && outputChunks.length > 0) {
      const lastChunk = outputChunks[outputChunks.length - 1];
      if (lastChunk) {
        xtermInstance.current.write(lastChunk);
      }
    }
  }, [outputChunks]);

  const handleClear = () => {
    xtermInstance.current?.clear();
  };

  const handleCopy = () => {
    const fullText = outputChunks.join('');
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const traceeAlerts = executionResult?.tracee_alerts || [];

  return (
    <div className="w-full rounded-2xl overflow-hidden my-4 border border-slate-200 dark:border-slate-800 shadow-xl transition-all">
      
      {/* Terminal Titlebar */}
      <div className="bg-slate-100 dark:bg-obsidian-900/90 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-rose-500 border border-rose-600" />
            <div className="w-3 h-3 rounded-full bg-amber-500 border border-amber-600" />
            <div className="w-3 h-3 rounded-full bg-emerald-500 border border-emerald-600" />
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-700 dark:text-slate-300 ml-2">
            <TerminalIcon className="w-3.5 h-3.5 text-brand-600 dark:text-cyan-400" />
            <span className="font-semibold">Terminal Output</span>
            <span className="text-slate-400 dark:text-slate-600">|</span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-bold border ${
              target === 'sandbox' 
                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800' 
                : 'bg-brand-100 dark:bg-cyan-950 text-brand-800 dark:text-cyan-300 border-brand-300 dark:border-cyan-800'
            }`}>
              {target === 'sandbox' ? 'Docker Sandbox (eBPF Tracee)' : 'Local Host'}
            </span>
          </div>
        </div>

        {/* Status & Control buttons */}
        <div className="flex items-center gap-2 text-xs font-mono">
          {isExecuting ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-brand-600 dark:text-cyan-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-brand-500 dark:bg-cyan-400 animate-ping" />
                Executing...
              </span>
              <button
                onClick={onAbort}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1 shadow-md shadow-rose-600/30 transition-colors"
                title="Send SIGINT / SIGKILL"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Abort (Ctrl+C)</span>
              </button>
            </div>
          ) : executionResult ? (
            <div className="flex items-center gap-2">
              {/* Exit Code */}
              <div className={`px-2.5 py-0.5 rounded-lg border flex items-center gap-1 text-[11px] font-bold ${
                executionResult.exit_code === 0
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800/80'
                  : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800/80'
              }`}>
                {executionResult.exit_code === 0 ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <XCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                )}
                <span>Exit {executionResult.exit_code} ({executionResult.status})</span>
              </div>

              {/* Execution Duration */}
              {executionResult.duration_ms !== undefined && (
                <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px]">
                  <Clock className="w-3 h-3 text-brand-600 dark:text-cyan-400" />
                  <span>{executionResult.duration_ms} ms</span>
                </div>
              )}
            </div>
          ) : null}

          {/* Clear & Copy */}
          <button
            onClick={handleClear}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors border border-transparent hover:border-slate-300 dark:hover:border-slate-700"
            title="Clear terminal"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors border border-transparent hover:border-slate-300 dark:hover:border-slate-700"
            title="Copy terminal output"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Terminal View */}
      <div className="p-3 bg-[#0f172a] dark:bg-obsidian-950">
        <div ref={terminalRef} className="w-full" />
      </div>

      {/* Tracee eBPF Alerts breakdown (for sandbox execution) */}
      {traceeAlerts.length > 0 && (
        <div className="bg-slate-50 dark:bg-obsidian-900/90 border-t border-slate-200 dark:border-slate-800 p-3.5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-mono">
              <Shield className="w-4 h-4" />
              <span>Tracee eBPF Kernel Events ({traceeAlerts.length} Events)</span>
            </div>
            <button
              onClick={() => setShowTraceeAlerts(!showTraceeAlerts)}
              className="text-xs text-brand-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-mono"
            >
              {showTraceeAlerts ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>{showTraceeAlerts ? 'Hide Telemetry' : 'View Syscalls'}</span>
            </button>
          </div>

          {showTraceeAlerts && (
            <div className="max-h-60 overflow-y-auto space-y-1.5 mt-2 font-mono text-xs">
              {traceeAlerts.map((alert, idx) => (
                <div key={idx} className="bg-white dark:bg-obsidian-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2 shadow-sm">
                  <div>
                    <span className="text-brand-700 dark:text-cyan-400 font-bold">[{alert.event_name || 'syscall'}] </span>
                    <span className="text-slate-800 dark:text-slate-300">{alert.description || JSON.stringify(alert.details)}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    alert.severity === 'CRITICAL' || alert.severity === 'HIGH'
                      ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400'
                  }`}>
                    {alert.severity || 'INFO'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
