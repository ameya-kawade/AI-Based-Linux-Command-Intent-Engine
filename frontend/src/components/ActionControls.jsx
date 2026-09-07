import React, { useState } from 'react';
import { 
  Shield, 
  Edit3, 
  X, 
  AlertTriangle, 
  AlertOctagon,
  CheckCircle2,
  Ban
} from 'lucide-react';

export default function ActionControls({
  analysis,
  onExecuteSandbox,
  onEdit,
  onCancel,
  isExecuting,
  sandboxAvailable,
}) {
  const [showCriticalConfirm, setShowCriticalConfirm] = useState(false);

  if (!analysis) return null;

  const isCritical = analysis.risk_level === 'CRITICAL';
  const isHigh = analysis.risk_level === 'HIGH';
  const executionDecision = analysis.execution_decision ?? null;

  // Determine if sandbox execution should be blocked
  const isBlocked = executionDecision === 'BLOCK' || isCritical || isHigh;

  const handleSandboxTrigger = () => {
    if (isBlocked) {
      setShowCriticalConfirm(true);
    } else {
      onExecuteSandbox();
    }
  };

  const handleConfirmCritical = () => {
    setShowCriticalConfirm(false);
    onExecuteSandbox();
  };

  const getDecisionBadge = () => {
    if (executionDecision === 'BLOCK' || isCritical || isHigh) {
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/50 text-[10px] font-bold font-mono tracking-wider">
          <Ban className="w-3 h-3" />
          <span>BLOCK</span>
        </div>
      );
    }
    if (executionDecision === 'CONFIRM' || analysis.risk_level === 'CAUTION') {
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/50 text-[10px] font-bold font-mono tracking-wider">
          <AlertTriangle className="w-3 h-3" />
          <span>CONFIRM</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/50 text-[10px] font-bold font-mono tracking-wider">
        <CheckCircle2 className="w-3 h-3" />
        <span>ALLOW</span>
      </div>
    );
  };

  return (
    <>
      <div className="w-full rounded-2xl p-4 my-3 border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-obsidian-900/90 flex flex-wrap items-center justify-between gap-3 shadow-md dark:shadow-xl backdrop-blur-xl transition-all">
        
        {/* Left Status — Execution Decision Badge */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-500 dark:text-slate-400 font-medium">Execution Decision:</span>
          {getDecisionBadge()}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          
          {/* Cancel */}
          <button
            onClick={onCancel}
            disabled={isExecuting}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </button>

          {/* Edit */}
          <button
            onClick={onEdit}
            disabled={isExecuting}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Edit3 className="w-3.5 h-3.5 text-brand-600 dark:text-cyan-400" />
            <span>Edit</span>
          </button>

          {/* Docker Sandbox Run — Single Secure Execution Path */}
          <button
            onClick={handleSandboxTrigger}
            disabled={isExecuting || !sandboxAvailable}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md ${
              !sandboxAvailable
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-300 dark:border-slate-700 cursor-not-allowed'
                : isBlocked
                ? 'bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white shadow-rose-500/20'
                : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-500/20 active:scale-[0.98]'
            }`}
            title={
              !sandboxAvailable
                ? 'Sandbox service unavailable on port 3000'
                : isBlocked
                ? 'High-risk command — confirmation required before sandbox execution'
                : 'Execute in isolated Docker sandbox with Tracee eBPF monitoring'
            }
          >
            <Shield className="w-4 h-4" />
            <span>Execute in Isolated Sandbox</span>
          </button>

        </div>

      </div>

      {/* High/Critical Risk Confirmation Modal (Sandbox Only) */}
      {showCriticalConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-obsidian-950/85 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-lg bg-white dark:bg-obsidian-900 rounded-3xl border-2 border-rose-500 shadow-2xl p-6">
            
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center border border-rose-300 dark:border-rose-500/50">
                <AlertOctagon className="w-6 h-6 text-rose-600 dark:text-rose-400 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-sans">HIGH RISK COMMAND — SANDBOX EXECUTION</h3>
                <p className="text-xs text-rose-700 dark:text-rose-300 font-mono">Execution strictly confined to isolated Docker container</p>
              </div>
            </div>

            <div className="bg-slate-100 dark:bg-obsidian-950 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200 my-4 break-all">
              <span className="text-rose-600 dark:text-rose-400 font-bold">$ </span>
              {analysis.command}
            </div>

            {analysis.warnings && analysis.warnings.length > 0 && (
              <div className="bg-rose-50 dark:bg-rose-950/50 rounded-2xl p-3.5 border border-rose-200 dark:border-rose-900/80 text-xs text-rose-900 dark:text-rose-200 mb-4 space-y-1">
                {analysis.warnings.map((w, idx) => (
                  <div key={idx} className="flex items-start gap-1.5">
                    <span className="text-rose-600 dark:text-rose-400 font-bold">•</span>
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800/50 text-xs text-emerald-800 dark:text-emerald-300 mb-4 flex items-start gap-2">
              <Shield className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>This command will run in a <strong>fully isolated Docker sandbox</strong> with no network access, dropped capabilities, read-only filesystem, and eBPF syscall monitoring. Your host machine is not affected.</span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">
              The AI analysis has flagged this as a <strong className="text-slate-900 dark:text-white font-bold">{analysis.risk_level}</strong> risk command. Proceed only if you understand the intended behavior.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCriticalConfirm(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors"
              >
                Cancel & Abort
              </button>
              <button
                onClick={handleConfirmCritical}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all flex items-center gap-1.5"
              >
                <Shield className="w-4 h-4" />
                <span>Run in Sandbox Anyway</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
