import React, { useEffect, useState } from 'react';
import {
  Mail,
  Send,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Activity,
  Code2,
  Eye,
  RefreshCw,
  Globe,
  Lock,
  FileText,
  Server,
  Layers,
  CheckCircle2,
  Mailbox,
  Check,
  ExternalLink,
} from 'lucide-react';

import { ScoreCard } from './components/ScoreCard';
import { IssuesList } from './components/IssuesList';
import { OptimizationResultView } from './components/OptimizationResultView';
import { SeedTestingPanel } from './components/SeedTestingPanel';
import { TrackingStats } from './components/TrackingStats';
import { SAMPLE_EMAILS, SampleEmail } from './data/sampleEmails';
import { fetchJsonSafely } from './utils/api';
import {
  DeliverabilityScoreResult,
  FullDeliverabilityAnalysis,
  OptimizationResult,
} from './deliverability/types';

export default function App() {
  // Form State
  const [subject, setSubject] = useState(SAMPLE_EMAILS[0].subject);
  const [fromEmail, setFromEmail] = useState(SAMPLE_EMAILS[0].fromEmail);
  const [fromName, setFromName] = useState('Campaign Operator');
  const [replyTo, setReplyTo] = useState('');
  const [recipient, setRecipient] = useState('deliverability-test@example.com');
  const [html, setHtml] = useState(SAMPLE_EMAILS[0].html);
  const [enableTracking, setEnableTracking] = useState(true);
  const [mtaProvider, setMtaProvider] = useState<'kumomta' | 'ses'>('kumomta');

  // UI Navigation & View State
  const [editorTab, setEditorTab] = useState<'code' | 'preview'>('code');
  const [resultsTab, setResultsTab] = useState<'score' | 'issues' | 'optimizer' | 'auth' | 'seed' | 'tracking'>('score');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);

  // Operation States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Results
  const [analysis, setAnalysis] = useState<FullDeliverabilityAnalysis | null>(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [sendResult, setSendResult] = useState<any | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Providers metadata
  const [providersMeta, setProvidersMeta] = useState<{
    seedProviders: { name: string; displayName: string; configured: boolean; enabled?: boolean; isExternal?: boolean }[];
    mtaProviders: any[];
    mailProvider?: string;
    nlpProvider: string;
    aiAvailable: boolean;
    enableMailTester?: boolean;
    enableGlockApps?: boolean;
    maxIterations?: number;
    targetScore?: number;
  }>({
    seedProviders: [],
    mtaProviders: [],
    mailProvider: 'kumomta',
    nlpProvider: 'gemini',
    aiAvailable: false,
    enableMailTester: false,
    enableGlockApps: false,
    maxIterations: 3,
    targetScore: 90,
  });

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Load provider configurations on mount
  useEffect(() => {
    fetch('/api/deliverability/providers')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setProvidersMeta(data);
          if (data.mailProvider === 'ses') {
            setMtaProvider('ses');
          } else {
            setMtaProvider('kumomta');
          }
        }
      })
      .catch(() => {});
  }, []);

  // Preset Template Loader
  const handleLoadSample = (sample: SampleEmail) => {
    setSubject(sample.subject);
    setFromEmail(sample.fromEmail);
    setHtml(sample.html);
    setAnalysis(null);
    setOptimization(null);
    setSendResult(null);
    showToast(`Loaded template: "${sample.name}"`, 'info');
  };

  // 1. Analyze Action
  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setSendResult(null);
    try {
      const data = await fetchJsonSafely<FullDeliverabilityAnalysis>(
        '/api/deliverability/analyze',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject,
            html,
            fromEmail,
            replyTo: replyTo || undefined,
            trackingEnabled: enableTracking,
          }),
        },
        'Analysis failed'
      );

      // Ensure score is structured with full arrays even if older API formats are received
      if (typeof data.score === 'number') {
        const rawScore = data.score;
        data.score = {
          score: rawScore,
          risk: (data as any).risk || (rawScore >= 85 ? 'low' : rawScore >= 65 ? 'moderate' : 'high'),
          canSend: (data as any).canSend ?? (rawScore >= 65),
          blockers: (data as any).blockers || [],
          warnings: (data as any).warnings || [],
          info: (data as any).info || [],
          categories: (data as any).categories || ({} as any),
          recommendations: (data as any).recommendations || [],
          checks: (data as any).checks || ({} as any),
        };
      } else if (data.score) {
        data.score.blockers = data.score.blockers || [];
        data.score.warnings = data.score.warnings || [];
        data.score.info = data.score.info || [];
        data.score.recommendations = data.score.recommendations || [];
        data.score.categories = data.score.categories || ({} as any);
        data.score.checks = data.score.checks || ({} as any);
      }
      setAnalysis(data);
      setResultsTab('score');
      showToast('Deliverability analysis complete', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 2. Safe Optimize Action
  const handleOptimize = async () => {
    setIsOptimizing(true);
    setSendResult(null);
    try {
      const optData = await fetchJsonSafely<OptimizationResult>(
        '/api/deliverability/optimize',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject,
            html,
            fromEmail,
            replyTo: replyTo || undefined,
            options: {
              preserveTracking: enableTracking,
            },
          }),
        },
        'Optimization failed'
      );
      setOptimization(optData);

      // Also refresh analysis with optimized version for instant score view
      const targetSubject = optData.optimizedSubject || (optData as any).optimized?.subject || subject;
      const targetHtml = optData.optimizedHtml || (optData as any).optimized?.html || html;

      try {
        const reAnalysis = await fetchJsonSafely<FullDeliverabilityAnalysis>(
          '/api/deliverability/analyze',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subject: targetSubject,
              html: targetHtml,
              fromEmail,
            }),
          },
          'Post-optimization analysis failed'
        );
        if (typeof reAnalysis.score === 'number') {
          const rawScore = reAnalysis.score;
          reAnalysis.score = {
            score: rawScore,
            risk: (reAnalysis as any).risk || (rawScore >= 85 ? 'low' : rawScore >= 65 ? 'moderate' : 'high'),
            canSend: (reAnalysis as any).canSend ?? (rawScore >= 65),
            blockers: (reAnalysis as any).blockers || [],
            warnings: (reAnalysis as any).warnings || [],
            info: (reAnalysis as any).info || [],
            categories: (reAnalysis as any).categories || ({} as any),
            recommendations: (reAnalysis as any).recommendations || [],
            checks: (reAnalysis as any).checks || ({} as any),
          };
        } else if (reAnalysis.score) {
          reAnalysis.score.blockers = reAnalysis.score.blockers || [];
          reAnalysis.score.warnings = reAnalysis.score.warnings || [];
          reAnalysis.score.info = reAnalysis.score.info || [];
          reAnalysis.score.recommendations = reAnalysis.score.recommendations || [];
          reAnalysis.score.categories = reAnalysis.score.categories || ({} as any);
          reAnalysis.score.checks = reAnalysis.score.checks || ({} as any);
        }
        setAnalysis(reAnalysis);
      } catch {
        // Ignored if re-analysis fails
      }

      setResultsTab('optimizer');
      showToast(`Safe optimization finished! (+${optData.scoreDelta} pts)`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsOptimizing(false);
    }
  };

  // 3. Combined "Analyze & Optimize" Primary Action
  const handleAnalyzeAndOptimize = async () => {
    await handleAnalyze();
    await handleOptimize();
  };

  // 4. One-Click "Use Optimized Version"
  const handleApplyOptimized = (newSubject: string, newHtml: string) => {
    setSubject(newSubject);
    setHtml(newHtml);
    showToast('Applied optimized subject and HTML directly to compose form!', 'success');
    // Scroll smoothly to compose editor
    const editor = document.getElementById('compose-editor-section');
    if (editor) {
      editor.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // 5. Send Campaign Pipeline
  const handleSend = async () => {
    setIsSending(true);
    setSendResult(null);
    try {
      const data = await fetchJsonSafely(
        '/api/send',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject,
            html,
            fromEmail,
            recipient,
            enableTracking,
            provider: mtaProvider,
          }),
        },
        'Send rejected by pre-send deliverability validation'
      );

      setSendResult(data);
      showToast('Campaign successfully transmitted through MTA pipeline!', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
      setSendResult({ success: false, error: err.message });
    } finally {
      setIsSending(false);
    }
  };

  // Calculate quick metrics for editor
  const htmlBytes = new Blob([html]).size;
  const htmlKb = (htmlBytes / 1024).toFixed(1);
  const isClippingRisk = htmlBytes > 95 * 1024;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
          <div
            className={`px-4 py-3 rounded-xl shadow-2xl border text-sm flex items-center gap-2.5 font-medium ${
              toastMessage.type === 'success'
                ? 'bg-emerald-950 border-emerald-500/40 text-emerald-200'
                : toastMessage.type === 'error'
                ? 'bg-rose-950 border-rose-500/40 text-rose-200'
                : 'bg-zinc-900 border-zinc-700 text-zinc-200'
            }`}
          >
            {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            {toastMessage.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400" />}
            {toastMessage.type === 'info' && <Activity className="w-4 h-4 text-blue-400" />}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Navigation Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-base text-zinc-100">Emailin-OPS</span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                  Deliverability Optimizer
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-none mt-0.5">
                AI/NLP Quality, ISP Compliance &amp; KumoMTA Pipeline
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="hidden md:flex items-center gap-2 text-zinc-400">
              <Server className="w-3.5 h-3.5 text-zinc-500" />
              <span>MTA:</span>
              <span className="text-zinc-200 uppercase font-semibold">
                {mtaProvider} {mtaProvider === 'kumomta' ? '(Primary)' : '(Cloud)'}
              </span>
            </div>
            <div className="hidden md:flex items-center gap-2 text-zinc-400">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>NLP:</span>
              <span className="text-zinc-200 font-semibold">
                {providersMeta.nlpProvider === 'gemini'
                  ? providersMeta.aiAvailable
                    ? 'Gemini 2.5 (Free Tier)'
                    : 'Local Rules (Gemini offline)'
                  : providersMeta.nlpProvider === 'openai'
                  ? 'OpenAI (Legacy)'
                  : 'Local Rules (Deterministic)'}
              </span>
            </div>
            <span className="h-4 w-px bg-zinc-800 hidden md:block" />
            <button
              onClick={() => setResultsTab('tracking')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 transition-colors"
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Telemetry</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Sample Templates Switcher */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900 border border-zinc-800">
          <div className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-zinc-500" />
            <span>Load Test Email Samples:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {SAMPLE_EMAILS.map((sample) => (
              <button
                key={sample.id}
                onClick={() => handleLoadSample(sample)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${sample.badgeColor}`}
              >
                {sample.name}
              </button>
            ))}
          </div>
        </div>

        {/* Compose Form & HTML Editor Section */}
        <div
          id="compose-editor-section"
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl"
        >
          {/* Left Column: Envelope Metadata */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                Envelope &amp; Addressing
              </h2>
              <span className="text-[11px] text-zinc-500 font-mono">RFC 5322</span>
            </div>

            {/* Subject Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-zinc-300">Subject Line</label>
                <span
                  className={`font-mono text-[11px] ${
                    subject.length > 70 ? 'text-amber-400' : 'text-zinc-500'
                  }`}
                >
                  {subject.length} chars
                </span>
              </div>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter campaign subject line..."
                className="w-full bg-zinc-950 border border-zinc-750 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
                id="input-email-subject"
              />
            </div>

            {/* From Email & From Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">From Email (Domain)</label>
                <input
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  placeholder="sender@yourdomain.com"
                  className="w-full bg-zinc-950 border border-zinc-750 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Sender Display Name</label>
                <input
                  type="text"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="Company News"
                  className="w-full bg-zinc-950 border border-zinc-750 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Recipient & Reply-To */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Recipient Email</label>
                <input
                  type="email"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full bg-zinc-950 border border-zinc-750 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Reply-To (Optional)</label>
                <input
                  type="email"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  placeholder="support@yourdomain.com"
                  className="w-full bg-zinc-950 border border-zinc-750 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Campaign Options */}
            <div className="pt-3 border-t border-zinc-800/80 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-medium">MTA Egress Daemon:</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMtaProvider('kumomta')}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition-colors ${
                      mtaProvider === 'kumomta'
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    KumoMTA (Primary Self-Hosted)
                  </button>
                  <button
                    onClick={() => setMtaProvider('ses')}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition-colors ${
                      mtaProvider === 'ses'
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    AWS SES (Optional Cloud)
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300 select-none">
                <input
                  type="checkbox"
                  checked={enableTracking}
                  onChange={(e) => setEnableTracking(e.target.checked)}
                  className="rounded border-zinc-700 text-blue-600 focus:ring-0 focus:ring-offset-0 bg-zinc-950"
                />
                <span>Inject 1x1 Open Pixel &amp; Wrap Click Tracking URLs</span>
              </label>
            </div>

            {/* Primary Action Buttons */}
            <div className="pt-4 space-y-2.5">
              <button
                onClick={handleAnalyzeAndOptimize}
                disabled={isAnalyzing || isOptimizing}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                id="btn-analyze-optimize-primary"
              >
                {isAnalyzing || isOptimizing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>Analyze &amp; Optimize Deliverability</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs flex items-center justify-center gap-1.5 border border-zinc-700 transition-colors disabled:opacity-50"
                  id="btn-quick-scan"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                  <span>Scan Only</span>
                </button>

                <button
                  onClick={handleSend}
                  disabled={isSending || Boolean(analysis?.score && analysis.score.canSend === false)}
                  className={`py-2 px-3 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 ${
                    analysis?.score && analysis.score.canSend === false
                      ? 'bg-rose-950/40 text-rose-300 border border-rose-800/60 cursor-not-allowed'
                      : 'bg-emerald-700 hover:bg-emerald-600 text-white shadow-md shadow-emerald-900/20'
                  }`}
                  id="btn-send-mta"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSending ? 'Sending...' : 'Send Campaign'}</span>
                </button>
              </div>

              {analysis?.score && analysis.score.canSend === false && (
                <div className="text-[11px] text-rose-400 flex items-center gap-1 mt-1">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  <span>Pre-send gate locked: Fix critical blockers before launch.</span>
                </div>
              )}
            </div>

            {/* Send Pipeline Feedback */}
            {sendResult && (
              <div
                className={`p-3 rounded-xl border text-xs space-y-1 ${
                  sendResult.success
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500/30 text-rose-200'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  {sendResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                  <span>{sendResult.success ? 'Campaign Dispatched' : 'Transmission Prevented'}</span>
                </div>
                {sendResult.messageId && (
                  <div className="font-mono text-[11px] text-zinc-400">ID: {sendResult.messageId}</div>
                )}
                <div className="text-zinc-300 text-[11px]">{sendResult.note || sendResult.error}</div>
              </div>
            )}
          </div>

          {/* Right Column: HTML Editor & Preview */}
          <div className="lg:col-span-7 flex flex-col space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditorTab('code')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                    editorTab === 'code' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  HTML Source
                </button>
                <button
                  onClick={() => setEditorTab('preview')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                    editorTab === 'preview' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Sanitized Preview
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono">
                <span
                  className={`${
                    isClippingRisk ? 'text-rose-400 font-bold' : 'text-zinc-400'
                  }`}
                >
                  {htmlKb} KB {isClippingRisk && '(Gmail Clips > 102KB)'}
                </span>
              </div>
            </div>

            {editorTab === 'code' ? (
              <textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                placeholder="Paste your raw HTML email template code here..."
                rows={18}
                className="w-full flex-1 bg-zinc-950 border border-zinc-750 rounded-xl p-4 font-mono text-xs text-zinc-200 focus:outline-none focus:border-blue-500 leading-relaxed resize-y"
                id="textarea-email-html"
              />
            ) : (
              <div className="w-full flex-1 bg-white rounded-xl border border-zinc-750 overflow-hidden min-h-[380px]">
                <iframe
                  title="Sandboxed Email Preview"
                  srcDoc={html}
                  sandbox="allow-same-origin"
                  className="w-full h-full min-h-[380px] border-0"
                />
              </div>
            )}
          </div>
        </div>

        {/* Deliverability Dashboard Tabs (Rendered when analysis or optimization is ready) */}
        {analysis && (
          <div className="space-y-6 pt-2" id="deliverability-results-section">
            {/* Navigation Pills */}
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3">
              <button
                onClick={() => setResultsTab('score')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                  resultsTab === 'score'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Score &amp; Overview
              </button>

              <button
                onClick={() => setResultsTab('issues')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                  resultsTab === 'issues'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Issues ({((analysis.score?.blockers?.length || 0) + (analysis.score?.warnings?.length || 0))})
              </button>

              <button
                onClick={() => setResultsTab('optimizer')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                  resultsTab === 'optimizer'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Safe Optimization {optimization && `(+${optimization.scoreDelta})`}
              </button>

              <button
                onClick={() => setResultsTab('auth')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                  resultsTab === 'auth'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                Domain DNS Auth
              </button>

              <button
                onClick={() => setResultsTab('seed')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                  resultsTab === 'seed'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                <Mailbox className="w-3.5 h-3.5" />
                ISP Seed Placement
              </button>

              <button
                onClick={() => setResultsTab('tracking')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                  resultsTab === 'tracking'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                Analytics &amp; Opens
              </button>
            </div>

            {/* TAB 1: SCORE & OVERVIEW */}
            {resultsTab === 'score' && (
              <div className="space-y-6">
                <ScoreCard
                  scoreResult={analysis.score}
                  selectedCategory={selectedCategory}
                  onSelectCategory={(cat) => {
                    setSelectedCategory(cat);
                    setResultsTab('issues');
                  }}
                />

                {/* Recommendations Callout */}
                {(analysis.score?.recommendations?.length || 0) > 0 && (
                  <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                      Deliverability Action Items
                    </h3>
                    <div className="space-y-1.5">
                      {(analysis.score?.recommendations || []).map((rec, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                          <span className="text-blue-400 font-bold">•</span>
                          <span>{rec}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: ISSUES & DIAGNOSTICS */}
            {resultsTab === 'issues' && (
              <IssuesList
                issues={[
                  ...(analysis.score?.blockers || []),
                  ...(analysis.score?.warnings || []),
                  ...(analysis.score?.info || []),
                ]}
                selectedCategory={selectedCategory}
                onClearCategory={() => setSelectedCategory(undefined)}
              />
            )}

            {/* TAB 3: OPTIMIZATION & DIFF */}
            {resultsTab === 'optimizer' && (
              <div>
                {optimization ? (
                  <OptimizationResultView
                    result={optimization}
                    onApplyOptimized={handleApplyOptimized}
                    onSelectSubjectAlternative={(newSub) => {
                      setSubject(newSub);
                      showToast(`Updated subject to: "${newSub}"`, 'info');
                    }}
                  />
                ) : (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-4">
                    <Sparkles className="w-10 h-10 text-blue-400 mx-auto" />
                    <div>
                      <h3 className="text-base font-bold text-zinc-100">Safe Deliverability Optimization</h3>
                      <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                        Applies safe code cleanup, accessibility attributes, spam word softening, and ensures compliant unsubscribe footers without altering brand message.
                      </p>
                    </div>
                    <button
                      onClick={handleOptimize}
                      disabled={isOptimizing}
                      className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm inline-flex items-center gap-2"
                    >
                      {isOptimizing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Run Safe Optimization
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: DOMAIN AUTHENTICATION */}
            {resultsTab === 'auth' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                  <div>
                    <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                      <Globe className="w-4 h-4 text-blue-400" />
                      Domain DNS Diagnostics: {analysis.authenticationAnalysis.domain}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Live DNS queries for SPF, DKIM, and DMARC alignment.
                    </p>
                  </div>
                  <div className="font-mono text-xs">
                    Score: <span className="font-bold text-emerald-400">{analysis.authenticationAnalysis.score}/100</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* SPF Record */}
                  <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-zinc-200">SPF Record</span>
                      <span
                        className={`font-mono text-[11px] px-2 py-0.5 rounded ${
                          analysis.authenticationAnalysis.spf.status === 'pass'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {analysis.authenticationAnalysis.spf.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400 font-mono break-all bg-zinc-900/60 p-2 rounded">
                      {analysis.authenticationAnalysis.spf.record || 'No SPF record discovered'}
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      Authorizes sending mail servers on behalf of your domain name.
                    </p>
                  </div>

                  {/* DMARC Record */}
                  <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-zinc-200">DMARC Policy</span>
                      <span
                        className={`font-mono text-[11px] px-2 py-0.5 rounded ${
                          analysis.authenticationAnalysis.dmarc.status === 'pass'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {analysis.authenticationAnalysis.dmarc.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400 font-mono break-all bg-zinc-900/60 p-2 rounded">
                      {analysis.authenticationAnalysis.dmarc.record || 'No DMARC record discovered'}
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      Enforces reject/quarantine policy for unauthenticated spoofing attempts.
                    </p>
                  </div>

                  {/* DKIM Record */}
                  <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-zinc-200">DKIM Key Signature</span>
                      <span
                        className={`font-mono text-[11px] px-2 py-0.5 rounded ${
                          analysis.authenticationAnalysis.dkim.status === 'pass'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {analysis.authenticationAnalysis.dkim.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400 font-mono break-all bg-zinc-900/60 p-2 rounded">
                      {analysis.authenticationAnalysis.dkim.record || 'Awaiting selector signing in MTA'}
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      Cryptographic signature validating message integrity in transit.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: ISP SEED PLACEMENT */}
            {resultsTab === 'seed' && (
              <SeedTestingPanel
                providers={providersMeta.seedProviders}
                subject={subject}
                html={html}
                fromEmail={fromEmail}
                onRunTest={async (recipientAddress) => {
                  return fetchJsonSafely(
                    '/api/deliverability/test',
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        subject,
                        html,
                        fromEmail,
                        recipient: recipientAddress,
                      }),
                    },
                    'Seed testing failed'
                  );
                }}
              />
            )}

            {/* TAB 6: TRACKING & TELEMETRY */}
            {resultsTab === 'tracking' && <TrackingStats />}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-850 py-6 text-center text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>Emailin-OPS Deliverability &amp; Infrastructure Optimization Console</span>
          <span className="text-[11px] text-zinc-500">
            Internal Quality Score • Never claims guaranteed inbox placement
          </span>
        </div>
      </footer>
    </div>
  );
}
