import React, { useState } from 'react';
import { OptimizationResult, SubjectAlternative } from '../deliverability/types';
import {
  Check,
  Copy,
  Sparkles,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  Code2,
  Eye,
  RefreshCw,
} from 'lucide-react';

interface OptimizationResultViewProps {
  result: OptimizationResult;
  onApplyOptimized: (subject: string, html: string) => void;
  onSelectSubjectAlternative: (subject: string) => void;
}

export const OptimizationResultView: React.FC<OptimizationResultViewProps> = ({
  result,
  onApplyOptimized,
  onSelectSubjectAlternative,
}) => {
  const [copiedSubject, setCopiedSubject] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'html' | 'changes'>('changes');

  const safeChanges = result.changes || [];
  const safeAppliedFixes = result.appliedFixes || [];
  const safeAlternativeSubjects = result.alternativeSubjects || (result as any).alternatives || [];
  const safeOptimizedSubject = result.optimizedSubject || (result as any).optimized?.subject || '';
  const safeOptimizedHtml = result.optimizedHtml || (result as any).optimized?.html || '';

  const handleCopySubject = () => {
    navigator.clipboard.writeText(safeOptimizedSubject);
    setCopiedSubject(true);
    setTimeout(() => setCopiedSubject(false), 2000);
  };

  const handleCopyHtml = () => {
    navigator.clipboard.writeText(safeOptimizedHtml);
    setCopiedHtml(true);
    setTimeout(() => setCopiedHtml(false), 2000);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl space-y-6" id="optimization-result-area">
      {/* Header with Score Delta & Deliverability Engine Metrics */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-bold text-zinc-100">Emailin-OPS Deliverability Optimization</h3>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
              {result.iterationsRun} iteration{result.iterationsRun === 1 ? '' : 's'}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Emailin-OPS Internal Deliverability Score &amp; safe quality improvements. Real deterministic heuristics with zero fabricated placement data.
          </p>
          {result.aiProviderName && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] text-zinc-400">Optimization Engine:</span>
              <span className="text-xs font-semibold text-zinc-200 bg-zinc-800/80 px-2.5 py-0.5 rounded border border-zinc-700">
                {result.aiProviderName}
              </span>
            </div>
          )}
        </div>

        {/* AI Confidence and Score Cards */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
          <div className="text-center px-2">
            <span className="text-[10px] text-zinc-500 uppercase block font-medium">Original Score</span>
            <span className="text-sm font-bold font-mono text-zinc-300">{result.originalScore}</span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-zinc-600 hidden sm:block" />
          <div className="text-center px-2">
            <span className="text-[10px] text-zinc-500 uppercase block font-medium">Optimized Score</span>
            <span className="text-base font-extrabold font-mono text-emerald-400">{result.optimizedScore}</span>
          </div>
          {result.scoreDelta > 0 && (
            <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">
              <TrendingUp className="w-3.5 h-3.5" />
              +{result.scoreDelta}
            </span>
          )}
          {result.aiConfidence && (
            <div className="text-center pl-2 border-l border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block font-medium">AI Confidence</span>
              <span
                className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  result.aiConfidence === 'high'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : result.aiConfidence === 'medium'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                }`}
              >
                {result.aiConfidence === 'fallback-rules' ? 'Local Rules' : result.aiConfidence}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Metrics Row: Detected Issues vs Fixed Issues */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-zinc-950/80 rounded-lg border border-zinc-800">
          <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider block">Detected Issues</span>
          <span className="text-lg font-bold font-mono text-amber-400">
            {result.detectedIssuesCount !== undefined ? result.detectedIssuesCount : safeChanges.length}
          </span>
          <span className="text-[10px] text-zinc-500 block mt-0.5">Found during baseline scan</span>
        </div>
        <div className="p-3 bg-zinc-950/80 rounded-lg border border-zinc-800">
          <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider block">Fixed Issues</span>
          <span className="text-lg font-bold font-mono text-emerald-400">
            {result.fixedIssuesCount !== undefined ? result.fixedIssuesCount : safeAppliedFixes.length}
          </span>
          <span className="text-[10px] text-zinc-500 block mt-0.5">Safely resolved in HTML/text</span>
        </div>
        <div className="p-3 bg-zinc-950/80 rounded-lg border border-zinc-800">
          <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider block">Iterations</span>
          <span className="text-lg font-bold font-mono text-zinc-200">{result.iterationsRun ?? 1}</span>
          <span className="text-[10px] text-zinc-500 block mt-0.5">Target threshold capped</span>
        </div>
        <div className="p-3 bg-zinc-950/80 rounded-lg border border-zinc-800">
          <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider block">Score Improvement</span>
          <span className="text-lg font-bold font-mono text-blue-400">
            {(result.scoreDelta ?? 0) > 0 ? `+${result.scoreDelta} pts` : 'Optimized'}
          </span>
          <span className="text-[10px] text-zinc-500 block mt-0.5">Regression-checked</span>
        </div>
      </div>

      {/* Applied Fixes Checklist */}
      {safeAppliedFixes.length > 0 && (
        <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-lg p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300 mb-2.5 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Automated Safe Quality Enhancements
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {safeAppliedFixes.map((fix, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs text-emerald-200/90 font-medium">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{fix}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FINAL SUBJECT AREA */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-300">Final Subject</label>
          <button
            onClick={handleCopySubject}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 border border-zinc-700 transition-colors"
          >
            {copiedSubject ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedSubject ? 'Copied Subject' : 'Copy Subject'}
          </button>
        </div>
        <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg font-mono text-sm text-zinc-100 font-medium">
          {safeOptimizedSubject}
        </div>
      </div>

      {/* 3 AI Alternative Subjects */}
      {safeAlternativeSubjects.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Alternative Subject Variations
          </div>
          <div className="grid grid-cols-1 gap-2">
            {safeAlternativeSubjects.map((alt, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 bg-zinc-950/60 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors"
              >
                <div className="pr-4">
                  <div className="text-xs font-semibold text-zinc-200 font-mono">{alt.subject}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">{alt.rationale}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono capitalize">
                    {alt.tone}
                  </span>
                  <button
                    onClick={() => onSelectSubjectAlternative(alt.subject)}
                    className="px-2.5 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded border border-zinc-700 font-medium transition-colors"
                  >
                    Select
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FINAL HTML AREA */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">Final HTML</span>
            <div className="flex items-center bg-zinc-950 rounded-md border border-zinc-800 p-0.5 text-xs">
              <button
                onClick={() => setActiveTab('changes')}
                className={`px-2.5 py-1 rounded ${activeTab === 'changes' ? 'bg-zinc-800 text-zinc-100 font-semibold' : 'text-zinc-400'}`}
              >
                Changes ({safeChanges.length})
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-2.5 py-1 rounded flex items-center gap-1 ${activeTab === 'preview' ? 'bg-zinc-800 text-zinc-100 font-semibold' : 'text-zinc-400'}`}
              >
                <Eye className="w-3 h-3" />
                Preview
              </button>
              <button
                onClick={() => setActiveTab('html')}
                className={`px-2.5 py-1 rounded flex items-center gap-1 ${activeTab === 'html' ? 'bg-zinc-800 text-zinc-100 font-semibold' : 'text-zinc-400'}`}
              >
                <Code2 className="w-3 h-3" />
                Code
              </button>
            </div>
          </div>

          <button
            onClick={handleCopyHtml}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 border border-zinc-700 transition-colors"
          >
            {copiedHtml ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedHtml ? 'Copied HTML' : 'Copy HTML'}
          </button>
        </div>

        {/* Tab view */}
        {activeTab === 'changes' && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-2 max-h-60 overflow-y-auto font-sans text-xs">
            {safeChanges.map((change, idx) => (
              <div key={idx} className="flex items-start gap-2 py-1 text-zinc-300">
                <span className="text-blue-400 font-mono shrink-0">•</span>
                <span className="font-medium">[{change.category}]</span>
                <span className="text-zinc-400">{change.description}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'html' && (
          <textarea
            readOnly
            value={safeOptimizedHtml}
            rows={8}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        )}

        {activeTab === 'preview' && (
          <div className="bg-white rounded-lg p-4 max-h-72 overflow-y-auto border border-zinc-800">
            <iframe
              title="Optimized Email Preview"
              srcDoc={safeOptimizedHtml}
              sandbox="allow-same-origin"
              className="w-full h-64 border-0"
            />
          </div>
        )}
      </div>

      {/* USE OPTIMIZED VERSION ACTION */}
      <div className="pt-3 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="text-xs text-zinc-400">
          Ready to populate your compose form and proceed through the send pipeline.
        </span>
        <button
          onClick={() => onApplyOptimized(safeOptimizedSubject, safeOptimizedHtml)}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-900/30 transition-colors"
          id="btn-use-optimized-version"
        >
          <RefreshCw className="w-4 h-4" />
          Use Optimized Version
        </button>
      </div>
    </div>
  );
};
