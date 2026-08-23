import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  X, 
  Zap, 
  Server, 
  Key, 
  Save, 
  Check, 
  HardDrive, 
  Database, 
  User, 
  Plus, 
  Trash2, 
  Download, 
  Upload, 
  RefreshCw,
  Layers,
  Cpu
} from 'lucide-react';
import { 
  getUserProfiles, 
  saveUserProfile, 
  deleteUserProfile, 
  getActiveUserId, 
  setActiveUserId, 
  getPreferredEngine, 
  migrateStorageEngine, 
  getStorageUsage,
  exportUserHistory,
  importUserHistory
} from '../services/historyStore';

export default function SettingsModal({ isOpen, onClose, onUpdated }) {
  const [activeTab, setActiveTab] = useState('ai'); // 'ai' | 'storage' | 'profiles'

  // AI settings
  const [provider, setProvider] = useState('groq');
  const [groqKey, setGroqKey] = useState('');
  const [groqModel, setGroqModel] = useState('groq/compound-mini');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Storage & Profiles settings
  const [storageEngine, setStorageEngine] = useState('indexeddb');
  const [storageUsage, setStorageUsage] = useState(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [activeId, setActiveId] = useState('default');
  
  // New profile form
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileRole, setNewProfileRole] = useState('');
  const [newProfileColor, setNewProfileColor] = useState('cyan');

  useEffect(() => {
    if (isOpen) {
      // Load AI preferences
      const savedProvider = localStorage.getItem('lcie_ai_provider') || 'groq';
      const savedKey = localStorage.getItem('lcie_groq_key') || '';
      const savedModel = localStorage.getItem('lcie_groq_model') || 'groq/compound-mini';
      const savedUrl = localStorage.getItem('lcie_ollama_url') || 'http://localhost:11434';

      setProvider(savedProvider);
      setGroqKey(savedKey);
      setGroqModel(savedModel);
      setOllamaUrl(savedUrl);
      setSavedSuccess(false);

      // Load Storage & Profiles
      setStorageEngine(getPreferredEngine());
      setProfiles(getUserProfiles());
      setActiveId(getActiveUserId());
      refreshStorageUsage();
    }
  }, [isOpen]);

  const refreshStorageUsage = async () => {
    try {
      const usage = await getStorageUsage();
      setStorageUsage(usage);
    } catch (e) {
      console.warn('Storage usage check failed', e);
    }
  };

  const handleSaveAI = (e) => {
    e?.preventDefault();
    setIsSaving(true);

    localStorage.setItem('lcie_ai_provider', provider);
    if (groqKey.trim()) {
      localStorage.setItem('lcie_groq_key', groqKey.trim());
    } else {
      localStorage.removeItem('lcie_groq_key');
    }
    localStorage.setItem('lcie_groq_model', groqModel);
    localStorage.setItem('lcie_ollama_url', ollamaUrl.trim() || 'http://localhost:11434');

    window.dispatchEvent(new CustomEvent('lcie-provider-changed', { detail: { provider } }));

    setTimeout(() => {
      setIsSaving(false);
      setSavedSuccess(true);
      if (onUpdated) onUpdated();
      setTimeout(() => setSavedSuccess(false), 2000);
    }, 400);
  };

  const handleEngineSwitch = async (newEngine) => {
    if (newEngine === storageEngine) return;
    setIsMigrating(true);
    try {
      await migrateStorageEngine(newEngine);
      setStorageEngine(newEngine);
      await refreshStorageUsage();
      alert(`Successfully migrated storage engine to ${newEngine.toUpperCase()}!`);
    } catch (err) {
      alert(`Migration error: ${err.message}`);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleCreateProfile = (e) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;

    saveUserProfile({
      name: newProfileName.trim(),
      role: newProfileRole.trim() || 'Operator',
      color: newProfileColor,
    });

    setNewProfileName('');
    setNewProfileRole('');
    setProfiles(getUserProfiles());
    refreshStorageUsage();
  };

  const handleDeleteProfile = (id) => {
    if (id === 'default') {
      alert('The Default Operator profile cannot be deleted.');
      return;
    }
    if (window.confirm('Delete this user profile and its associated history records?')) {
      deleteUserProfile(id);
      setProfiles(getUserProfiles());
      setActiveId(getActiveUserId());
      refreshStorageUsage();
    }
  };

  const getColorPill = (color) => {
    switch (color) {
      case 'rose': return 'bg-rose-500 text-white';
      case 'amber': return 'bg-amber-500 text-white';
      case 'emerald': return 'bg-emerald-500 text-white';
      case 'purple': return 'bg-purple-500 text-white';
      case 'blue': return 'bg-blue-500 text-white';
      default: return 'bg-cyan-500 text-white';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-obsidian-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl bg-white dark:bg-obsidian-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-obsidian-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brand-500/10 dark:bg-cyan-500/10 text-brand-600 dark:text-cyan-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-sans">
                Engine & System Settings
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure AI reasoning models, persistent storage, and user partitions
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

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-obsidian-950/40 px-4 pt-2 gap-2 text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`pb-2.5 px-3 font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'ai'
                ? 'border-brand-500 dark:border-cyan-400 text-brand-700 dark:text-cyan-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>AI Reasoning Engine</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('storage')}
            className={`pb-2.5 px-3 font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'storage'
                ? 'border-brand-500 dark:border-cyan-400 text-brand-700 dark:text-cyan-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Storage & Persistence</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('profiles')}
            className={`pb-2.5 px-3 font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'profiles'
                ? 'border-brand-500 dark:border-cyan-400 text-brand-700 dark:text-cyan-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <User className="w-4 h-4" />
            <span>User Profiles</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
          
          {/* TAB 1: AI Engine */}
          {activeTab === 'ai' && (
            <form onSubmit={handleSaveAI} className="space-y-4">
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
                      <option value="groq/compound-mini">groq/compound-mini (Default • Fast & Cheap Compound)</option>
                      <option value="openai/gpt-oss-20b">openai/gpt-oss-20b (High Speed 20B • Ultra Economical)</option>
                      <option value="qwen/qwen3.6-27b">qwen/qwen3.6-27b (Qwen 27B Reasoning)</option>
                      <option value="groq/compound">groq/compound (Full Compound Model)</option>
                      <option value="openai/gpt-oss-120b">openai/gpt-oss-120b (Large 120B Flagship)</option>
                      <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Meta Llama 3.3 70B)</option>
                      <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (Meta Llama 3.1 8B Instant)</option>
                    </select>
                  </div>
                </div>
              )}

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

              <div className="pt-2 flex justify-end">
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
                      <span>Save AI Preferences</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: Storage & Persistence */}
          {activeTab === 'storage' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 font-mono">
                  Storage Engine Architecture
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleEngineSwitch('indexeddb')}
                    disabled={isMigrating}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      storageEngine === 'indexeddb'
                        ? 'bg-cyan-50 dark:bg-cyan-950/40 border-cyan-400 dark:border-cyan-500 text-cyan-900 dark:text-cyan-200 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs font-mono">
                      <Database className="w-4 h-4 text-cyan-500" />
                      <span>IndexedDB (Recommended)</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-sans">
                      High-capacity, indexed queries, unlimited history
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleEngineSwitch('localstorage')}
                    disabled={isMigrating}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      storageEngine === 'localstorage'
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-500 text-amber-900 dark:text-amber-200 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs font-mono">
                      <HardDrive className="w-4 h-4 text-amber-500" />
                      <span>LocalStorage Fallback</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-sans">
                      Standard web storage (capped at 500 items per user)
                    </div>
                  </button>
                </div>
              </div>

              {/* Storage Telemetry Diagnostics */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-2.5 font-mono text-xs">
                <div className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-brand-600 dark:text-cyan-400" />
                    Storage Diagnostics
                  </span>
                  <button
                    onClick={refreshStorageUsage}
                    className="p-1 hover:text-brand-600 dark:hover:text-cyan-400 transition-colors"
                    title="Refresh telemetry"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-obsidian-950 border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Active Engine</div>
                    <div className="font-bold text-brand-700 dark:text-cyan-300 uppercase">{storageEngine}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-obsidian-950 border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Active Profile Entries</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">{storageUsage?.recordCount || 0}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-obsidian-950 border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Data Size</div>
                    <div className="font-bold text-emerald-600 dark:text-emerald-400">{storageUsage?.formattedSize || '0 KB'}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: User Profiles */}
          {activeTab === 'profiles' && (
            <div className="space-y-4">
              
              {/* Existing Profiles List */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider font-mono">
                  Managed Profiles & Partitions
                </label>
                <div className="space-y-2">
                  {profiles.map((p) => {
                    const isActive = p.id === activeId;
                    return (
                      <div
                        key={p.id}
                        className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                          isActive
                            ? 'bg-brand-50/70 dark:bg-cyan-950/30 border-brand-300 dark:border-cyan-700'
                            : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${getColorPill(p.color)}`}>
                            {p.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                              <span>{p.name}</span>
                              {isActive && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-brand-500/20 text-brand-700 dark:text-cyan-300 font-semibold">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400">{p.role}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {!isActive && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveUserId(p.id);
                                setActiveId(p.id);
                              }}
                              className="px-2.5 py-1 rounded-lg text-xs font-mono bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                            >
                              Switch To
                            </button>
                          )}
                          {p.id !== 'default' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteProfile(p.id)}
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-950/60 transition-colors"
                              title="Delete Profile"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add New Profile Form */}
              <form onSubmit={handleCreateProfile} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="text-xs font-bold font-mono text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-brand-600 dark:text-cyan-400" />
                  <span>Create Custom User Profile</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-mono">
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Profile Name</label>
                    <input
                      type="text"
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      placeholder="e.g. CI/CD Bot, Compliance Inspector"
                      className="w-full bg-white dark:bg-obsidian-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-brand-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Role / Subtitle</label>
                    <input
                      type="text"
                      value={newProfileRole}
                      onChange={(e) => setNewProfileRole(e.target.value)}
                      placeholder="e.g. Automated Pipeline"
                      className="w-full bg-white dark:bg-obsidian-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-500">Color:</span>
                    {['cyan', 'rose', 'amber', 'emerald', 'purple', 'blue'].map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setNewProfileColor(col)}
                        className={`w-5 h-5 rounded-full ${getColorPill(col)} transition-transform ${
                          newProfileColor === col ? 'scale-125 ring-2 ring-slate-400' : 'opacity-70 hover:opacity-100'
                        }`}
                      />
                    ))}
                  </div>

                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-brand-600 dark:bg-cyan-500 text-white shadow-sm hover:opacity-90 transition-all flex items-center gap-1 font-mono"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Profile</span>
                  </button>
                </div>
              </form>

            </div>
          )}

        </div>

      </div>
    </div>
  );
}
