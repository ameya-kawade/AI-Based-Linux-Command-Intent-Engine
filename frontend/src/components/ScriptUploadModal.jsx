import React, { useState, useEffect } from 'react';
import { 
  FileCode, 
  Upload, 
  X, 
  Check, 
  Play, 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle,
  Code2,
  Trash2,
  Sparkles
} from 'lucide-react';
import { SAMPLE_MALICIOUS_SCRIPT, SAMPLE_BENIGN_SCRIPT } from '../utils/sampleScripts';

export default function ScriptUploadModal({
  isOpen,
  onClose,
  onAttach,
  detectedScriptName = '',
  initialScriptContent = '',
  onRunAnalysisDirectly,
}) {
  const [scriptName, setScriptName] = useState('custom_script.sh');
  const [scriptContent, setScriptContent] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (detectedScriptName) {
        setScriptName(detectedScriptName);
      }
      if (initialScriptContent) {
        setScriptContent(initialScriptContent);
      } else if (!scriptContent) {
        setScriptContent(SAMPLE_BENIGN_SCRIPT);
      }
    }
  }, [isOpen, detectedScriptName, initialScriptContent]);

  if (!isOpen) return null;

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScriptName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setScriptContent(event.target.result || '');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setScriptName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setScriptContent(event.target.result || '');
    };
    reader.readAsText(file);
  };

  const handleSaveAndAttach = (autoRun = false) => {
    const scriptObj = {
      name: scriptName.trim() || 'custom_script.sh',
      content: scriptContent
    };
    onAttach(scriptObj);
    onClose();
    if (autoRun && onRunAnalysisDirectly) {
      onRunAnalysisDirectly(scriptObj);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-obsidian-950/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-2xl bg-white dark:bg-obsidian-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-obsidian-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brand-500/10 dark:bg-indigo-500/20 text-brand-600 dark:text-indigo-400">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-sans">
                Shell Script Source & Tracee eBPF Payload
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspect script internals and execute safely inside isolated Docker container
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
          
          {/* Quick Payload Preset Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 font-mono">
              Quick Test Templates
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setScriptName('deploy_exploit.sh');
                  setScriptContent(SAMPLE_MALICIOUS_SCRIPT);
                }}
                className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 hover:border-rose-400 text-left transition-all group"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800 dark:text-rose-300 font-mono">
                  <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>🚨 Malicious Reverse Shell</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-sans">
                  Simulates netcat reverse shell + shadow exfil
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setScriptName('build_bundle.sh');
                  setScriptContent(SAMPLE_BENIGN_SCRIPT);
                }}
                className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 hover:border-emerald-400 text-left transition-all group"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 font-mono">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>🛡️ Benign Build Routine</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-sans">
                  Safe tar compression & asset compilation
                </div>
              </button>
            </div>
          </div>

          {/* Script Name & File Upload */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 font-mono text-[11px]">
                Script File Name
              </label>
              <input
                type="text"
                value={scriptName}
                onChange={(e) => setScriptName(e.target.value)}
                placeholder="e.g. script.sh"
                className="w-full bg-slate-50 dark:bg-obsidian-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 outline-none focus:border-brand-500"
              />
            </div>

            <div className="sm:pt-5">
              <label className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-colors">
                <Upload className="w-3.5 h-3.5 text-brand-600 dark:text-cyan-400" />
                <span>Upload File</span>
                <input
                  type="file"
                  accept=".sh,.bash,.py,.pl,.rb,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Code Textarea Editor */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 font-mono text-[11px] flex items-center justify-between">
              <span>Script Source Code (Bash / Shell)</span>
              <span className="text-slate-400">{scriptContent.length} chars</span>
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`relative rounded-2xl border transition-all ${
                isDragOver 
                  ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/20' 
                  : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-950'
              }`}
            >
              <textarea
                value={scriptContent}
                onChange={(e) => setScriptContent(e.target.value)}
                rows={10}
                placeholder="#!/bin/bash\n# Paste script content here..."
                className="w-full bg-transparent p-3.5 font-mono text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none resize-none custom-scrollbar"
              />
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-obsidian-950/60 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setScriptContent('')}
            className="px-3 py-1.5 rounded-xl text-xs text-slate-500 hover:text-rose-600 flex items-center gap-1 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSaveAndAttach(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-brand-500/15 dark:bg-indigo-500/20 text-brand-700 dark:text-indigo-300 border border-brand-300 dark:border-indigo-500/40 hover:bg-brand-500/25 transition-all flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Attach Script</span>
            </button>
            <button
              type="button"
              onClick={() => handleSaveAndAttach(true)}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-brand-600 to-indigo-600 dark:from-cyan-500 dark:to-blue-600 hover:from-brand-500 hover:to-indigo-500 text-white shadow-md flex items-center gap-1.5 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>Attach & Inspect</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
