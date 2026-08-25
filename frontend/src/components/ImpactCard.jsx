import React, { useState } from "react";
import { 
  ExternalLink,
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  AlertOctagon, 
  RotateCcw, 
  FilePlus, 
  FileEdit, 
  FileMinus, 
  Network, 
  Server, 
  ArrowRight, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronRight, 
  BookOpen, 
  Info,
  Layers,
  Workflow,
  Split,
  Sparkles,
  Flame,
  Clock,
  Zap,
  Target,
  Crosshair,
  Shield,
  FileCode,
  Radio,
  Activity,
  Terminal,
  Globe,
  Sliders,
  Eye,
  ListFilter
} from "lucide-react";
import IntentExplainer from "./IntentExplainer";

export default function ImpactCard({ analysis, onUseAlternative }) {
  const [copiedAlt, setCopiedAlt] = useState(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [activeTab, setActiveTab] = useState("all"); // "all" | "manpage" | "security" | "impact" | "tracee"
  const [showFullFlags, setShowFullFlags] = useState(true);
  const [showNeighbors, setShowNeighbors] = useState(false);
  const [showScriptDetails, setShowScriptDetails] = useState(true);
  const [showScriptOutput, setShowScriptOutput] = useState(false);
  const [copiedPath, setCopiedPath] = useState(null);

  if (!analysis) return null;

  const risk = analysis.risk_level || "SAFE";
  const isReversible = analysis.is_reversible;
  const safecmd = analysis.safecmd;
  const cmdcaliper = analysis.cmdcaliper;
  const manpage = analysis.manpage_explanation;
  const stages = (analysis.pipeline_stages && analysis.pipeline_stages.length > 0)
    ? analysis.pipeline_stages
    : (manpage ? [{
        stage_index: 0,
        raw_command: analysis.command,
        command_explanation: manpage,
        trailing_operator: null
      }] : []);
  const scriptAnalysis = analysis.script_analysis;
  const fs = analysis.filesystem || { created: [], modified: [], deleted: [] };
  const net = analysis.network || { outbound_endpoints: [], ports_opened: [], downloads: [] };
  const hasFsImpact = (fs.created?.length || 0) + (fs.modified?.length || 0) + (fs.deleted?.length || 0) > 0;
  const hasNetImpact = (net.outbound_endpoints?.length || 0) + (net.ports_opened?.length || 0) + (net.downloads?.length || 0) > 0;
  const hasSystemImpact = (analysis.system_state_changes?.length || 0) > 0;

  const getRiskCardStyle = () => {
    switch (risk) {
      case "CRITICAL":
        return "border-rose-300 dark:border-rose-500/50 shadow-lg shadow-rose-500/10 dark:shadow-[0_0_40px_rgba(244,63,94,0.18)] bg-gradient-to-b from-rose-50/90 to-white/95 dark:from-[#1a0a12]/95 dark:to-[#0d0408]/95";
      case "CAUTION":
        return "border-amber-300 dark:border-amber-500/50 shadow-lg shadow-amber-500/10 dark:shadow-[0_0_40px_rgba(245,158,11,0.18)] bg-gradient-to-b from-amber-50/90 to-white/95 dark:from-[#1a140a]/95 dark:to-[#0d0904]/95";
      default:
        return "border-emerald-300 dark:border-emerald-500/50 shadow-lg shadow-emerald-500/10 dark:shadow-[0_0_40px_rgba(16,185,129,0.18)] bg-gradient-to-b from-emerald-50/90 to-white/95 dark:from-[#0a1814]/95 dark:to-[#040e0b]/95";
    }
  };

  const getRiskBadge = () => {
    switch (risk) {
      case "CRITICAL":
        return (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/50 text-xs font-bold font-mono tracking-wider shadow-sm animate-pulse">
            <AlertOctagon className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            <span>CRITICAL RISK</span>
          </div>
        );
      case "CAUTION":
        return (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/50 text-xs font-bold font-mono tracking-wider shadow-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>CAUTION</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/50 text-xs font-bold font-mono tracking-wider shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>SAFE TO RUN</span>
          </div>
        );
    }
  };

  const parseAlternative = (alt) => {
    if (!alt) return { command: "", description: "" };
    const parenMatch = alt.match(/^([^\(]+?)\s*\(([^\)]+)\)$/);
    if (parenMatch) {
      return { command: parenMatch[1].trim(), description: parenMatch[2].trim() };
    }
    const hashMatch = alt.match(/^([^#]+?)\s*#\s*(.+)$/);
    if (hashMatch) {
      return { command: hashMatch[1].trim(), description: hashMatch[2].trim() };
    }
    return { command: alt.trim(), description: "" };
  };

  const handleCopyCmd = () => {
    navigator.clipboard.writeText(analysis.command);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const handleCopyAlt = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedAlt(index);
    setTimeout(() => setCopiedAlt(null), 2000);
  };

  const handleCopyPath = (path, pIdx) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(pIdx);
    setTimeout(() => setCopiedPath(null), 1800);
  };

  return (
    <div className={`rounded-2xl p-4 sm:p-6 transition-all duration-300 border backdrop-blur-2xl ${getRiskCardStyle()}`}>
      
      {/* Top Meta Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800/80">
        <div className="flex flex-wrap items-center gap-2.5">
          {getRiskBadge()}
          
          {/* Reversibility Badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium border ${
            isReversible 
              ? "bg-cyan-50 dark:bg-cyan-950/50 text-cyan-800 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/80" 
              : "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-900/80"
          }`}>
            <RotateCcw className={`w-3.5 h-3.5 ${!isReversible ? "text-rose-600 dark:text-rose-400" : "text-cyan-600 dark:text-cyan-400"}`} />
            <span>{isReversible ? "Reversible Changes" : "Irreversible Action"}</span>
          </div>

          {/* Execution Time */}
          {analysis.analysis_time_ms > 0 && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-900/90 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 text-[11px] font-mono">
              <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
              <span>{analysis.analysis_time_ms}ms</span>
            </div>
          )}
        </div>

        {/* Origin / AI Model Pill & Copy Command */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/80 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-slate-400 dark:text-slate-500">Pipeline:</span>
            <span className="text-brand-700 dark:text-cyan-400 font-semibold truncate max-w-[180px]">
              {analysis.model_used || "Multi-Stage Defense Engine"}
            </span>
          </div>

          <button
            onClick={handleCopyCmd}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-900/80 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800 text-xs font-mono transition-colors"
            title="Copy command to clipboard"
          >
            {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            <span>{copiedCmd ? "Copied" : "Copy Command"}</span>
          </button>
        </div>
      </div>

      {/* Hero Intent & Explanation Section (Parsed Markdown + Impact Matrix) */}
      <IntentExplainer
        intent={analysis.intent}
        reversibilityExplanation={analysis.reversibility_explanation}
        isReversible={isReversible}
        risk={risk}
        command={analysis.command}
      />

      {/* Navigation Filter Tabs for Deep Inspection */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 my-3 border-b border-slate-200 dark:border-slate-800/80 text-xs font-mono">
        <button
          onClick={() => setActiveTab("all")}
          className={`px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "all"
              ? "bg-brand-500/15 dark:bg-cyan-500/20 text-brand-700 dark:text-cyan-300 border border-brand-300 dark:border-cyan-500/40 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>All Modules</span>
        </button>

        {(stages && stages.length > 0) && (
          <button
            onClick={() => setActiveTab("manpage")}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "manpage"
                ? "bg-brand-500/15 dark:bg-cyan-500/20 text-brand-700 dark:text-cyan-300 border border-brand-300 dark:border-cyan-500/40 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Manpage & Flags</span>
            {manpage.used_flags?.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-brand-100 dark:bg-cyan-950 text-brand-700 dark:text-cyan-400 text-[10px] border border-brand-200 dark:border-cyan-800 font-bold">
                {manpage.used_flags.length}
              </span>
            )}
          </button>
        )}

        {(safecmd || cmdcaliper) && (
          <button
            onClick={() => setActiveTab("security")}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "security"
                ? "bg-purple-100 dark:bg-purple-500/20 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-500/40 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50"
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>Dual Security Engines</span>
          </button>
        )}

        {(hasFsImpact || hasNetImpact || hasSystemImpact) && (
          <button
            onClick={() => setActiveTab("impact")}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "impact"
                ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50"
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Mutations & Footprint</span>
          </button>
        )}

        {scriptAnalysis && (
          <button
            onClick={() => setActiveTab("tracee")}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "tracee"
                ? "bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50"
            }`}
          >
            <FileCode className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            <span>Tracee eBPF Trace</span>
            {scriptAnalysis.is_malicious && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            )}
          </button>
        )}
      </div>

      {/* Aqua Tracee eBPF Sandbox Runtime Analysis Section */}
      {scriptAnalysis && (activeTab === "all" || activeTab === "tracee") && (
        <div className={`my-4 rounded-2xl border p-4 sm:p-5 transition-all ${
          scriptAnalysis.is_malicious || scriptAnalysis.severity === "CRITICAL"
            ? "bg-rose-50/80 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/80 shadow-md"
            : scriptAnalysis.severity === "HIGH" || scriptAnalysis.severity === "MEDIUM"
            ? "bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/80 shadow-md"
            : "bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 shadow-md"
        }`}>
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className={`p-1.5 rounded-xl ${
                scriptAnalysis.is_malicious 
                  ? "bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400" 
                  : "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
              }`}>
                {scriptAnalysis.is_malicious ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 font-sans">
                    <span>Aqua Tracee eBPF Sandbox Analysis</span>
                  </h4>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase font-bold border ${
                    scriptAnalysis.is_malicious
                      ? "bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700"
                      : "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
                  }`}>
                    {scriptAnalysis.is_malicious ? `${scriptAnalysis.severity} RISK` : "BENIGN"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                  <FileCode className="w-3.5 h-3.5 text-brand-600 dark:text-cyan-400" />
                  <span className="text-brand-700 dark:text-cyan-300 font-semibold">{scriptAnalysis.script_name}</span>
                  <span>•</span>
                  <span>Engine: {scriptAnalysis.source === "tracee_ebpf" ? "Tracee eBPF Probes" : "Static Script Analyzer"}</span>
                  {scriptAnalysis.execution_time_ms > 0 && (
                    <>
                      <span>•</span>
                      <span>Runtime: {scriptAnalysis.execution_time_ms}ms</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowScriptDetails(!showScriptDetails)}
                className="text-xs text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 transition-colors"
              >
                <span>{showScriptDetails ? "Hide Events" : "View Events"}</span>
                {showScriptDetails ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Script Summary */}
          {scriptAnalysis.summary && (
            <p className="mt-3 text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium bg-white/90 dark:bg-obsidian-950/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
              {scriptAnalysis.summary}
            </p>
          )}

          {/* Detected Signatures */}
          {scriptAnalysis.detected_signatures && scriptAnalysis.detected_signatures.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-mono text-rose-800 dark:text-rose-300 font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>Detected Threat Signatures:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {scriptAnalysis.detected_signatures.map((sig, idx) => (
                  <span key={idx} className="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-950/80 text-rose-900 dark:text-rose-200 border border-rose-300 dark:border-rose-800/80 text-xs font-mono font-medium shadow-sm">
                    ⚠️ {sig}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Detailed Tracee Events List */}
          {showScriptDetails && scriptAnalysis.tracee_alerts && scriptAnalysis.tracee_alerts.length > 0 && (
            <div className="mt-3.5 pt-3 border-t border-slate-200 dark:border-slate-800/80">
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Kernel Syscall & eBPF Event Trace ({scriptAnalysis.tracee_alerts.length} events)</span>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                {scriptAnalysis.tracee_alerts.map((alert, idx) => (
                  <div 
                    key={idx} 
                    className={`p-2.5 rounded-xl border text-xs font-mono ${
                      alert.is_security_alert || alert.severity === "CRITICAL"
                        ? "bg-rose-100/70 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800/80 text-rose-950 dark:text-rose-200"
                        : alert.severity === "HIGH" || alert.severity === "MEDIUM"
                        ? "bg-amber-100/70 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800/80 text-amber-950 dark:text-amber-200"
                        : "bg-white dark:bg-obsidian-950/80 border-slate-200 dark:border-slate-800/80 text-slate-800 dark:text-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-brand-700 dark:text-cyan-300">{alert.event_name}</span>
                        {alert.category && (
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            {alert.category}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {alert.mitre_attack && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800 font-semibold">
                            {alert.mitre_attack}
                          </span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.2 rounded border font-bold ${
                          alert.severity === "CRITICAL" ? "bg-rose-200 dark:bg-rose-900/80 text-rose-900 dark:text-rose-300 border-rose-300 dark:border-rose-700" :
                          alert.severity === "HIGH" ? "bg-amber-200 dark:bg-amber-900/80 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-700" :
                          alert.severity === "MEDIUM" ? "bg-yellow-200 dark:bg-yellow-900/80 text-yellow-900 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700" :
                          "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                        }`}>
                          {alert.severity}
                        </span>
                      </div>
                    </div>
                    {alert.description && (
                      <p className="text-slate-700 dark:text-slate-300 text-[11px] font-sans leading-relaxed">{alert.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sandbox Standard Output / Terminal */}
          {scriptAnalysis.script_output && scriptAnalysis.script_output.trim() && (
            <div className="mt-3.5 pt-3 border-t border-slate-200 dark:border-slate-800/80">
              <button
                onClick={() => setShowScriptOutput(!showScriptOutput)}
                className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 flex items-center gap-1.5 font-mono"
              >
                <Terminal className="w-3.5 h-3.5 text-brand-600 dark:text-cyan-400" />
                <span>{showScriptOutput ? "Hide Sandbox Output" : "View Sandbox Execution Output"}</span>
                {showScriptOutput ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              {showScriptOutput && (
                <div className="mt-2 p-3 bg-slate-900 text-slate-100 dark:bg-obsidian-950 rounded-xl border border-slate-800 font-mono text-xs overflow-x-auto max-h-48 whitespace-pre-wrap">
                  {scriptAnalysis.script_output}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dual Security Engines Grid: SafeCmd AST Allowlist + CmdCaliper Vector Safety */}
      {(safecmd || cmdcaliper) && (activeTab === "all" || activeTab === "security") && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
          
          {/* SafeCmd Policy Card */}
          {safecmd && (
            <div className="bg-white/90 dark:bg-slate-900/70 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800/90 flex flex-col justify-between shadow-md">
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-brand-500/10 dark:bg-cyan-500/10 text-brand-600 dark:text-cyan-400 border border-brand-500/20 dark:border-cyan-500/20">
                      <Shield className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider font-mono">SafeCmd AST Allowlist</h4>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold border ${
                    safecmd.allowed 
                      ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700" 
                      : "bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700"
                  }`}>
                    {safecmd.allowed ? "ALLOWLISTED" : "POLICY VIOLATION"}
                  </span>
                </div>
                
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans mb-3">
                  {safecmd.message || safecmd.reason}
                </p>

                {safecmd.rule_violations && safecmd.rule_violations.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    <div className="text-[11px] font-mono text-rose-700 dark:text-rose-400 font-bold uppercase tracking-wider">
                      AST Rule Violations:
                    </div>
                    {safecmd.rule_violations.map((violation, vIdx) => (
                      <div key={vIdx} className="text-xs p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200 flex items-start gap-1.5 font-mono leading-relaxed">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                        <span>{violation}</span>
                      </div>
                    ))}
                  </div>
                )}

                {safecmd.policy_level && (
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-2">
                    Policy Strictness: <span className="text-brand-700 dark:text-cyan-300 uppercase font-semibold">{safecmd.policy_level}</span>
                  </div>
                )}

                {/* AST Sub-commands */}
                {safecmd.extracted_commands && safecmd.extracted_commands.length > 0 && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1.5 flex items-center justify-between">
                      <span>AST Parsed Pipeline Nodes (shfmt):</span>
                      {safecmd.ast_operators && safecmd.ast_operators.length > 0 && (
                        <span className="text-slate-400">Operators: {safecmd.ast_operators.join(" ")}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {safecmd.extracted_commands.map((cmd, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-slate-100 dark:bg-obsidian-950 text-brand-800 dark:text-cyan-300 border border-slate-200 dark:border-slate-800 rounded-lg text-[11px] font-mono font-semibold">
                          {Array.isArray(cmd) ? cmd.join(" ") : cmd}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* AST Redirections */}
                {safecmd.has_redirections && (
                  <div className="mt-2.5 text-[11px] font-mono text-amber-800 dark:text-amber-400 flex items-center gap-1.5 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>I/O Redirections Present ({safecmd.redirections?.join(", ")})</span>
                  </div>
                )}
              </div>

              <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 text-[10px] text-slate-500 font-mono flex items-center justify-between">
                <span>Engine: bashlex AST Scanner</span>
                <span>Status: {safecmd.allowed ? "Pass" : "Flagged"}</span>
              </div>
            </div>
          )}

          {/* CmdCaliper Semantic Vector Safety Card */}
          {cmdcaliper && (
            <div className="bg-white/90 dark:bg-slate-900/70 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800/90 flex flex-col justify-between shadow-md">
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                      <Target className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider font-mono">CmdCaliper Vector Safety</h4>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold border ${
                    cmdcaliper.verdict === "BENIGN"
                      ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
                      : cmdcaliper.verdict === "SUSPICIOUS"
                      ? "bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                      : "bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700"
                  }`}>
                    {cmdcaliper.verdict}
                  </span>
                </div>

                {/* Distance Score Metric */}
                <div className="my-2.5 bg-slate-50 dark:bg-obsidian-950/90 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800/80">
                  <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Embedding Cosine Similarity</span>
                    <span className="text-purple-700 dark:text-purple-300 font-bold">
                      {(cmdcaliper.similarity_score * 100).toFixed(1)}%
                    </span>
                  </div>
                  {/* Similarity Meter Progress Bar */}
                  <div className="w-full bg-slate-200 dark:bg-slate-800/90 rounded-full h-2 overflow-hidden p-0.5">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        cmdcaliper.verdict === "BENIGN" 
                          ? "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
                          : cmdcaliper.verdict === "SUSPICIOUS" 
                          ? "bg-gradient-to-r from-amber-500 to-yellow-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]" 
                          : "bg-gradient-to-r from-rose-500 to-red-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(8, cmdcaliper.similarity_score * 100))}%` }}
                    />
                  </div>
                </div>

                {/* Nearest Match & Threat Classification Tags */}
                <div className="space-y-1.5 text-xs font-mono">
                  {cmdcaliper.matched_category && (
                    <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                      <span className="text-slate-500 dark:text-slate-400">Threat Cluster:</span>
                      <span className="text-brand-700 dark:text-cyan-300 font-semibold">{cmdcaliper.matched_category}</span>
                    </div>
                  )}
                  {cmdcaliper.matched_mitre && (
                    <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                      <span className="text-slate-500 dark:text-slate-400">MITRE ATT&CK:</span>
                      <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[11px] font-bold">
                        {cmdcaliper.matched_mitre}
                      </span>
                    </div>
                  )}
                  {cmdcaliper.matched_command && (
                    <div className="mt-2 text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400 block mb-0.5">Closest Reference Vector:</span>
                      <code className="text-slate-800 dark:text-slate-300 bg-slate-100 dark:bg-obsidian-950 p-2 rounded-lg block border border-slate-200 dark:border-slate-800/80 truncate font-mono text-[11px]" title={cmdcaliper.matched_command}>
                        {cmdcaliper.matched_command}
                      </code>
                    </div>
                  )}
                </div>

                {/* Expandable Top-K Nearest Neighbors Accordion */}
                {cmdcaliper.top_matches && cmdcaliper.top_matches.length > 1 && (
                  <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
                    <button 
                      onClick={() => setShowNeighbors(!showNeighbors)}
                      className="text-[11px] text-purple-700 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 font-mono flex items-center justify-between w-full p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <span>View Top-{cmdcaliper.top_matches.length} Similarity Neighbors</span>
                      {showNeighbors ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    
                    {showNeighbors && (
                      <div className="mt-2 space-y-1.5 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                        {cmdcaliper.top_matches.map((m, idx) => (
                          <div key={idx} className="p-2 rounded-lg bg-slate-50 dark:bg-obsidian-950 border border-slate-200 dark:border-slate-800/70 text-[11px] font-mono">
                            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                              <span className="text-brand-700 dark:text-cyan-300 truncate max-w-[170px] font-medium">{m.category}</span>
                              <span className="text-purple-700 dark:text-purple-300 font-bold">{(m.similarity * 100).toFixed(0)}% match</span>
                            </div>
                            <div className="text-slate-700 dark:text-slate-300 truncate mt-0.5 text-[10px]">{m.command}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 text-[10px] text-slate-500 font-mono flex items-center justify-between">
                <span>Model: Ameya-Kawade/cmdcaliper</span>
                <span>Embedding: 384 dims</span>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Ground-Truth Manpage & Pipeline Command Flow (Explainshell & man7.org) */}
      {stages && stages.length > 0 && (activeTab === "all" || activeTab === "manpage") && (
        <div className="my-4 bg-white/90 dark:bg-slate-900/70 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800/90 shadow-md space-y-5">
          
          {/* Main Section Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-brand-500/10 dark:bg-cyan-500/10 text-brand-600 dark:text-cyan-400 border border-brand-500/20 dark:border-cyan-500/20 shadow-sm">
                <Workflow className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2 font-mono">
                  <span>Command Pipeline & Ground-Truth Manual</span>
                  {stages.length > 1 && (
                    <span className="px-2 py-0.5 rounded-full bg-brand-50 dark:bg-cyan-950/80 text-brand-700 dark:text-cyan-300 border border-brand-200 dark:border-cyan-800 text-[10px] font-bold">
                      {stages.length} Pipeline Stages
                    </span>
                  )}
                </h4>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowFullFlags(!showFullFlags)}
                className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 font-mono transition-colors"
              >
                <span>{showFullFlags ? "Collapse All Flags" : "Expand All Flags"}</span>
                {showFullFlags ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Interactive Multi-Command Visual Pipeline Flow Ribbon (if >1 stage) */}
          {stages.length > 1 && (
            <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-obsidian-950/80 border border-slate-200 dark:border-slate-800/80 shadow-inner">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5 flex items-center gap-1.5">
                <Split className="w-3.5 h-3.5 text-brand-600 dark:text-cyan-400" />
                <span>Execution Pipeline Sequence:</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                {stages.map((stg, sIdx) => {
                  const cmdExp = stg.command_explanation;
                  const trailingOp = stg.trailing_operator;
                  return (
                    <React.Fragment key={sIdx}>
                      {/* Command Node */}
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm shrink-0 font-mono text-xs">
                        <span className="w-5 h-5 rounded-full bg-brand-100 dark:bg-cyan-950 text-brand-700 dark:text-cyan-300 flex items-center justify-center text-[10px] font-bold border border-brand-200 dark:border-cyan-800">
                          {sIdx + 1}
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">{cmdExp.command}</span>
                        {cmdExp.nested_command && (
                          <span className="text-[11px] text-brand-600 dark:text-cyan-400 font-semibold">
                            ↳ {cmdExp.nested_command.command}
                          </span>
                        )}
                        {cmdExp.used_flags?.length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            {cmdExp.used_flags.length} flag{cmdExp.used_flags.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Operator Connector */}
                      {trailingOp && (
                        <div className="flex items-center gap-1 shrink-0" title={trailingOp.description}>
                          <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-mono font-bold shadow-sm flex items-center gap-1">
                            <span>{trailingOp.operator}</span>
                            <span className="text-[10px] uppercase font-normal opacity-80">({trailingOp.name})</span>
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sequential Stage Cards */}
          <div className="space-y-5">
            {stages.map((stg, sIdx) => {
              const cmdExp = stg.command_explanation;
              const trailingOp = stg.trailing_operator;

              return (
                <div key={sIdx} className="space-y-3">
                  
                  {/* Stage Card Container */}
                  <div className="p-4 rounded-xl bg-slate-50/50 dark:bg-obsidian-950/60 border border-slate-200 dark:border-slate-800/90 shadow-sm relative">
                    
                    {/* Stage Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2">
                        {stages.length > 1 && (
                          <span className="px-2 py-0.5 rounded-md bg-brand-100 dark:bg-cyan-950/90 text-brand-800 dark:text-cyan-300 font-mono text-[11px] font-bold border border-brand-200 dark:border-cyan-800">
                            Stage {sIdx + 1}
                          </span>
                        )}
                        <span className="text-xs font-mono font-bold text-brand-700 dark:text-cyan-300">
                          {cmdExp.command}
                        </span>
                        {cmdExp.manpage_source && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {cmdExp.manpage_source.includes("man7") ? "man7.org" : "Explainshell"}
                          </span>
                        )}
                      </div>

                      {cmdExp.manpage_url && (
                        <a
                          href={cmdExp.manpage_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-mono text-brand-600 dark:text-cyan-400 hover:underline flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 transition-colors"
                          title="Open manpage"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>{cmdExp.command} man7.org ↗</span>
                        </a>
                      )}
                    </div>

                    {/* Raw Stage Command Snippet */}
                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200 mb-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2 overflow-x-auto">
                        <span className="text-brand-600 dark:text-cyan-400 font-bold">$</span>
                        <span>{stg.raw_command}</span>
                      </div>
                    </div>

                    {/* Synopsis */}
                    {cmdExp.synopsis && (
                      <p className="text-xs text-slate-700 dark:text-slate-300 font-sans mb-3 leading-relaxed">
                        <strong>Synopsis:</strong> {cmdExp.synopsis}
                      </p>
                    )}

                    {/* Used Flags for this command */}
                    {showFullFlags && cmdExp.used_flags && cmdExp.used_flags.length > 0 && (
                      <div className="space-y-2 mt-2">
                        <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Flags for {cmdExp.command} ({cmdExp.used_flags.length}):
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {cmdExp.used_flags.map((f, fIdx) => (
                            <div key={fIdx} className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-sans hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-2 font-mono font-bold">
                                  <span className="px-2 py-0.5 rounded-md bg-brand-50 dark:bg-cyan-950/90 border border-brand-200 dark:border-cyan-700 text-brand-700 dark:text-cyan-300 font-mono text-xs shadow-sm">
                                    {f.flag}
                                  </span>
                                  {f.canonical_name && f.canonical_name !== f.flag && (
                                    <span className="text-slate-500 dark:text-slate-400 text-[11px] font-normal">({f.canonical_name})</span>
                                  )}
                                </div>
                                {f.has_argument && (
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                    Arg: {f.argument_value || "Required"}
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-700 dark:text-slate-200 leading-relaxed font-sans">{f.summary || f.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Embedded Nested Command (e.g. wrapper xargs executing rm -rf) */}
                    {cmdExp.nested_command && (
                      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-brand-600 dark:text-cyan-400" />
                            <span>Nested Subcommand Execution:</span>
                            <span className="text-brand-700 dark:text-cyan-300 font-mono lowercase">({cmdExp.nested_command.command})</span>
                          </span>
                          {cmdExp.nested_command.manpage_url && (
                            <a
                              href={cmdExp.nested_command.manpage_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-mono text-brand-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
                            >
                              <span>{cmdExp.nested_command.command} manual ↗</span>
                            </a>
                          )}
                        </div>

                        {cmdExp.nested_command.synopsis && (
                          <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-700 dark:text-slate-300">
                            <span className="text-brand-600 dark:text-cyan-400 font-bold mr-1">↳</span>
                            <span>{cmdExp.nested_command.command}: {cmdExp.nested_command.synopsis}</span>
                          </div>
                        )}

                        {/* Nested Flags */}
                        {showFullFlags && cmdExp.nested_command.used_flags && cmdExp.nested_command.used_flags.length > 0 && (
                          <div className="space-y-1.5 pl-2 border-l-2 border-brand-300 dark:border-cyan-800">
                            <div className="text-[10px] font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase">
                              Flags for nested {cmdExp.nested_command.command}:
                            </div>
                            <div className="grid grid-cols-1 gap-1.5">
                              {cmdExp.nested_command.used_flags.map((nf, nfIdx) => (
                                <div key={nfIdx} className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <div className="flex items-center gap-2 font-mono font-bold">
                                      <span className="px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs">
                                        {nf.flag}
                                      </span>
                                      {nf.canonical_name && nf.canonical_name !== nf.flag && (
                                        <span className="text-slate-500 dark:text-slate-400 text-[10px]">({nf.canonical_name})</span>
                                      )}
                                    </div>
                                  </div>
                                  <p className="text-slate-700 dark:text-slate-300 text-xs leading-relaxed">{nf.summary || nf.description}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  </div>

                  {/* Operator Connector Card (Between Stages) */}
                  {trailingOp && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 shadow-sm text-xs font-mono text-indigo-950 dark:text-indigo-200">
                      <div className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-bold text-sm shrink-0 shadow-sm">
                        {trailingOp.operator}
                      </div>
                      <div>
                        <div className="font-bold flex items-center gap-1.5">
                          <span>{trailingOp.name} Operator</span>
                        </div>
                        <p className="text-[11px] font-sans text-slate-700 dark:text-slate-300 mt-0.5 leading-relaxed">
                          {trailingOp.description}
                        </p>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* Predicted Mutations & System Impact Grid */}
      {(hasFsImpact || hasNetImpact || hasSystemImpact) && (activeTab === "all" || activeTab === "impact") && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 my-4">
          
          {/* Filesystem Mutations */}
          <div className="bg-white/90 dark:bg-slate-900/70 rounded-2xl p-4 border border-slate-200 dark:border-slate-800/90 shadow-md">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 font-mono">
              <FileEdit className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Filesystem Impact</span>
            </div>
            {hasFsImpact ? (
              <div className="space-y-1.5 text-xs font-mono max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                {fs.created?.map((c, idx) => (
                  <div key={`c-${idx}`} className="text-emerald-700 dark:text-emerald-300 flex items-start justify-between gap-1 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/40 group">
                    <div className="flex items-start gap-1 min-w-0">
                      <FilePlus className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="truncate" title={c}>+ {c}</span>
                    </div>
                    <button 
                      onClick={() => handleCopyPath(c, `c-${idx}`)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-800 dark:hover:text-white transition-opacity"
                      title="Copy path"
                    >
                      {copiedPath === `c-${idx}` ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                ))}
                {fs.modified?.map((m, idx) => (
                  <div key={`m-${idx}`} className="text-amber-700 dark:text-amber-300 flex items-start justify-between gap-1 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/40 group">
                    <div className="flex items-start gap-1 min-w-0">
                      <FileEdit className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                      <span className="truncate" title={m}>~ {m}</span>
                    </div>
                    <button 
                      onClick={() => handleCopyPath(m, `m-${idx}`)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-800 dark:hover:text-white transition-opacity"
                      title="Copy path"
                    >
                      {copiedPath === `m-${idx}` ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                ))}
                {fs.deleted?.map((d, idx) => (
                  <div key={`d-${idx}`} className="text-rose-700 dark:text-rose-300 flex items-start justify-between gap-1 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/40 group">
                    <div className="flex items-start gap-1 min-w-0">
                      <FileMinus className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                      <span className="truncate font-semibold" title={d}>- {d}</span>
                    </div>
                    <button 
                      onClick={() => handleCopyPath(d, `d-${idx}`)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-800 dark:hover:text-white transition-opacity"
                      title="Copy path"
                    >
                      {copiedPath === `d-${idx}` ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No persistent file mutations detected.</p>
            )}
          </div>

          {/* Network Footprint */}
          <div className="bg-white/90 dark:bg-slate-900/70 rounded-2xl p-4 border border-slate-200 dark:border-slate-800/90 shadow-md">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 font-mono">
              <Network className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>Network Footprint</span>
            </div>
            {hasNetImpact ? (
              <div className="space-y-2 text-xs font-mono max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                {net.outbound_endpoints?.map((ep, idx) => (
                  <div key={idx} className="text-cyan-800 dark:text-cyan-300 truncate p-1.5 rounded-lg bg-cyan-50 dark:bg-obsidian-950/60 border border-cyan-200 dark:border-slate-800/60" title={ep}>
                    ⚡ Connect: <strong className="text-cyan-900 dark:text-cyan-200">{ep}</strong>
                  </div>
                ))}
                {net.ports_opened?.map((p, idx) => (
                  <div key={idx} className="text-purple-800 dark:text-purple-300 p-1.5 rounded-lg bg-purple-50 dark:bg-obsidian-950/60 border border-purple-200 dark:border-slate-800/60">
                    🔌 Listen: <strong className="text-purple-900 dark:text-purple-200">Port {p}</strong>
                  </div>
                ))}
                {net.downloads?.map((dl, idx) => (
                  <div key={idx} className="text-blue-800 dark:text-blue-300 truncate p-1.5 rounded-lg bg-blue-50 dark:bg-obsidian-950/60 border border-blue-200 dark:border-slate-800/60" title={dl}>
                    ⬇ Download: <strong className="text-blue-900 dark:text-blue-200">{dl}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No external network activity predicted.</p>
            )}
          </div>

          {/* System State */}
          <div className="bg-white/90 dark:bg-slate-900/70 rounded-2xl p-4 border border-slate-200 dark:border-slate-800/90 shadow-md">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 font-mono">
              <Server className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>System & Daemons</span>
            </div>
            {hasSystemImpact ? (
              <div className="space-y-1.5 text-xs font-mono max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                {analysis.system_state_changes?.map((sys, idx) => (
                  <div key={idx} className="text-amber-800 dark:text-amber-300 p-1.5 rounded-lg bg-amber-50 dark:bg-obsidian-950/60 border border-amber-200 dark:border-slate-800/60">
                    ⚙ {sys}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No daemon or system state alterations.</p>
            )}
          </div>

        </div>
      )}

      {/* Safety Warnings Callouts */}
      {analysis.warnings && analysis.warnings.length > 0 && (
        <div className="my-4 bg-rose-50 dark:bg-rose-950/50 rounded-2xl p-4 sm:p-5 border border-rose-200 dark:border-rose-800/80 shadow-md">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-800 dark:text-rose-300 uppercase tracking-wider mb-2.5 font-mono">
            <div className="p-1 rounded bg-rose-200/60 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <span>Safety & Security Warnings</span>
          </div>
          <ul className="space-y-2">
            {analysis.warnings.map((w, wIdx) => (
              <li key={wIdx} className="text-xs text-rose-900 dark:text-rose-200 font-medium flex items-start gap-2.5">
                <span className="text-rose-600 dark:text-rose-400 font-bold shrink-0 mt-0.5">•</span>
                <span className="leading-relaxed">{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Safer Alternatives */}
      {analysis.suggested_alternatives && analysis.suggested_alternatives.length > 0 && (
        <div className="my-4 bg-emerald-50/70 dark:bg-emerald-950/40 rounded-2xl p-4 sm:p-5 border border-emerald-200 dark:border-emerald-800/70 shadow-lg">
          <div className="flex items-center justify-between gap-2 mb-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider font-mono">
              <div className="p-1 rounded bg-emerald-200/60 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <span>Recommended Safer Alternatives</span>
            </div>
            {risk === "CRITICAL" && (
              <span className="text-[11px] font-mono text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/80 px-2.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700 font-semibold shadow-sm">
                🛡️ Replaces Hazardous Execution
              </span>
            )}
          </div>
          
          <div className="space-y-3">
            {analysis.suggested_alternatives.map((alt, aIdx) => {
              const { command: cleanCmd, description: desc } = parseAlternative(alt);
              return (
                <div key={aIdx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/95 dark:bg-obsidian-950/90 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/70 hover:border-emerald-400 dark:hover:border-emerald-700 transition-all shadow-sm">
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-emerald-800 dark:text-emerald-300 font-mono text-xs sm:text-sm font-semibold select-all">
                        {cleanCmd}
                      </code>
                      {desc && (
                        <span className="text-[11px] font-sans text-emerald-800 dark:text-emerald-300/90 bg-emerald-50 dark:bg-emerald-950/90 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/60 font-medium">
                          {desc}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      onClick={() => handleCopyAlt(cleanCmd, aIdx)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors flex items-center gap-1 text-xs font-mono border border-slate-200 dark:border-slate-700/60"
                      title="Copy clean command"
                    >
                      {copiedAlt === aIdx ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedAlt === aIdx ? "Copied" : "Copy"}</span>
                    </button>
                    <button
                      onClick={() => onUseAlternative && onUseAlternative(cleanCmd)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 dark:bg-emerald-500/20 hover:bg-emerald-500 dark:hover:bg-emerald-500/30 text-white dark:text-emerald-300 border border-transparent dark:border-emerald-500/50 hover:border-emerald-400 text-xs font-semibold font-mono transition-all shadow-md flex items-center gap-1.5 active:scale-95"
                      title="Load this alternative into the command terminal"
                    >
                      <span>Use in Terminal</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tools Telemetry Footer */}
      <div className="pt-3.5 mt-3 border-t border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-500 dark:bg-cyan-400 shadow-sm" />
          <span>Active Pipeline: {analysis.tools_used?.join(" • ") || analysis.model_used}</span>
        </div>
        <span className="truncate max-w-sm">Command: <strong className="text-slate-700 dark:text-slate-300">{analysis.command}</strong></span>
      </div>

    </div>
  );
}
