import { test, describe } from 'node:test';
import assert from 'node:assert';

import { analyzeSubject } from './analyzer/subjectAnalyzer';
import { analyzeHtml } from './analyzer/htmlAnalyzer';
import { analyzeContent } from './analyzer/contentAnalyzer';
import { analyzeLinks } from './analyzer/linkAnalyzer';
import { analyzeCompliance } from './analyzer/complianceAnalyzer';
import { optimizeHtml } from './optimizer/htmlOptimizer';
import { optimizeSubject } from './optimizer/subjectOptimizer';
import { globalDeliverabilityEngine } from './pipeline/deliverabilityEngine';
import { isSafePublicUrl, sanitizeEmailHtml } from './security/sanitizer';

describe('Deliverability Engine Unit & Safety Tests', () => {
  test('Subject Analyzer detects urgency and excessive punctuation', () => {
    const res = analyzeSubject('URGENT!!! BUY NOW AND CLAIM 100% FREE CASH $$$');
    assert.strictEqual(res.isAllCaps, true);
    assert.strictEqual(res.excessivePunctuation, true);
    assert.ok(res.urgencyTriggers.length > 0);
    assert.ok(res.score < 50, 'Spammy subject should have low score');
  });

  test('HTML Analyzer detects hidden cloaked elements and zero-width spaces', () => {
    const badHtml = `<div>Normal text\u200B</div><div style="display:none;">hidden spam keywords</div>`;
    const res = analyzeHtml(badHtml);
    assert.strictEqual(res.zeroWidthCharactersFound, true);
    assert.ok(res.hiddenElements.length > 0);
    assert.ok(res.issues.some((i) => i.code === 'HTML_HIDDEN_CONTENT'));
  });

  test('HTML Sanitizer removes dangerous scripts and iframes (Security & SSRF)', () => {
    const malicious = `<div>Hello<script>alert(1)</script><iframe src="http://evil.com"></iframe><a href="javascript:void(0)">Click</a></div>`;
    const cleaned = sanitizeEmailHtml(malicious);
    assert.strictEqual(cleaned.includes('<script>'), false);
    assert.strictEqual(cleaned.includes('<iframe>'), false);
    assert.strictEqual(cleaned.includes('javascript:'), false);
  });

  test('SSRF Protection blocks loopback, private networks, and internal cloud metadata', () => {
    assert.strictEqual(isSafePublicUrl('http://127.0.0.1:8080/admin').safe, false);
    assert.strictEqual(isSafePublicUrl('http://localhost:3000').safe, false);
    assert.strictEqual(isSafePublicUrl('http://169.254.169.254/latest/meta-data/').safe, false);
    assert.strictEqual(isSafePublicUrl('http://10.0.0.1/internal').safe, false);
    assert.strictEqual(isSafePublicUrl('https://google.com').safe, true);
  });

  test('Link Analyzer detects HTTP links and text-url phishing mismatches', () => {
    const htmlWithPhishing = `<p><a href="http://evil-spoof.com/login">https://paypal.com/security-login</a></p>`;
    const res = analyzeLinks(htmlWithPhishing);
    assert.strictEqual(res.mismatchedLinks.length, 1);
    assert.strictEqual(res.nonHttpsLinks.length, 1);
    assert.ok(res.issues.some((i) => i.code === 'LINKS_ANCHOR_MISMATCH'));
  });

  test('Compliance Analyzer verifies unsubscribe and physical address', () => {
    const compliant = `<div>Hello <p>123 Innovation Way, SF CA 94105</p><a href="https://example.com/unsub">Unsubscribe here</a></div>`;
    const resCompliant = analyzeCompliance(compliant);
    assert.strictEqual(resCompliant.hasUnsubscribeLink, true);

    const nonCompliant = `<div>Hello buy this now</div>`;
    const resNonCompliant = analyzeCompliance(nonCompliant);
    assert.strictEqual(resNonCompliant.hasUnsubscribeLink, false);
    assert.ok(resNonCompliant.issues.some((i) => i.code === 'COMPLIANCE_MISSING_UNSUBSCRIBE'));
  });

  test('Safe HTML Optimizer removes cloaking and adds missing alt and doctype', () => {
    const raw = `<div style="display:none">hidden</div><img src="http://example.com/pic.jpg">`;
    const opt = optimizeHtml(raw);
    assert.strictEqual(opt.optimizedHtml.includes('display:none'), false);
    assert.strictEqual(opt.optimizedHtml.includes('alt="'), true);
    assert.strictEqual(opt.optimizedHtml.includes('<!DOCTYPE html>'), true);
    assert.ok(opt.changes.length > 0);
  });

  test('Subject Optimizer title-cases and strips aggressive punctuation', () => {
    const raw = 'URGENT!!! PLEASE RESPOND IMMEDIATELY $$$';
    const opt = optimizeSubject(raw);
    assert.strictEqual(opt.optimizedSubject.includes('!!!'), false);
    assert.strictEqual(opt.optimizedSubject.includes('$$$'), false);
    assert.strictEqual(opt.alternatives.length >= 3, true);
  });

  test('Safe Optimizer Regression Prevention: Score never decreases', async () => {
    const sample = `
      <h1>Special Announcement</h1>
      <p>Here is our monthly customer digest with helpful tips.</p>
      <a href="https://example.com/blog">Read Blog</a>
      <p>123 Corporate Blvd, New York NY 10001</p>
      <a href="https://example.com/unsub">Unsubscribe</a>
    `;

    const result = await globalDeliverabilityEngine.optimize({
      subject: 'Monthly Digest: Customer Tips & Updates',
      html: sample,
      fromEmail: 'updates@example.com',
    });

    assert.ok(
      result.optimizedScore >= result.originalScore,
      `Optimized score (${result.optimizedScore}) must be >= original score (${result.originalScore})`
    );
  });

  test('Optimizer Idempotence: Optimizing already optimized email maintains score', async () => {
    const sample = `
      <!DOCTYPE html>
      <html lang="en">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td>
              <h1>System Performance Report</h1>
              <p>All cloud services are running normally.</p>
              <img src="https://example.com/logo.png" alt="Company Logo">
              <a href="https://example.com/metrics">View Dashboard</a>
              <div id="emailin-compliance-footer">
                <a href="{{unsubscribe_url}}">Unsubscribe</a>
                <p>100 Innovation Parkway, Suite 400, San Francisco, CA 94105</p>
              </div>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const opt1 = await globalDeliverabilityEngine.optimize({
      subject: 'System Performance Report: Weekly Metrics',
      html: sample,
      fromEmail: 'ops@example.com',
    });

    const opt2 = await globalDeliverabilityEngine.optimize({
      subject: opt1.optimizedSubject,
      html: opt1.optimizedHtml,
      fromEmail: 'ops@example.com',
    });

    assert.ok(
      opt2.optimizedScore >= opt1.optimizedScore,
      'Second optimization pass must never degrade deliverability score'
    );
  });

  // ==========================================
  // ACCEPTANCE TESTS: Tests A through E
  // ==========================================

  test('Test A: Good email meets threshold and requires minimal/no optimization', async () => {
    const goodHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head><meta charset="UTF-8"><title>Account Statement</title></head>
      <body>
        <h1>Your Monthly Account Statement</h1>
        <p>Your statement for July is now available for download.</p>
        <p><a href="https://example.com/statements/download">Download Statement</a></p>
        <div id="compliance-footer">
          <p>Acme Financial, 100 Wall St, New York, NY 10005</p>
          <a href="https://example.com/unsub">Unsubscribe from notifications</a>
        </div>
      </body>
      </html>
    `;

    const result = await globalDeliverabilityEngine.optimize({
      subject: 'Your Monthly Account Statement: July 2026',
      html: goodHtml,
      fromEmail: 'billing@example.com',
    });

    assert.ok(result.originalScore >= 80, `Good email should have high initial score, got ${result.originalScore}`);
    assert.ok(result.optimizedScore >= result.originalScore);
    assert.ok(result.iterationsRun <= 3);
  });

  test('Test B: Email needing optimization triggers safe fixes and improves score within iteration limit', async () => {
    const poorHtml = `
      <div style="display:none">hidden promotional keywords secret deal</div>
      <h1>BUY NOW AND SAVE BIG $$$</h1>
      <p>Act now or lose out forever! 100% free claim right now!</p>
      <img src="http://insecure-cdn.com/banner.jpg">
      <a href="http://unsecured-domain.com/buy">CLAIM DEAL</a>
    `;

    const result = await globalDeliverabilityEngine.optimize({
      subject: 'URGENT!!! ACT NOW OR LOSE YOUR DISCOUNT FOREVER $$$',
      html: poorHtml,
      fromEmail: 'sales@example.com',
    });

    assert.ok(result.scoreDelta > 0, `Score delta should be positive, got ${result.scoreDelta}`);
    assert.ok(result.optimizedScore > result.originalScore, 'Optimized score must be strictly higher than original');
    assert.ok(result.iterationsRun >= 1 && result.iterationsRun <= 3, `Iterations must be <= 3, got ${result.iterationsRun}`);
    assert.ok(result.appliedFixes.length > 0, 'Applied fixes should not be empty');
    assert.ok(result.optimizedHtml.includes('display:none') === false, 'Hidden content must be removed');
  });

  test('Test C: Absence of Gemini key gracefully falls back to deterministic local NLP engine', async () => {
    const { LocalNLPProvider } = await import('./nlp/localProvider');
    const localEngine = new LocalNLPProvider();

    assert.strictEqual(localEngine.isAvailable(), true);
    assert.strictEqual(localEngine.getConfidence(), 'fallback-rules');
    assert.ok(localEngine.getDisplayName().includes('Local'));

    const subAnalysis = await localEngine.analyzeSubject({
      subject: 'URGENT LIMITED TIME OFFER $$$',
    });
    assert.ok(subAnalysis.score < 60);
    assert.ok(subAnalysis.urgencyTriggers.length > 0);

    const subOpt = await localEngine.optimizeSubject({
      subject: 'URGENT LIMITED TIME OFFER $$$',
      originalAnalysis: subAnalysis,
    });
    assert.ok(subOpt.improvedSubject.length > 0);
    assert.strictEqual(subOpt.improvedSubject.includes('$$$'), false);
    assert.ok(subOpt.alternatives.length >= 3);
  });

  test('Test D: MailTester disabled (ENABLE_MAILTESTER=false) produces no external calls or fake results', async () => {
    const prevEnv = process.env.ENABLE_MAILTESTER;
    process.env.ENABLE_MAILTESTER = 'false';

    try {
      const { MailTesterProvider } = await import('./testing/seedTester');
      const provider = new MailTesterProvider();

      assert.strictEqual(provider.isEnabled(), false);
      assert.strictEqual(provider.isConfigured(), false);

      const result = await provider.sendTest({
        subject: 'Deliverability Seed Check',
        html: '<p>Test email</p>',
      });

      assert.strictEqual(result.status, 'disabled');
      assert.ok(result.details?.includes('disabled'));
      assert.ok(result.details?.includes('Emailin-OPS internal'));
    } finally {
      process.env.ENABLE_MAILTESTER = prevEnv;
    }
  });

  test('Test E: GlockApps disabled (ENABLE_GLOCKAPPS=false) produces no fake placement data', async () => {
    const prevEnv = process.env.ENABLE_GLOCKAPPS;
    process.env.ENABLE_GLOCKAPPS = 'false';

    try {
      const { GlockAppsProvider } = await import('./testing/seedTester');
      const provider = new GlockAppsProvider();

      assert.strictEqual(provider.isEnabled(), false);
      assert.strictEqual(provider.isConfigured(), false);

      const result = await provider.sendTest();

      assert.strictEqual(result.status, 'disabled');
      assert.ok(result.details?.includes('No fake inbox placement'));
    } finally {
      process.env.ENABLE_GLOCKAPPS = prevEnv;
    }
  });
});
