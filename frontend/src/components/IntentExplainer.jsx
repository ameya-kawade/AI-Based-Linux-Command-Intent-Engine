import React, { useState } from 'react';
import { 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  AlertOctagon, 
  Info, 
  FileText, 
  HardDrive, 
  ShieldAlert, 
  Lock, 
  Zap, 
  Copy, 
  Check, 
  Cpu, 
  Network,
  RotateCcw,
  ArrowRight,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

/**
 * Parses markdown inline styles like **bold**, *italic*, and `code`
 */
function parseInlineMarkdown(text) {
  if (!text) return text;
  
  // Split by inline code first
  const parts = text.split(/(`[^`]+`)/g);
  
  return parts.map((part, pIdx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      return (
        <code 
          key={pIdx} 
          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-obsidian-900 border border-slate-300 dark:border-slate-700/80 text-brand-700 dark:text-cyan-300 font-mono text-[13px] font-semibold select-all"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    
    // Split by **bold**
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    return boldParts.map((bPart, bIdx) => {
      if (bPart.startsWith('**') && bPart.endsWith('**') && bPart.length > 3) {
        return (
          <strong key={`${pIdx}-${bIdx}`} className="font-bold text-slate-900 dark:text-slate-100">
            {bPart.slice(2, -2)}
          </strong>
        );
      }
      
      // Split by *italic*
      const italicParts = bPart.split(/(\*[^*]+\*)/g);
      return italicParts.map((iPart, iIdx) => {
        if (iPart.startsWith('*') && iPart.endsWith('*') && iPart.length > 2) {
          return (
            <em key={`${pIdx}-${bIdx}-${iIdx}`} className="italic text-slate-700 dark:text-slate-300">
              {iPart.slice(1, -1)}
            </em>
          );
        }
        return iPart;
      });
    });
  });
}

/**
 * Inspects a line of text to see if it represents a structured category item
 * (e.g., "- **Filesystem**: Deletes /tmp/cache", "Security: No elevation required")
 */
function extractCategoryDetails(line) {
  const clean = line.replace(/^[-*•]\s*/, '').trim();
  const match = clean.match(/^(\*\*[^*]+\*\*|[A-Za-z0-9\s/]+)[:：]\s*(.+)$/);
  
  if (!match) return null;
  
  let label = match[1].replace(/\*\*/g, '').trim();
  let content = match[2].trim();
  let lowerLabel = label.toLowerCase();
  
  let icon = <Info className="w-4 h-4 text-brand-600 dark:text-cyan-400 shrink-0" />;
  let badgeStyle = "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700";
  let cardBorder = "border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/40";
  
  if (lowerLabel.includes('filesystem') || lowerLabel.includes('disk') || lowerLabel.includes('file')) {
    icon = <HardDrive className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
    badgeStyle = "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800/70";
    cardBorder = "border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20";
  } else if (lowerLabel.includes('security') || lowerLabel.includes('vulnerability') || lowerLabel.includes('exploit') || lowerLabel.includes('privilege')) {
    icon = <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />;
    badgeStyle = "bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800/70";
    cardBorder = "border-rose-200 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/20";
  } else if (lowerLabel.includes('operational') || lowerLabel.includes('system') || lowerLabel.includes('stability')) {
    icon = <Cpu className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />;
    badgeStyle = "bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800/70";
    cardBorder = "border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20";
  } else if (lowerLabel.includes('network') || lowerLabel.includes('socket') || lowerLabel.includes('port')) {
    icon = <Network className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />;
    badgeStyle = "bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800/70";
    cardBorder = "border-cyan-200 dark:border-cyan-900/40 bg-cyan-50/60 dark:bg-cyan-950/20";
  } else if (lowerLabel.includes('permission') || lowerLabel.includes('auth') || lowerLabel.includes('credential')) {
    icon = <Lock className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />;
    badgeStyle = "bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800/70";
    cardBorder = "border-purple-200 dark:border-purple-900/40 bg-purple-50/60 dark:bg-purple-950/20";
  } else if (lowerLabel.includes('reversib')) {
    icon = <RotateCcw className="w-4 h-4 text-brand-600 dark:text-cyan-400 shrink-0" />;
    badgeStyle = "bg-brand-100 dark:bg-cyan-950/80 text-brand-800 dark:text-cyan-300 border-brand-300 dark:border-cyan-800/70";
    cardBorder = "border-brand-200 dark:border-cyan-900/40 bg-brand-50/60 dark:bg-cyan-950/20";
  }
  
  return {
    label,
    content,
    icon,
    badgeStyle,
    cardBorder
  };
}

export default function IntentExplainer({ 
  intent = "", 
  reversibilityExplanation = "", 
  isReversible = true,
  risk = "SAFE",
  command = "" 
}) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  if (!intent) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(intent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Split raw text into paragraphs / lines
  const rawLines = intent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  
  let primarySummary = "";
  const structuredPoints = [];
  const standardParagraphs = [];

  rawLines.forEach((line, idx) => {
    const category = extractCategoryDetails(line);
    if (category) {
      structuredPoints.push(category);
    } else if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
      // Standard bullet point
      structuredPoints.push({
        label: "",
        content: line.replace(/^[-*•]\s*/, ''),
        icon: <ArrowRight className="w-3.5 h-3.5 text-brand-600 dark:text-cyan-400 shrink-0 mt-0.5" />,
        badgeStyle: "",
        cardBorder: "border-slate-200 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/30"
      });
    } else {
      if (idx === 0 && !primarySummary) {
        primarySummary = line;
      } else {
        standardParagraphs.push(line);
      }
    }
  });

  // If there was only one line and it had categories or plain text
  if (!primarySummary && rawLines.length > 0 && structuredPoints.length === 0) {
    primarySummary = rawLines[0];
  }

  return (
    <div className="my-4 rounded-2xl bg-white/95 dark:bg-gradient-to-b dark:from-obsidian-900/90 dark:to-obsidian-950/95 border border-slate-200 dark:border-slate-700/70 shadow-lg dark:shadow-2xl overflow-hidden backdrop-blur-xl transition-all">
      
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50 dark:bg-obsidian-950/70 border-b border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-brand-500/10 dark:bg-cyan-500/10 border border-brand-500/20 dark:border-cyan-500/30 text-brand-600 dark:text-cyan-400 shadow-sm">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <span>Natural Language Intent & Reasoning</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 dark:bg-cyan-950/80 border border-brand-200 dark:border-cyan-800 text-brand-700 dark:text-cyan-300 normal-case font-mono font-normal">
                Grounded Explanation
              </span>
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 text-xs font-mono transition-all"
            title="Copy plain explanation text"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-700/60 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 sm:p-5 space-y-4">
          
          {/* Primary Intent Synopsis */}
          {primarySummary && (
            <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-obsidian-950/80 border border-brand-200 dark:border-cyan-500/20 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-b from-brand-500 to-indigo-600 dark:from-cyan-400 dark:to-blue-500" />
              <div className="pl-1">
                <div className="text-[11px] font-mono uppercase tracking-wider text-brand-700 dark:text-cyan-400 font-semibold mb-1 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-brand-600 dark:text-cyan-400" />
                  <span>Executive Synopsis</span>
                </div>
                <p className="text-sm sm:text-base text-slate-800 dark:text-slate-100 font-normal leading-relaxed">
                  {parseInlineMarkdown(primarySummary)}
                </p>
              </div>
            </div>
          )}

          {/* Secondary Standard Paragraphs */}
          {standardParagraphs.length > 0 && (
            <div className="space-y-2">
              {standardParagraphs.map((para, pIdx) => (
                <p key={pIdx} className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-sans">
                  {parseInlineMarkdown(para)}
                </p>
              ))}
            </div>
          )}

          {/* Structured Impact Matrix (Extracted Categories & Breakdown Points) */}
          {structuredPoints.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Operational Impact & Risk Matrix</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {structuredPoints.map((point, idx) => (
                  <div 
                    key={idx} 
                    className={`p-3 rounded-xl border ${point.cardBorder} flex flex-col justify-between transition-all hover:border-slate-300 dark:hover:border-slate-700/90 shadow-sm`}
                  >
                    <div>
                      {point.label && (
                        <div className="flex items-center gap-1.5 mb-1.5">
                          {point.icon}
                          <span className={`text-[11px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border ${point.badgeStyle}`}>
                            {point.label}
                          </span>
                        </div>
                      )}
                      <div className={`text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-sans ${!point.label ? 'flex items-start gap-2' : ''}`}>
                        {!point.label && point.icon}
                        <div>{parseInlineMarkdown(point.content)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reversibility Rationale Footer Callout */}
          {reversibilityExplanation && (
            <div className={`flex items-start gap-2.5 p-3 rounded-xl border ${
              isReversible 
                ? "bg-cyan-50/80 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800/60 text-cyan-900 dark:text-cyan-200" 
                : "bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200"
            } text-xs leading-relaxed`}>
              <RotateCcw className={`w-4 h-4 shrink-0 mt-0.5 ${isReversible ? "text-cyan-600 dark:text-cyan-400" : "text-rose-600 dark:text-rose-400"}`} />
              <div className="space-y-0.5">
                <strong className="font-bold font-mono text-[11px] uppercase tracking-wider block">
                  {isReversible ? "Reversibility Guidance" : "Permanent Action Warning"}
                </strong>
                <p className="text-slate-700 dark:text-slate-300">{parseInlineMarkdown(reversibilityExplanation)}</p>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
