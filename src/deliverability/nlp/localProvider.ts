import { analyzeContent } from '../analyzer/contentAnalyzer';
import { analyzeSubject, generateRuleBasedAlternatives } from '../analyzer/subjectAnalyzer';
import { ContentAnalysis, SubjectAnalysis } from '../types';
import { ContentOptimization, NLPProvider, SubjectOptimization } from './types';

export class LocalNLPProvider implements NLPProvider {
  name = 'local';

  isAvailable(): boolean {
    return true;
  }

  getConfidence(): 'high' | 'medium' | 'fallback-rules' {
    return 'fallback-rules';
  }

  getDisplayName(): string {
    return 'Local Deterministic NLP Engine (Heuristic Rules)';
  }

  async analyzeSubject(input: { subject: string }): Promise<SubjectAnalysis> {
    return analyzeSubject(input.subject);
  }

  async analyzeContent(input: { html: string; text: string }): Promise<ContentAnalysis> {
    return analyzeContent(input.html);
  }

  async optimizeSubject(input: { subject: string; originalAnalysis?: SubjectAnalysis }): Promise<SubjectOptimization> {
    const analysis = input.originalAnalysis || analyzeSubject(input.subject);
    const alternatives = generateRuleBasedAlternatives(input.subject, {
      urgencyTriggers: analysis.urgencyTriggers,
      promotionalTriggers: analysis.promotionalTriggers,
      isAllCaps: analysis.isAllCaps,
      repeatedPunctuation: analysis.repeatedPunctuation,
    });

    const best = alternatives[0]?.subject || input.subject;
    const changes: string[] = [];

    if (analysis.isAllCaps) changes.push('Converted ALL CAPS to readable title case');
    if (analysis.repeatedPunctuation.length > 0) changes.push('Removed repeated spam punctuation');
    if (analysis.urgencyTriggers.length > 0) changes.push('Removed artificial urgency phrases');

    return {
      improvedSubject: best,
      alternatives,
      rationale: 'Cleaned deceptive trigger patterns, standardized casing, and preserved natural brand intent.',
      changesMade: changes.length > 0 ? changes : ['Polished casing and clarity'],
    };
  }

  async optimizeContent(input: {
    text: string;
    html: string;
    originalAnalysis?: ContentAnalysis;
  }): Promise<ContentOptimization> {
    const changes: string[] = [];
    let improvedHtml = input.html;

    // Remove deceptive phrases from HTML if present
    const phrasesToSoften = [
      { trigger: /100%\s+guaranteed/gi, replacement: 'backed by our quality commitment' },
      { trigger: /risk\s+free\s+profit/gi, replacement: 'reliable results' },
      { trigger: /double\s+your\s+money/gi, replacement: 'maximize your value' },
      { trigger: /buy\s+now!+/gi, replacement: 'View details' },
      { trigger: /last\s+chance!+/gi, replacement: 'Final reminder' },
    ];

    for (const item of phrasesToSoften) {
      if (item.trigger.test(improvedHtml)) {
        improvedHtml = improvedHtml.replace(item.trigger, item.replacement);
        changes.push(`Softened aggressive marketing phrase: "${item.replacement}"`);
      }
    }

    return {
      improvedText: input.text,
      improvedHtml,
      changesMade: changes,
      rationale: 'Replaced high-risk spam keywords with professional, truthful equivalents.',
    };
  }
}
