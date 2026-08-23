import React, { useState, useEffect } from 'react';
import { Shield, Zap, BookOpen, AlertTriangle, Brain, Radar, CheckCircle2 } from 'lucide-react';

export default function AnalyzingRadar({ command }) {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    { title: 'SafeCmd AST Engine', desc: 'Parsing command AST, pipelines & allowlist policies...', icon: Shield },
    { title: 'CmdCaliper Vector Safety', desc: 'Encoding 768-dim vector & matching known attack patterns...', icon: Zap },
    { title: 'Explainshell Database', desc: 'Resolving manpage synopsis & used flag definitions...', icon: BookOpen },
    { title: 'Rule Heuristics & Policy', desc: 'Evaluating mutation risks & system alterations...', icon: AlertTriangle },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 400);
    return () => clearInterval(timer);
  }, [steps.length]);

  return (
    <div className="w-full rounded-2xl p-6 sm:p-8 my-4 border border-brand-200 dark:border-cyan-500/30 bg-white/90 dark:bg-obsidian-900/80 shadow-lg dark:shadow-[0_0_30px_rgba(56,189,248,0.1)] backdrop-blur-xl animate-fadeIn transition-all">
      <div className="flex flex-col md:flex-row items-center gap-8">
        
        {/* Radar Visual */}
        <div className="relative w-36 h-36 flex items-center justify-center">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-2 border-brand-500/20 dark:border-cyan-500/20 animate-ping" />
          <div className="absolute inset-2 rounded-full border border-brand-500/30 dark:border-cyan-500/30" />
          <div className="absolute inset-6 rounded-full border border-brand-500/40 dark:border-cyan-500/40" />
          <div className="absolute inset-10 rounded-full border border-brand-500/60 dark:border-cyan-500/60" />
          
          {/* Radar Sweep Line */}
          <div className="absolute inset-0 rounded-full overflow-hidden">
            <div className="w-full h-full bg-gradient-to-tr from-transparent via-brand-500/20 dark:via-cyan-500/20 to-brand-500/40 dark:to-cyan-400/40 animate-radar-sweep origin-center" />
          </div>

          {/* Center icon */}
          <div className="relative z-10 w-12 h-12 rounded-full bg-white dark:bg-slate-900 border border-brand-500/80 dark:border-cyan-400/80 flex items-center justify-center text-brand-600 dark:text-cyan-300 shadow-[0_0_20px_rgba(99,102,241,0.3)] dark:shadow-[0_0_20px_rgba(56,189,248,0.5)]">
            <Radar className="w-6 h-6 animate-spin" />
          </div>
        </div>

        {/* Multi-Tool Stage Progress */}
        <div className="flex-1 w-full">
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-brand-700 dark:text-cyan-400 font-semibold">
                Multi-Tool Processing Pipeline
              </span>
              <span className="inline-block w-2 h-2 rounded-full bg-brand-500 dark:bg-cyan-400 animate-ping" />
            </div>
            <div className="font-mono text-sm text-slate-800 dark:text-slate-300 mt-1 truncate bg-slate-100 dark:bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-slate-400 dark:text-slate-500 mr-2">$</span>
              {command}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              const isDone = activeStep > idx;
              const isCurrent = activeStep === idx;
              return (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border transition-all duration-300 flex items-start gap-3 ${
                    isCurrent
                      ? 'bg-brand-50 dark:bg-cyan-950/40 border-brand-400 dark:border-cyan-500/50 shadow-sm'
                      : isDone
                      ? 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                      : 'bg-slate-50/50 dark:bg-slate-950/40 border-slate-100 dark:border-slate-900/60 text-slate-400 dark:text-slate-600'
                  }`}
                >
                  <div className="mt-0.5">
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Icon className={`w-4 h-4 ${isCurrent ? 'text-brand-600 dark:text-cyan-400 animate-pulse' : 'text-slate-400'}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                      <span>{step.title}</span>
                      {isCurrent && <span className="text-[10px] text-brand-600 dark:text-cyan-400 font-mono animate-pulse">Processing...</span>}
                      {isDone && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">Completed</span>}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {step.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
