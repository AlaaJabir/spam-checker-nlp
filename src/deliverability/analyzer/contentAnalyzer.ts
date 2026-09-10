import * as cheerio from 'cheerio';
import { ContentAnalysis, DeliverabilityIssue } from '../types';

const PROMOTIONAL_PHRASES = [
  'buy now',
  'order today',
  'act fast',
  'special offer',
  'exclusive deal',
  'lowest price',
  'best price',
  'save big',
  'cash bonus',
  'money back guarantee',
  'free trial',
  'click here',
  'risk-free',
  'unbeatable price',
  'limited supply',
  'acheter maintenant',
  'offre spéciale',
  'prix le plus bas',
  'اشتر الآن',
  'عرض خاص',
];

const URGENCY_PHRASES = [
  'expires tonight',
  'last chance',
  'urgent',
  'time is running out',
  'hours left',
  'final hours',
  'don\'t wait',
  'instant access',
  'now or never',
  'immediate action',
  'dernière chance',
  'temps limité',
  'ينتهي قريبا',
  'فرصة أخيرة',
];

const MISLEADING_CLAIMS = [
  '100% guaranteed',
  'guaranteed income',
  'double your money',
  'risk free profit',
  'work from home make thousands',
  'no catch',
  'you have won',
  'claim your free gift card',
  'unlimited earnings',
  'gains garantis',
  'أرباح مضمونة',
];

const CTA_PATTERNS = [
  /\b(click\s+(here|now|below))\b/i,
  /\b(buy\s+(now|today))\b/i,
  /\b(shop\s+(now|the\s+sale))\b/i,
  /\b(sign\s+up(\s+now)?)\b/i,
  /\b(claim\s+(your|now))\b/i,
  /\b(download\s+(now|free))\b/i,
  /\b(get\s+started)\b/i,
  /\b(start\s+your\s+free\s+trial)\b/i,
  /\b(cliquez\s+ici)\b/i,
  /\b(اضغط\s+هنا)\b/i,
];

