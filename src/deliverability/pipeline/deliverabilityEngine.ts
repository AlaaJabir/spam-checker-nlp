import { analyzeAuthentication } from '../analyzer/authAnalyzer';
import { analyzeCompatibility } from '../analyzer/compatibilityAnalyzer';
import { analyzeCompliance } from '../analyzer/complianceAnalyzer';
import { analyzeContent } from '../analyzer/contentAnalyzer';
import { analyzeHtml } from '../analyzer/htmlAnalyzer';
import { analyzeLinks } from '../analyzer/linkAnalyzer';
import { analyzeSubject } from '../analyzer/subjectAnalyzer';
import { getNLPProvider } from '../nlp/providerFactory';
import { optimizeHtml } from '../optimizer/htmlOptimizer';
import { optimizeSubject } from '../optimizer/subjectOptimizer';
import { calculateDeliverabilityScore } from '../scoring/scoringEngine';
import { SeedTesterEngine } from '../testing/seedTester';
import {
  FullDeliverabilityAnalysis,
  OptimizationChange,
  OptimizationResult,
  ScanRecord,
} from '../types';

export class DeliverabilityEngine {
  private seedTester = new SeedTesterEngine();
  private scanStore: Map<string, ScanRecord> = new Map();

  /**
   * Complete multi-factor deliverability analysis.
   */
  async analyze(input: {
    subject: string;
    html: string;
    fromEmail?: string;
    replyTo?: string;
    trackingEnabled?: boolean;
  }): Promise<FullDeliverabilityAnalysis> {
    const { subject = '', html = '', fromEmail, replyTo, trackingEnabled = true } = input;

    // Run parallel analyzers
    const subjectAnalysis = analyzeSubject(subject);
    const htmlAnalysis = analyzeHtml(html);
    const contentAnalysis = analyzeContent(html);
    const linkAnalysis = analyzeLinks(html, { preserveTracking: trackingEnabled });
    const complianceAnalysis = analyzeCompliance(html, { fromEmail, replyTo });
    const compatibilityAnalysis = analyzeCompatibility(html);

    // Authentication live DNS check (async)
    const authenticationAnalysis = await analyzeAuthentication(fromEmail);

    // Comprehensive scoring engine
    const score = calculateDeliverabilityScore({
      subject: subjectAnalysis,
      html: htmlAnalysis,
      content: contentAnalysis,
      links: linkAnalysis,
      compliance: complianceAnalysis,
      authentication: authenticationAnalysis,
      compatibility: compatibilityAnalysis,
    });

    return {
      score,
      subjectAnalysis,
      htmlAnalysis,
      contentAnalysis,
      linkAnalysis,
      complianceAnalysis,
      authenticationAnalysis,
      compatibilityAnalysis,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Safe Controlled Iterative Optimization (Max 3 iterations with regression protection).
   */
  async optimize(input: {
    subject: string;
    html: string;
    fromEmail?: string;
    replyTo?: string;
    options?: {
      preserveTracking?: boolean;
      companyAddress?: string;
      unsubscribeUrl?: string;
    };
  }): Promise<OptimizationResult> {
    const { subject = '', html = '', fromEmail, replyTo, options = {} } = input;
    const nlpProvider = getNLPProvider();

    // 1. Initial baseline analysis
    const initialAnalysis = await this.analyze({ subject, html, fromEmail, replyTo });
    const originalScore = initialAnalysis.score.score;

    let currentSubject = subject;
    let currentHtml = html;
    let currentScore = originalScore;
    let previousScore = originalScore;
    let previousSubject = currentSubject;
    let previousHtml = currentHtml;

    const aggregatedChanges: OptimizationChange[] = [];
    const aggregatedFixes = new Set<string>();

    // Subject optimization
    const subjectOpt = optimizeSubject(currentSubject);
    currentSubject = subjectOpt.optimizedSubject;
    subjectOpt.changes.forEach((c) => aggregatedChanges.push(c));
    subjectOpt.appliedFixes.forEach((f) => aggregatedFixes.add(f));

    // Also consult NLP provider for alternatives if available
    let aiAlternatives = subjectOpt.alternatives;
    try {
      const nlpSub = await nlpProvider.optimizeSubject({
        subject: currentSubject,
        originalAnalysis: initialAnalysis.subjectAnalysis,
      });
      if (nlpSub.improvedSubject && nlpSub.improvedSubject !== currentSubject) {
        currentSubject = nlpSub.improvedSubject;
      }
      if (nlpSub.alternatives && nlpSub.alternatives.length > 0) {
        aiAlternatives = nlpSub.alternatives;
      }
    } catch {
      // Fallback already prepared
    }

    const MAX_ITERATIONS = Math.max(1, Math.min(5, parseInt(process.env.MAX_OPTIMIZATION_ITERATIONS || '3', 10)));
    const TARGET_SCORE = parseInt(process.env.OPTIMIZATION_TARGET_SCORE || '90', 10);
    let iterationsRun = 0;

    // Check if initial score already meets target threshold
    if (currentScore < TARGET_SCORE) {
      for (let i = 1; i <= MAX_ITERATIONS; i++) {
        iterationsRun = i;
        previousScore = currentScore;
        previousSubject = currentSubject;
        previousHtml = currentHtml;

        // HTML Safe Optimization Pass
        const htmlOpt = optimizeHtml(currentHtml, {
          preserveTracking: options.preserveTracking !== false,
          companyAddress: options.companyAddress,
          unsubscribeUrl: options.unsubscribeUrl,
        });

        currentHtml = htmlOpt.optimizedHtml;
        htmlOpt.changes.forEach((c) => aggregatedChanges.push(c));
        htmlOpt.appliedFixes.forEach((f) => aggregatedFixes.add(f));

        // Re-analyze
        const reAnalysis = await this.analyze({
          subject: currentSubject,
          html: currentHtml,
          fromEmail,
          replyTo,
        });
        const newScore = reAnalysis.score.score;

        // Regression protection:
        // If score decreased, revert this iteration and break
        if (newScore < previousScore) {
          currentScore = previousScore;
          currentSubject = previousSubject;
          currentHtml = previousHtml;
          break;
        }

        // If score improved, update current score
        if (newScore > currentScore) {
          currentScore = newScore;
          // If we reached or surpassed target threshold, exit early
          if (currentScore >= TARGET_SCORE) {
            break;
          }
        } else {
          // Score unchanged; optimal state reached
          break;
        }
      }
    } else {
      iterationsRun = 1;
    }

    const scoreDelta = currentScore - originalScore;
    const detectedIssuesCount =
      initialAnalysis.score.blockers.length +
      initialAnalysis.score.warnings.length +
      initialAnalysis.score.info.length;

    const result: OptimizationResult = {
      originalSubject: subject,
      optimizedSubject: currentSubject,
      originalHtml: html,
      optimizedHtml: currentHtml,
      changes: aggregatedChanges,
      originalScore,
      optimizedScore: currentScore,
      scoreDelta,
      iterationsRun,
      alternativeSubjects: aiAlternatives,
      appliedFixes: Array.from(aggregatedFixes),
      engineUsed: nlpProvider.name,
      aiConfidence: nlpProvider.getConfidence(),
      aiProviderName: nlpProvider.getDisplayName(),
      detectedIssuesCount,
      fixedIssuesCount: aggregatedFixes.size,
    };

    // Save scan record
    const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.scanStore.set(scanId, {
      id: scanId,
      originalSubject: subject,
      optimizedSubject: currentSubject,
      originalHtml: html,
      optimizedHtml: currentHtml,
      originalScore,
      optimizedScore: currentScore,
      risk: currentScore >= 85 ? 'low' : currentScore >= 65 ? 'medium' : 'high',
      issues: initialAnalysis.score.blockers.concat(initialAnalysis.score.warnings),
      changes: aggregatedChanges,
      createdAt: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Optimize and Seed-test Pipeline.
   */
  async optimizeAndTest(input: {
    subject: string;
    html: string;
    fromEmail?: string;
    recipient?: string;
    providers?: string[];
  }): Promise<{
    optimization: OptimizationResult;
    finalAnalysis: FullDeliverabilityAnalysis;
    seedResults: any[];
    seedSummary: string;
  }> {
    const optimization = await this.optimize({
      subject: input.subject,
      html: input.html,
      fromEmail: input.fromEmail,
    });

    const finalAnalysis = await this.analyze({
      subject: optimization.optimizedSubject,
      html: optimization.optimizedHtml,
      fromEmail: input.fromEmail,
    });

    const { results: seedResults, summary: seedSummary } = await this.seedTester.runTests(
      {
        subject: optimization.optimizedSubject,
        html: optimization.optimizedHtml,
        fromEmail: input.fromEmail,
        recipient: input.recipient,
      },
      input.providers
    );

    return {
      optimization,
      finalAnalysis,
      seedResults,
      seedSummary,
    };
  }

  getSeedTester(): SeedTesterEngine {
    return this.seedTester;
  }

  getScan(id: string): ScanRecord | undefined {
    return this.scanStore.get(id);
  }

  getAllScans(): ScanRecord[] {
    return Array.from(this.scanStore.values()).reverse();
  }
}

export const globalDeliverabilityEngine = new DeliverabilityEngine();
