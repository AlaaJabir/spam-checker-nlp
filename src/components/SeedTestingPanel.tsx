import React, { useState } from 'react';
import { Mailbox, Send, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

interface SeedProviderInfo {
  name: string;
  displayName: string;
  configured: boolean;
  enabled?: boolean;
  isExternal?: boolean;
}

interface SeedTestingPanelProps {
  providers: SeedProviderInfo[];
  subject: string;
  html: string;
  fromEmail: string;
  onRunTest: (recipient?: string) => Promise<any>;
}

export const SeedTestingPanel: React.FC<SeedTestingPanelProps> = ({
  providers,
  onRunTest,
}) => {
  const [recipient, setRecipient] = useState('');
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState<any[]>([]);
  const [summary, setSummary] = useState<string>('');

  const handleTest = async () => {
    setLoading(true);
    try {
      const res = await onRunTest(recipient || undefined);
      if (res && res.tests) {
        setTestResults(res.tests);
        setSummary(res.summary);
      }
    } catch (err: any) {
      setSummary(`Error executing seed tests: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl space-y-4" id="seed-mailbox-testing-panel">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Mailbox className="w-5 h-5 text-blue-400" />
          <h3 className="text-base font-bold text-zinc-100">Seed Mailbox &amp; Placement Testing</h3>
        </div>
        <span className="text-xs text-zinc-500">Live API Provider Adapters</span>
      </div>

      <p className="text-xs text-zinc-400">
        Dispatches test payloads to configured mailboxes. Third-party testing services (Mail-Tester, GlockApps) are optional; Emailin-OPS uses its internal deliverability scoring engine by default.
      </p>

      {/* Configured Providers list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {(providers || []).map((p) => {
          const isDisabled = p.enabled === false;
          return (
            <div
              key={p.name}
              className="flex items-center justify-between p-3 rounded-lg bg-zinc-950 border border-zinc-800"
            >
              <div>
                <div className="text-xs font-semibold text-zinc-200">{p.displayName}</div>
                <div className="text-[11px] text-zinc-500 font-mono">
                  {p.name} {p.isExternal ? '• External Service' : '• Core Seed'}
                </div>
              </div>
              <div>
                {isDisabled ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-zinc-850 text-zinc-400 border border-zinc-750">
                    OPTIONAL (DISABLED)
                  </span>
                ) : p.configured ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" />
                    CONFIGURED
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                    NOT CONFIGURED
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Manual or Seed Test Dispatcher */}
      <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 space-y-3">
        <label className="text-xs font-semibold text-zinc-300 block">
          Custom Test Recipient or Seed Address (Optional)
        </label>
        <div className="flex gap-2">
          <input
            type="email"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="e.g. test-seed@yourdomain.com or leave blank for default"
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleTest}
            disabled={loading}
            className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {loading ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {loading ? 'Testing...' : 'Send Seed Test'}
          </button>
        </div>
      </div>

      {/* Test results output */}
      {summary && (
        <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs space-y-2">
          <div className="font-semibold text-zinc-300">{summary}</div>
          {testResults.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-zinc-400 pt-1 border-t border-zinc-850">
              <span className="font-mono text-zinc-300 uppercase">{r.provider}</span>
              <span className="flex items-center gap-1">
                {r.status === 'sent' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                {r.status === 'disabled' && (
                  <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                    DISABLED
                  </span>
                )}
                {r.status === 'not_configured' && <AlertCircle className="w-3.5 h-3.5 text-zinc-500" />}
                <span
                  className={
                    r.status === 'sent'
                      ? 'text-emerald-400 font-medium'
                      : r.status === 'disabled'
                      ? 'text-zinc-400'
                      : 'text-zinc-500'
                  }
                >
                  {r.status === 'disabled' ? 'Internal analysis used' : r.status}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
