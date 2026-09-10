import React from 'react';
import { CategoryScore, DeliverabilityScoreResult } from '../deliverability/types';
import { ShieldAlert, ShieldCheck, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';

interface ScoreCardProps {
  scoreResult: DeliverabilityScoreResult;
  onSelectCategory?: (category: string) => void;
  selectedCategory?: string;
}

export const ScoreCard: React.FC<ScoreCardProps> = ({
  scoreResult,
  onSelectCategory,
  selectedCategory,
}) => {
  const score = typeof scoreResult?.score === 'number' ? scoreResult.score : typeof scoreResult === 'number' ? scoreResult : 0;
  const risk = scoreResult?.risk || (score >= 85 ? 'low' : score >= 65 ? 'medium' : 'high');
  const canSend = scoreResult?.canSend !== undefined ? scoreResult.canSend : score >= 65;
  const blockers = scoreResult?.blockers || [];
  const warnings = scoreResult?.warnings || [];
  const categories = scoreResult?.categories || [];

  const getScoreColor = (val: number) => {
    if (val >= 85) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (val >= 65) return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
  };

  const getRiskBadge = (r: string) => {
    switch (r) {
      case 'low':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <ShieldCheck className="w-3.5 h-3.5" />
            LOW RISK
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5" />
            MEDIUM RISK
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            <ShieldAlert className="w-3.5 h-3.5" />
            HIGH RISK
          </span>
        );
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl" id="deliverability-score-card">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-zinc-800">
        <div className="flex items-center gap-6">
          <div
            className={`w-24 h-24 rounded-2xl border-2 flex flex-col items-center justify-center font-mono ${getScoreColor(
              score
            )}`}
          >
            <span className="text-3xl font-extrabold tracking-tight">{score}</span>
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-75">/ 100</span>
          </div>

          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-zinc-100 tracking-tight">Emailin-OPS Internal Deliverability Score</h2>
              {getRiskBadge(risk)}
            </div>
            <p className="text-xs text-zinc-400 mt-1 max-w-md">
              Calculated across 7 algorithmic categories using deterministic heuristics &amp; NLP analysis. Zero fabricated external inbox placement results.
            </p>
            <div className="flex items-center gap-4 mt-2 text-xs font-medium">
              <span className={`flex items-center gap-1 ${canSend ? 'text-emerald-400' : 'text-rose-400'}`}>
                {canSend ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                {canSend ? 'Ready to Send' : `${blockers.length} Critical Blocker(s)`}
              </span>
              <span className="text-zinc-500">•</span>
              <span className="text-zinc-400">{warnings.length} Optimization Warning(s)</span>
            </div>
          </div>
        </div>

        <div className="text-right text-xs text-zinc-400 hidden lg:block">
          <div className="font-semibold text-zinc-300 mb-1">Standard Sender Baseline</div>
          <div>Compliant with Gmail &amp; Yahoo 2024+ Mandates</div>
          <div className="text-zinc-500 text-[11px] mt-0.5">Never claims guaranteed inbox placement</div>
        </div>
      </div>

      {/* Categories Breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 pt-5">
        {Object.entries(categories).map(([key, rawCat]) => {
          const cat = rawCat as CategoryScore;
          const isSelected = selectedCategory === key;
          const pct = Math.round((cat.score / cat.maxScore) * 100);

          return (
            <button
              key={key}
              onClick={() => onSelectCategory && onSelectCategory(key)}
              className={`text-left p-3 rounded-lg border transition-all ${
                isSelected
                  ? 'bg-zinc-800/90 border-blue-500 shadow-md'
                  : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 mb-1.5">
                <span className="truncate">{cat.name.split(' ')[0]}</span>
                <span className="font-mono font-bold text-zinc-200">{cat.score}/{cat.maxScore}</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1">
                <div
                  className={`h-full rounded-full ${
                    pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-[10px] text-zinc-500 flex items-center justify-between">
                <span>{cat.weightPercentage}% wt</span>
                <ChevronRight className={`w-3 h-3 ${isSelected ? 'text-blue-400' : 'text-zinc-600'}`} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
