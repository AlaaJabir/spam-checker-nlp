import React, { useState } from 'react';
import { DeliverabilityIssue, IssueSeverity } from '../deliverability/types';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  Filter,
  Wrench,
  HelpCircle,
} from 'lucide-react';

interface IssuesListProps {
  issues: DeliverabilityIssue[];
  selectedCategory?: string;
  onClearCategory?: () => void;
}

export const IssuesList: React.FC<IssuesListProps> = ({
  issues = [],
  selectedCategory,
  onClearCategory,
}) => {
  const [filter, setFilter] = useState<'all' | 'blocker' | 'warning' | 'autoFixed'>('all');

  const safeIssues = Array.isArray(issues) ? issues : [];
  const filteredIssues = safeIssues.filter((issue) => {
    if (selectedCategory && issue.category !== selectedCategory) {
      return false;
    }
    if (filter === 'blocker') return issue.severity === 'blocker';
    if (filter === 'warning') return issue.severity === 'warning';
    if (filter === 'autoFixed') return issue.autoFixed;
    return true;
  });

  const getSeverityBadge = (severity: IssueSeverity, autoFixed?: boolean) => {
    if (autoFixed) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3" />
          AUTO-FIXED
        </span>
      );
    }
    switch (severity) {
      case 'blocker':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3 h-3" />
            BLOCKER
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3" />
            WARNING
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Info className="w-3 h-3" />
            INFO
          </span>
        );
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl" id="deliverability-issues-panel">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold text-zinc-100">Diagnostics &amp; Health Checks</h3>
          <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full font-mono">
            {filteredIssues.length} issue{filteredIssues.length === 1 ? '' : 's'}
          </span>
          {selectedCategory && (
            <button
              onClick={onClearCategory}
              className="text-xs text-blue-400 hover:text-blue-300 underline ml-2"
            >
              Showing {selectedCategory} (Clear)
            </button>
          )}
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
          <Filter className="w-3.5 h-3.5 text-zinc-500 ml-1.5 mr-0.5" />
          <button
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              filter === 'all' ? 'bg-zinc-800 text-zinc-100 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('blocker')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              filter === 'blocker' ? 'bg-rose-900/60 text-rose-200 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Blockers
          </button>
          <button
            onClick={() => setFilter('warning')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              filter === 'warning' ? 'bg-amber-900/60 text-amber-200 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Warnings
          </button>
          <button
            onClick={() => setFilter('autoFixed')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              filter === 'autoFixed' ? 'bg-emerald-900/60 text-emerald-200 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Auto-Fixed
          </button>
        </div>
      </div>

      {/* Issues list */}
      <div className="divide-y divide-zinc-800/60 mt-2">
        {filteredIssues.length === 0 ? (
          <div className="py-8 text-center text-zinc-500 text-sm">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500/50" />
            No issues found in this category. All standard checks passed.
          </div>
        ) : (
          filteredIssues.map((issue) => (
            <div key={issue.id} className="py-4 hover:bg-zinc-800/20 px-2 rounded-lg transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {getSeverityBadge(issue.severity, issue.autoFixed)}
                  <span className="text-xs uppercase tracking-wider text-zinc-500 font-mono font-medium">
                    [{issue.category}]
                  </span>
                </div>
                <span className="text-[11px] font-mono text-zinc-500">{issue.code}</span>
              </div>

              <div className="mt-2 text-sm font-semibold text-zinc-200">{issue.problem}</div>

              <div className="mt-2 text-xs text-zinc-400 grid grid-cols-1 md:grid-cols-2 gap-3 bg-zinc-950/40 p-3 rounded-md border border-zinc-800/50">
                <div>
                  <div className="flex items-center gap-1 font-semibold text-zinc-300 mb-1">
                    <HelpCircle className="w-3.5 h-3.5 text-zinc-400" />
                    Why It Matters
                  </div>
                  <div className="text-zinc-400 leading-relaxed">{issue.whyItMatters}</div>
                </div>

                <div>
                  <div className="flex items-center gap-1 font-semibold text-zinc-300 mb-1">
                    <Wrench className="w-3.5 h-3.5 text-zinc-400" />
                    Recommended Fix
                  </div>
                  <div className="text-zinc-400 leading-relaxed">{issue.recommendedFix}</div>
                </div>
              </div>

              {issue.autoFixed && issue.fixedDescription && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Auto-Optimization Action: {issue.fixedDescription}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
