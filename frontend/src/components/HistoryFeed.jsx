import React, { useState, useEffect, useRef } from 'react';
import { 
  History, 
  X, 
  Trash2, 
  Play, 
  Sparkles, 
  Search, 
  Download, 
  Upload, 
  Database, 
  Copy, 
  Check, 
  User, 
  HardDrive
} from 'lucide-react';
import { 
  getActiveUserProfile, 
  getUserProfiles, 
  setActiveUserId, 
  getHistoryEntries, 
  deleteHistoryEntry, 
  clearUserHistory, 
  exportUserHistory, 
  importUserHistory, 
  getStorageUsage 
} from '../services/historyStore';

export default function HistoryFeed({ 
  isOpen, 
  onClose, 
  onSelectCommand, 
  onViewAnalysis 
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [activeProfile, setActiveProfile] = useState(getActiveUserProfile());
  const [profiles, setProfiles] = useState(getUserProfiles());
  const [storageInfo, setStorageInfo] = useState({ engine: 'indexeddb', formattedSize: '0 KB', recordCount: 0 });
  const [copiedId, setCopiedId] = useState(null);
  const fileInputRef = useRef(null);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const profile = getActiveUserProfile();
      setActiveProfile(profile);
      setProfiles(getUserProfiles());

      const data = await getHistoryEntries(profile.id, {
        search,
        risk_level: riskFilter,
        status: statusFilter,
      });
      setItems(data);

      const usage = await getStorageUsage(profile.id);
      setStorageInfo(usage);
    } catch (err) {
      console.error('Failed to load history', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, search, riskFilter, statusFilter]);

  // Listen to global changes
  useEffect(() => {
    const handleStorageUpdate = () => {
      if (isOpen) loadHistory();
    };

    window.addEventListener('lcie-history-changed', handleStorageUpdate);
    window.addEventListener('lcie-user-changed', handleStorageUpdate);
    window.addEventListener('lcie-profiles-updated', handleStorageUpdate);
    window.addEventListener('lcie-storage-engine-changed', handleStorageUpdate);

    return () => {
      window.removeEventListener('lcie-history-changed', handleStorageUpdate);
      window.removeEventListener('lcie-user-changed', handleStorageUpdate);
      window.removeEventListener('lcie-profiles-updated', handleStorageUpdate);
      window.removeEventListener('lcie-storage-engine-changed', handleStorageUpdate);
    };
  }, [isOpen, search, riskFilter, statusFilter]);

  const handleClear = async () => {
    if (window.confirm(`Clear all audit history for ${activeProfile.name}?`)) {
      await clearUserHistory(activeProfile.id);
      await loadHistory();
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    await deleteHistoryEntry(activeProfile.id, id);
    await loadHistory();
  };

  const handleCopy = (id, command, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(command);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExport = async () => {
    const exportData = await exportUserHistory(activeProfile.id);
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `lcie_${activeProfile.id}_history_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target.result);
        const count = await importUserHistory(activeProfile.id, json, false);
        alert(`Successfully imported ${count} command audit records!`);
        await loadHistory();
      } catch (err) {
        alert(`Failed to import JSON history: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 dark:bg-obsidian-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-white dark:bg-obsidian-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
          
          {/* Header */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-obsidian-950/80">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-brand-500/10 dark:bg-cyan-500/10 text-brand-600 dark:text-cyan-400">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-sans flex items-center gap-2">
                  Command Analysis History & Audit Log
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand-500/10 dark:bg-cyan-500/20 text-brand-600 dark:text-cyan-300 border border-brand-500/20 dark:border-cyan-500/30">
                    {storageInfo.recordCount} entries
                  </span>
                </h2>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1 font-mono text-[11px]">
                    <Database className="w-3 h-3 text-brand-500 dark:text-cyan-400" />
                    Engine: <strong className="uppercase">{storageInfo.engine}</strong> ({storageInfo.formattedSize})
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Export JSON */}
              <button
                onClick={handleExport}
                className="p-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors"
                title="Export History to JSON"
              >
                <Download className="w-4 h-4" />
              </button>

              {/* Import JSON */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors"
                title="Import History from JSON"
              >
                <Upload className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="hidden"
              />

              {/* Clear All for user */}
              {items.length > 0 && (
                <button
                  onClick={handleClear}
                  className="px-2.5 py-1.5 rounded-xl text-xs text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 transition-colors flex items-center gap-1 font-semibold"
                  title="Clear history for this profile"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Clear</span>
                </button>
              )}

              {/* Close Drawer */}
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* User Profile Selector & Filters */}
          <div className="p-3 bg-slate-50/70 dark:bg-obsidian-950/60 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
            
            {/* User Profile bar */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 font-mono text-slate-600 dark:text-slate-300">
                <User className="w-3.5 h-3.5 text-brand-600 dark:text-cyan-400" />
                <span>Active Profile:</span>
                <select
                  value={activeProfile.id}
                  onChange={(e) => setActiveUserId(e.target.value)}
                  className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-800 dark:text-slate-200 font-semibold outline-none focus:border-brand-500 dark:focus:border-cyan-400"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-[11px] font-mono text-slate-400">
                Partitioned Storage
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search commands or intent analysis..."
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none focus:border-brand-500 dark:focus:border-cyan-400 font-sans"
              />
            </div>

            {/* Multi-Filters */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              
              {/* Risk filter */}
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-700 dark:text-slate-300 outline-none"
              >
                <option value="ALL">All Risk Levels</option>
                <option value="SAFE">SAFE</option>
                <option value="CAUTION">CAUTION</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-700 dark:text-slate-300 outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="analyzed">Analyzed (Pre-flight)</option>
              </select>
            </div>
          </div>

          {/* History List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-slate-400 text-xs font-mono">
                Loading history from {storageInfo.engine}...
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-16 space-y-2">
                <HardDrive className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
                <p className="text-slate-400 text-xs font-mono">
                  No command analysis records found for {activeProfile.name}.
                </p>
                <p className="text-slate-400 text-[11px]">
                  Run pre-flight inspections to populate this audit log.
                </p>
              </div>
            ) : (
              items.map((item) => {
                const risk = item.risk_level || item.analysis?.risk_level;

                return (
                  <div
                    key={item.id}
                    className="bg-slate-50 dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 transition-all space-y-2.5 group shadow-sm"
                  >
                    {/* Top Row: Status, Risk & Timestamp */}
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex flex-wrap items-center gap-1.5">
                        
                        {/* Status Pill */}
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800">
                          {item.status || 'analyzed'}
                        </span>

                        {/* Risk Pill */}
                        {risk && (
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            risk === 'CRITICAL' 
                              ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800' 
                              : risk === 'CAUTION' 
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800' 
                              : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
                          }`}>
                            {risk}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                        <span>{new Date(item.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <button
                          onClick={(e) => handleDelete(item.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-opacity"
                          title="Delete entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Command Box with Copy */}
                    <div className="relative flex items-center bg-white dark:bg-obsidian-950 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                      <code className="text-xs font-mono text-brand-700 dark:text-cyan-300 px-3 py-2 flex-1 truncate select-all">
                        <span className="text-slate-400">$ </span>{item.command}
                      </code>
                      <button
                        onClick={(e) => handleCopy(item.id, item.command, e)}
                        className="px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border-l border-slate-200 dark:border-slate-800 transition-colors"
                        title="Copy command to clipboard"
                      >
                        {copiedId === item.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {/* Intent Description */}
                    {item.analysis?.intent && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 font-sans leading-relaxed">
                        {item.analysis.intent}
                      </p>
                    )}

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800/60 text-xs">
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <span className="truncate max-w-[120px]">{item.cwd}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {item.analysis && (
                          <button
                            onClick={() => {
                              onViewAnalysis(item.analysis);
                              onClose();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-[11px] flex items-center gap-1 transition-colors"
                          >
                            <Sparkles className="w-3 h-3 text-brand-600 dark:text-cyan-400" />
                            <span>Card</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            onSelectCommand(item.command);
                            onClose();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-brand-500/15 dark:bg-cyan-500/20 hover:bg-brand-500/25 dark:hover:bg-cyan-500/30 text-brand-700 dark:text-cyan-300 border border-brand-300 dark:border-cyan-500/40 text-[11px] flex items-center gap-1 font-semibold transition-colors"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Use</span>
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
