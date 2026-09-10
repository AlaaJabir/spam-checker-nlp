import { analyzeSubject, generateRuleBasedAlternatives } from '../analyzer/subjectAnalyzer';
import { OptimizationChange, SubjectAlternative } from '../types';

export interface SubjectOptimizationResult {
  optimizedSubject: string;
  alternatives: SubjectAlternative[];
  changes: OptimizationChange[];
  appliedFixes: string[];
}

export function optimizeSubject(rawSubject: string): SubjectOptimizationResult {
  const original = (rawSubject || '').trim();
  const analysis = analyzeSubject(original);
  const changes: OptimizationChange[] = [];
  const appliedFixes: string[] = [];

  let cleaned = original;

  // 1. Remove repeated punctuation
  if (analysis.excessivePunctuation) {
    cleaned = cleaned.replace(/([!?$*%]{2,})/g, '');
    changes.push({
      category: 'subject',
      description: `Removed repeated spam punctuation (${analysis.repeatedPunctuation.join(', ')})`,
      impact: 'major',
    });
    appliedFixes.push('Removed repeated spam punctuation');
  }

  // 2. Remove trailing single exclamation marks
  if (cleaned.endsWith('!')) {
    cleaned = cleaned.replace(/!+$/, '');
    changes.push({
      category: 'subject',
      description: 'Removed aggressive trailing exclamation marks',
      impact: 'minor',
    });
    appliedFixes.push('Removed trailing exclamation mark');
  }

  // 3. Fix ALL CAPS
  if (analysis.isAllCaps) {
    cleaned = cleaned
      .toLowerCase()
      .split(' ')
      .map((w) => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(' ');
    changes.push({
      category: 'subject',
      description: 'Converted ALL CAPS to readable title case',
      impact: 'major',
    });
    appliedFixes.push('Converted ALL CAPS to title case');
  }

  // 4. Soften urgency triggers
  for (const trigger of analysis.urgencyTriggers) {
    const reg = new RegExp(`\\b${trigger}\\b[:!\\-\\s]*`, 'gi');
    cleaned = cleaned.replace(reg, '').trim();
    changes.push({
      category: 'subject',
      description: `Removed artificial urgency phrase: "${trigger}"`,
      impact: 'moderate',
    });
    appliedFixes.push(`Softened urgency phrase: "${trigger}"`);
  }

  // Clean leading/trailing punctuation leftovers
  cleaned = cleaned.replace(/^[:\-\s—–|]+/, '').replace(/[:\-\s—–|]+$/, '').trim();

  // If subject was emptied, provide a clean default
  if (!cleaned || cleaned.length < 5) {
    cleaned = 'Important update regarding your account';
  }

  // Get 3 legitimate alternatives
  const alternatives = generateRuleBasedAlternatives(original, {
    urgencyTriggers: analysis.urgencyTriggers,
    promotionalTriggers: analysis.promotionalTriggers,
    isAllCaps: analysis.isAllCaps,
    repeatedPunctuation: analysis.repeatedPunctuation,
  });

  return {
    optimizedSubject: cleaned,
    alternatives,
    changes,
    appliedFixes,
  };
}
