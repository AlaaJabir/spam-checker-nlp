import React, { useEffect, useState } from 'react';
import { Eye, MousePointerClick, Activity, RefreshCw } from 'lucide-react';

interface TrackingMetrics {
  totalOpens: number;
  uniqueOpens: number;
  totalClicks: number;
  uniqueClicks: number;
  openRate: number;
  clickToOpenRate: number;
}

export const TrackingStats: React.FC = () => {
  const [metrics, setMetrics] = useState<TrackingMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tracking/metrics');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.metrics);
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl space-y-4" id="tracking-analytics-panel">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-400" />
          <h3 className="text-base font-bold text-zinc-100">Deduplicated Delivery &amp; Engagement</h3>
        </div>
        <button
          onClick={fetchMetrics}
          className="text-zinc-400 hover:text-zinc-200 p-1 rounded transition-colors"
          title="Refresh metrics"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <p className="text-xs text-zinc-400">
        Real-time telemetry recorded via 1x1 transparent open pixel and secure click tracking redirects. Unique metrics are strictly deduplicated by recipient ID.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1">
            <Eye className="w-3.5 h-3.5 text-blue-400" />
            Unique Opens
          </div>
          <div className="text-xl font-bold font-mono text-zinc-100">
            {metrics?.uniqueOpens ?? 0}
            <span className="text-[11px] font-normal text-zinc-500 ml-1">({metrics?.totalOpens ?? 0} total)</span>
          </div>
        </div>

        <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1">
            <MousePointerClick className="w-3.5 h-3.5 text-purple-400" />
            Unique Clicks
          </div>
          <div className="text-xl font-bold font-mono text-zinc-100">
            {metrics?.uniqueClicks ?? 0}
            <span className="text-[11px] font-normal text-zinc-500 ml-1">({metrics?.totalClicks ?? 0} total)</span>
          </div>
        </div>

        <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
          <div className="text-xs text-zinc-400 mb-1">Open Rate</div>
          <div className="text-xl font-bold font-mono text-emerald-400">
            {metrics?.openRate ?? 0}%
          </div>
        </div>

        <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
          <div className="text-xs text-zinc-400 mb-1">Click-to-Open (CTOR)</div>
          <div className="text-xl font-bold font-mono text-amber-400">
            {metrics?.clickToOpenRate ?? 0}%
          </div>
        </div>
      </div>
    </div>
  );
};
