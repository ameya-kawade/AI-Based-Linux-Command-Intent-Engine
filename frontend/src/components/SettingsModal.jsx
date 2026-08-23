import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  X, 
  Key, 
  Cpu, 
  Server, 
  Save, 
  Check, 
  AlertCircle,
  Zap,
  Sparkles
} from 'lucide-react';
import { updateSettings } from '../services/api';

export default function SettingsModal({ isOpen, onClose, onUpdated }) {
  const [provider, setProvider] = useState('groq');
  const [model, setModel] = useState('groq/compound-mini');
  const [groqKey, setGroqKey] = useState('');
  const [groqModel, setGroqModel] = useState(localStorage.getItem('lcie_groq_model') || 'groq/compound-mini');
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    // Read cached preferences from localStorage if available
    const savedProv = localStorage.getItem('lcie_provider');
    const savedGroqKey = localStorage.getItem('lcie_groq_key');
    const savedGroqModel = localStorage.getItem('lcie_groq_model');
    if (savedProv) setProvider(savedProv);
    if (savedGroqKey) setGroqKey(savedGroqKey);
    if (savedGroqModel) setGroqModel(savedGroqModel);
  }, []);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      localStorage.setItem('lcie_provider', provider);
      if (groqKey) localStorage.setItem('lcie_groq_key', groqKey);
      if (groqModel) localStorage.setItem('lcie_groq_model', groqModel);

      await updateSettings({
        ai_provider: provider,
        ai_model: model,
        groq_api_key: groqKey || undefined,
        groq_model: groqModel || undefined,
        openrouter_api_key: openrouterKey || undefined,
        gemini_api_key: geminiKey || undefined,
        openai_api_key: openaiKey || undefined,
        ollama_base_url: ollamaUrl || undefined,
      });
      setSavedSuccess(true);
      if (onUpdated) onUpdated();
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 800);
    } catch (err) {
      alert(`Failed to save settings: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-obsidian-950/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-lg bg-white dark:bg-obsidian-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-obsidian-950/60">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-brand-500/10 dark:bg-cyan-500/10 text-brand-600 dark:text-cyan-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-sans">
                Engine & AI Model Configuration
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose cloud LLM providers or local offline SLM instances
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

        {/* Settings Form */}
        <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
          
          {/* Primary Provider Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 font-mono">
              Primary AI Reasoning Engine
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setProvider('groq')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  provider === 'groq'
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-500 text-amber-900 dark:text-amber-200 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs font-mono">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span>Groq Cloud LPU</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-sans">
                  Ultra low latency cloud inference
                </div>
              </button>

              <button
                type="button"
                onClick={() => setProvider('ollama')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  provider === 'ollama'
                    ? 'bg-brand-50 dark:bg-purple-950/40 border-brand-400 dark:border-purple-500 text-brand-900 dark:text-purple-200 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs font-mono">
                  <Server className="w-4 h-4 text-brand-600 dark:text-purple-400" />
                  <span>Local Ollama</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-sans">
                  100% offline local model
                </div>
              </button>
            </div>
          </div>

          {/* Groq API Key & Model Configuration */}
          {provider === 'groq' && (
            <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-mono text-[11px]">
                    <Key className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    Groq API Key (Optional / Overrides .env)
                  </span>
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline font-mono"
                  >
                    Get Free Key ↗
                  </a>
                </label>
                <input
                  type="password"
                  value={groqKey}
                  onChange={(e) => setGroqKey(e.target.value)}
                  placeholder="gsk_..."
                  className="w-full bg-white dark:bg-obsidian-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 font-mono text-[11px]">
                  Groq Model Name
                </label>
                <select
                  value={groqModel}
                  onChange={(e) => setGroqModel(e.target.value)}
                  className="w-full bg-white dark:bg-obsidian-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 outline-none focus:border-amber-500"
                >
                  <option value="groq/compound-mini">groq/compound-mini (Default Compound)</option>
                  <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (Fastest)</option>
                  <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Highest Intelligence)</option>
                  <option value="mixtral-8x7b-32768">mixtral-8x7b-32768 (Fast MoE)</option>
                </select>
              </div>
            </div>
          )}

          {/* Ollama Local URL */}
          {provider === 'ollama' && (
            <div className="p-4 rounded-2xl bg-brand-50/60 dark:bg-purple-950/20 border border-brand-200 dark:border-purple-900/40 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 font-mono text-[11px]">
                  Ollama Base URL
                </label>
                <input
                  type="text"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="w-full bg-white dark:bg-obsidian-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none focus:border-brand-500"
                />
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-brand-600 to-indigo-600 dark:from-cyan-500 dark:to-blue-600 hover:from-brand-500 hover:to-indigo-500 text-white shadow-md flex items-center gap-1.5 transition-all"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Preferences</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