export function extractVisibleTextFromHtml(html: string): string {
  if (!html) return '';
  const $ = cheerio.load(html, { xml: false });

  // Remove elements that are invisible by design or code
  $('script, style, noscript, svg, link, meta').remove();

  // Also remove elements styled display:none or visibility:hidden
  $('[style*="display:none"], [style*="display: none"], [style*="visibility:hidden"], [style*="visibility: hidden"]').remove();

  const text = $('body').length > 0 ? $('body').text() : $.root().text();
  // Normalize whitespace
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Basic language detection supporting English, French, and Arabic.
 */
export function detectLanguage(text: string): string {
  // Arabic character range check: \u0600-\u06FF
  const arabicMatches = text.match(/[\u0600-\u06FF]/g);
  if (arabicMatches && arabicMatches.length > 15) {
    return 'ar';
  }

  // French marker words check
  const frenchMarkers = /\b(le|la|les|un|une|des|du|de|pour|avec|dans|sur|est|sont|vous|votre|nous|notre|cette|ce)\b/gi;
  const frenchMatches = text.match(frenchMarkers) || [];

  // English marker words check
  const englishMarkers = /\b(the|and|is|are|you|your|we|our|for|with|in|on|that|this|to|have|has)\b/gi;
  const englishMatches = text.match(englishMarkers) || [];

  if (frenchMatches.length > englishMatches.length && frenchMatches.length > 5) {
    return 'fr';
  }

  return 'en';
}

/**
 * Calculates Flesch Reading Ease score (0 - 100).
 * Higher = easier to read.
 * 90-100: 5th grade
 * 60-70: 8th-9th grade (plain English)
 * 0-30: College graduate
 */
function calculateReadability(wordCount: number, sentenceCount: number, syllableCount: number): { score: number; grade: string } {
  if (wordCount === 0 || sentenceCount === 0) {
    return { score: 70, grade: 'Standard' };
  }

  const wordsPerSentence = wordCount / sentenceCount;
  const syllablesPerWord = syllableCount / wordCount;

  // Flesch Reading Ease formula
  let score = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  score = Math.round(Math.max(0, Math.min(100, score)));

  let grade = 'Standard';
  if (score >= 80) grade = 'Very Easy';
  else if (score >= 60) grade = 'Easy / Conversational';
  else if (score >= 40) grade = 'Moderate';
  else grade = 'Complex';

  return { score, grade };
}

function countSyllables(text: string): number {
  const words = text.toLowerCase().split(/[^a-z]+/i).filter(Boolean);
  let syllables = 0;
  for (const word of words) {
    if (word.length <= 3) {
      syllables += 1;
      continue;
    }
    const cleanWord = word.replace(/(?:[^laeiouy]|ed|es|e)$/, '').replace(/^y/, '');
    const matches = cleanWord.match(/[aeiouy]{1,2}/g);
    syllables += matches ? matches.length : 1;
  }
  return syllables;
}

export function analyzeContent(html: string): ContentAnalysis {
  const issues: DeliverabilityIssue[] = [];
  const visibleText = extractVisibleTextFromHtml(html);
  const visibleTextLength = visibleText.length;

  const words = visibleText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Sentences split by ., !, ?
  const sentences = visibleText.split(/[.!?]+/).filter((s) => s.trim().length > 3);
  const sentenceCount = Math.max(1, sentences.length);
  const averageSentenceLength = Math.round((wordCount / sentenceCount) * 10) / 10;

  const detectedLanguage = detectLanguage(visibleText);
  const syllables = countSyllables(visibleText);
  const { score: readabilityScore, grade: readabilityGrade } = calculateReadability(wordCount, sentenceCount, syllables);

  // 1. Minimum text volume check
  if (wordCount < 25) {
    issues.push({
      id: 'content-low-word-count',
      code: 'CONTENT_LOW_WORD_COUNT',
      category: 'content',
      severity: 'warning',
      problem: `Email contains very little visible text (${wordCount} words).`,
      whyItMatters:
        'Emails with scarce text appear as blank or image-only templates to content classifiers, triggering elevated Bayesian spam scores.',
      recommendedFix: 'Include at least 60-150 words of informative, personalized body copy.',
      autoFixed: false,
    });
  }

  // 2. Promotional density
  const lowerText = visibleText.toLowerCase();
  let promoCount = 0;
  for (const phrase of PROMOTIONAL_PHRASES) {
    const reg = new RegExp(`\\b${phrase.replace(/%/g, '\\%')}\\b`, 'gi');
    const matches = lowerText.match(reg);
    if (matches) promoCount += matches.length;
  }
  const promotionalDensity = wordCount > 0 ? Math.round((promoCount / (wordCount / 10)) * 100) / 10 : 0;
  if (promotionalDensity > 15) {
    issues.push({
      id: 'content-high-promo-density',
      code: 'CONTENT_HIGH_PROMO_DENSITY',
      category: 'content',
      severity: 'warning',
      problem: `High promotional phrase density (${promotionalDensity}%).`,
      whyItMatters:
        'Excessive sales terminology ("buy now", "special offer", "cash bonus") routes emails directly into the Gmail Promotions tab or Spam.',
      recommendedFix: 'Tone down aggressive sales language and focus on educational or transactional updates.',
      autoFixed: true,
      fixedDescription: 'Softened promotional wording while maintaining calls to action.',
    });
  }

  // 3. Urgency density
  let urgencyCount = 0;
  for (const phrase of URGENCY_PHRASES) {
    const reg = new RegExp(`\\b${phrase}\\b`, 'gi');
    const matches = lowerText.match(reg);
    if (matches) urgencyCount += matches.length;
  }
  const urgencyDensity = wordCount > 0 ? Math.round((urgencyCount / (wordCount / 10)) * 100) / 10 : 0;
  if (urgencyDensity > 10) {
    issues.push({
      id: 'content-high-urgency',
      code: 'CONTENT_HIGH_URGENCY',
      category: 'content',
      severity: 'warning',
      problem: 'Body text contains multiple high-pressure urgency phrases.',
      whyItMatters: 'Artificial countdown pressure triggers phishing and fraudulent scam heuristics.',
      recommendedFix: 'Use calm, informative scheduling language instead of panic triggers.',
      autoFixed: true,
      fixedDescription: 'Replaced artificial urgency phrasing with clear schedule details.',
    });
  }

  // 4. Misleading claims
  const misleadingClaims: string[] = [];
  for (const claim of MISLEADING_CLAIMS) {
    if (lowerText.includes(claim)) {
      misleadingClaims.push(claim);
    }
  }
  if (misleadingClaims.length > 0) {
    issues.push({
      id: 'content-misleading-claims',
      code: 'CONTENT_MISLEADING_CLAIMS',
      category: 'content',
      severity: 'blocker',
      problem: `Detected prohibited/misleading claim phrases: "${misleadingClaims.join('", "')}".`,
      whyItMatters:
        'Guaranteed profit or deceptive reward statements violate major ISP policies and CAN-SPAM regulations, leading to immediate domain reputation damage.',
      recommendedFix: 'Remove unsupported guarantees and promise-based claims.',
      autoFixed: true,
      fixedDescription: 'Removed misleading guarantee claims.',
    });
  }

  // 5. Calls to Action
  let ctaCount = 0;
  for (const pat of CTA_PATTERNS) {
    const matches = lowerText.match(pat);
    if (matches) ctaCount += matches.length;
  }
  const ctaDensityPer100Words = wordCount > 0 ? Math.round((ctaCount / wordCount) * 1000) / 10 : 0;
  if (ctaCount > 6 && ctaDensityPer100Words > 5) {
    issues.push({
      id: 'content-excessive-ctas',
      code: 'CONTENT_EXCESSIVE_CTAS',
      category: 'content',
      severity: 'warning',
      problem: `Found ${ctaCount} calls-to-action in a short message (${ctaDensityPer100Words} CTAs per 100 words).`,
      whyItMatters: 'Diluting focus with multiple competing action demands decreases engagement and increases user spam complaints.',
      recommendedFix: 'Focus on 1 primary call-to-action and 1 optional secondary link.',
      autoFixed: false,
    });
  }

  // 6. Excessive Capitalization in body
  const bodyAlpha = (visibleText.match(/[A-Za-z]/g) || []).length;
  const bodyUpper = (visibleText.match(/[A-Z]/g) || []).length;
  const bodyAllCapsPercentage = bodyAlpha > 0 ? Math.round((bodyUpper / bodyAlpha) * 100) : 0;
  if (bodyAllCapsPercentage > 30 && bodyAlpha > 60) {
    issues.push({
      id: 'content-excessive-caps',
      code: 'CONTENT_EXCESSIVE_CAPS',
      category: 'content',
      severity: 'warning',
      problem: `${bodyAllCapsPercentage}% of body text is capitalized.`,
      whyItMatters: 'High capitalization density in body text mimics deceptive marketing blasts and reduces readability.',
      recommendedFix: 'Standardize body typography to regular sentence case.',
      autoFixed: true,
      fixedDescription: 'Converted all-caps body text blocks to sentence case.',
    });
  }

  // 7. Readability check
  if (readabilityScore < 30 && wordCount > 50) {
    issues.push({
      id: 'content-poor-readability',
      code: 'CONTENT_POOR_READABILITY',
      category: 'content',
      severity: 'info',
      problem: `Low readability score (${readabilityScore}/100 - Grade: ${readabilityGrade}).`,
      whyItMatters: 'Complex sentences increase recipient drop-off and decrease click-through rates.',
      recommendedFix: 'Break long compound sentences into shorter paragraphs (average 12-18 words per sentence).',
      autoFixed: false,
    });
  }

  // Score computation
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'blocker') score -= 30;
    else if (issue.severity === 'warning') score -= 12;
    else score -= 4;
  }
  score = Math.max(0, Math.min(100, score));

  return {
    visibleTextLength,
    wordCount,
    sentenceCount,
    averageSentenceLength,
    readabilityScore,
    readabilityGrade,
    detectedLanguage,
    promotionalDensity,
    urgencyDensity,
    callToActionCount: ctaCount,
    ctaDensityPer100Words,
    excessiveRepetitionClusters: [],
    bodyAllCapsPercentage,
    misleadingClaims,
    emotionalPressurePhrases: [],
    textCoherenceScore: 90,
    score,
    issues,
  };
}
