import React, { useState } from 'react';
import { 
  Play, 
  Shield, 
  Edit3, 
  X, 
  AlertTriangle, 
  AlertOctagon, 
  Terminal,
  CheckCircle2
} from 'lucide-react';

export default function ActionControls({
  analysis,
  onExecuteHost,
  onExecuteSandbox,
  onEdit,
  onCancel,
  isExecuting,
  sandboxAvailable,
}) {
  const [showCriticalConfirm, setShowCriticalConfirm] = useState(false);
  const [pendingTarget, setPendingTarget] = useState(null);

  if (!analysis) return null;

  const isCritical = analysis.risk_level === 'CRITICAL';

  const handleTrigger = (target) => {
    if (isCritical) {
      setPendingTarget(target);
      setShowCriticalConfirm(true);
    } else {
      if (target === 'sandbox') onExecuteSandbox();
      else onExecuteHost();
    }
  };

  const handleConfirmCritical = () => {
    setShowCriticalConfirm(false);
    if (pendingTarget === 'sandbox') onExecuteSandbox();
    else onExecuteHost();
    setPendingTarget(null);
  };

  return (
    <>
      <div className="w-full rounded-2xl p-4 my-3 border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-obsidian-900/90 flex flex-wrap items-center justify-between gap-3 shadow-md dark:shadow-xl backdrop-blur-xl transition-all">
        
        {/* Left Status */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-500 dark:text-slate-400 font-medium">Action Required:</span>
          <span className="text-brand-700 dark:text-cyan-300 font-semibold">Choose execution environment or edit command</span>
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

          {/* Docker Sandbox Run */}
          <button
            onClick={() => handleTrigger('sandbox')}
            disabled={isExecuting || !sandboxAvailable}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md ${
              !sandboxAvailable
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-300 dark:border-slate-700 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-500/20 active:scale-[0.98]'
            }`}
            title={sandboxAvailable ? 'Run in isolated Docker container with Tracee eBPF' : 'Sandbox service unavailable on port 3000'}
          >
            <Shield className="w-4 h-4" />
            <span>Run in Safe Sandbox</span>
          </button>

          {/* Local Host Run */}
          <button
            onClick={() => handleTrigger('host')}
            disabled={isExecuting}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md ${
              isCritical
                ? 'bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white shadow-rose-500/20 animate-pulse'
                : 'bg-gradient-to-r from-brand-600 to-indigo-600 dark:from-cyan-500 dark:to-blue-600 hover:from-brand-500 hover:to-indigo-500 dark:hover:from-cyan-400 dark:hover:to-blue-500 text-white shadow-brand-500/20 dark:shadow-cyan-500/20'
            } active:scale-[0.98] disabled:opacity-50`}
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Run on Local Host</span>
          </button>

        </div>

      </div>

      {/* Critical Risk Confirmation Modal */}
      {showCriticalConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-obsidian-950/85 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-lg bg-white dark:bg-obsidian-900 rounded-3xl border-2 border-rose-500 shadow-2xl p-6">
            
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center border border-rose-300 dark:border-rose-500/50">
                <AlertOctagon className="w-6 h-6 text-rose-600 dark:text-rose-400 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-sans">CRITICAL RISK COMMAND DETECTED</h3>
                <p className="text-xs text-rose-700 dark:text-rose-300 font-mono">Potentially Destructive / Irreversible Action</p>
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

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">
              Are you sure you want to execute this command on <strong className="text-slate-900 dark:text-white font-bold">{pendingTarget === 'sandbox' ? 'Docker Sandbox' : 'Local Host'}</strong>? System modifications or deletions cannot be recovered.
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
                <AlertTriangle className="w-4 h-4" />
                <span>Confirm & Force Execute</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
