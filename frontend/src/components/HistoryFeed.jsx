import React, { useState, useEffect } from 'react';
import { 
  History, 
  Search, 
  Trash2, 
  Play, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  AlertOctagon, 
  Clock, 
  Folder, 
  X,
  FileCode,
  Sparkles
} from 'lucide-react';
import { fetchHistory, clearHistory, deleteHistoryItem } from '../services/api';

export default function HistoryFeed({
  isOpen,
  onClose,
  onSelectCommand,
  onViewAnalysis,
}) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await fetchHistory({
        search: search || undefined,
        risk: riskFilter || undefined,
        status: statusFilter || undefined,
      });
      setItems(data || []);
    } catch (e) {
      console.error('Failed to load history', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, search, riskFilter, statusFilter]);

  const handleClear = async () => {
    if (window.confirm('Clear all execution history?')) {
      await clearHistory();
      setItems([]);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    await deleteHistoryItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 dark:bg-obsidian-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-xl bg-white dark:bg-obsidian-900 h-full border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col transition-all">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-brand-600 dark:text-cyan-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider font-sans">
              Execution History & Audit Log
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                onClick={handleClear}
                className="px-2.5 py-1 rounded-lg text-xs text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 transition-colors flex items-center gap-1"
                title="Clear all history"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-3 bg-slate-50 dark:bg-obsidian-950/60 border-b border-slate-200 dark:border-slate-800 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search past commands or intent..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none focus:border-brand-500 dark:focus:border-cyan-400"
            />
          </div>

          <div className="flex items-center gap-2 text-xs">
            {/* Risk filter */}
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-700 dark:text-slate-300 outline-none"
            >
              <option value="">All Risk Levels</option>
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
              <option value="">All Statuses</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-xs font-mono">
              Loading history...
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-xs font-mono">
              No command history entries found.
            </div>
          ) : (
            items.map((item) => {
              const risk = item.analysis?.risk_level;
              return (
                <div
                  key={item.id}
                  className="bg-slate-50 dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 transition-all space-y-2 group shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        item.status === 'success' 
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800' 
                          : item.status === 'cancelled'
                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                          : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                      }`}>
                        {item.status}
                      </span>
                      {risk && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          risk === 'CRITICAL' ? 'text-rose-600 dark:text-rose-400' : risk === 'CAUTION' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          [{risk}]
                        </span>
                      )}
                    </div>
                    <span className="text-slate-400 text-[11px]">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Command */}
                  <code className="text-xs font-mono text-brand-700 dark:text-cyan-300 block bg-white dark:bg-obsidian-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800 truncate">
                    $ {item.command}
                  </code>

                  {/* Intent if present */}
                  {item.analysis?.intent && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 font-sans">
                      {item.analysis.intent}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800/60 text-xs">
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <span>{item.cwd}</span>
                      {item.duration_ms !== undefined && <span>• {item.duration_ms}ms</span>}
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
  );
}
