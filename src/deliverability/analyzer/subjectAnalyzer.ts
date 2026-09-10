import { DeliverabilityIssue, RiskLevel, SubjectAlternative, SubjectAnalysis } from '../types';

const URGENCY_WORDS = [
  'urgent',
  'act now',
  'last chance',
  'expires',
  'expiring soon',
  'hurry',
  'final notice',
  'immediately',
  'instant',
  'limited time only',
  'time is running out',
  'deadline',
  'don\'t wait',
  'now or never',
  'action required',
  'dernière chance',
  'urgent',
  'vite',
  'urgent',
  'عاجل',
  'فرصة أخيرة',
];

const PROMOTIONAL_WORDS = [
  'free',
  '100% free',
  'buy now',
  'guaranteed',
  'cash',
  'bonus',
  'discount',
  'save big',
  'massive savings',
  'cheap',
  'billion',
  'millionaire',
  'earn money',
  'extra income',
  'prize',
  'winner',
  'congratulations',
  'claim now',
  'gratuit',
  'gagner de l\'argent',
  'rabais',
  'مجاني',
  'اربح',
  'خصم هائل',
];

const FEAR_WORDS = [
  'warning',
  'account suspended',
  'critical alert',
  'breach',
  'security notice',
  'unauthorized',
  'legal notice',
  'termination',
  'penalized',
  'risk of loss',
];

const CLICKBAIT_PATTERNS = [
  /you won'?t believe/i,
  /shocking (truth|secret|discovery)/i,
  /what happens next/i,
  /secret(s)? they don'?t want you to know/i,
  /this one trick/i,
  /the real reason why/i,
  /is this the end of/i,
];

// Emoji regex
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

export function analyzeSubject(rawSubject: string): SubjectAnalysis {
  const subject = (rawSubject || '').trim();
  const characterCount = subject.length;
  const words = subject.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const reasons: string[] = [];
  const suggestions: string[] = [];
  const urgencyTriggers: string[] = [];
  const fearTriggers: string[] = [];
  const misleadingTriggers: string[] = [];
  const promotionalTriggers: string[] = [];
  const excessiveDiscounts: string[] = [];
  const artificialScarcity: string[] = [];
  const clickbaitPatterns: string[] = [];
  const repeatedPunctuation: string[] = [];

  let score = 100;

  // 1. Length analysis
  if (characterCount === 0) {
    score -= 50;
    reasons.push('Subject line is empty.');
    suggestions.push('Provide a clear, engaging subject line between 35 and 60 characters.');
  } else if (characterCount < 10) {
    score -= 20;
    reasons.push(`Subject line is very short (${characterCount} characters).`);
    suggestions.push('Add informative context to clarify what the email contains.');
  } else if (characterCount > 70) {
    score -= 15;
    reasons.push(`Subject line is too long (${characterCount} characters) and will truncate on mobile screens.`);
    suggestions.push('Condense your subject to under 60 characters to ensure full visibility on mobile inboxes.');
  }

  // 2. Capitalization check
  const upperCaseChars = (subject.match(/[A-Z]/g) || []).length;
  const alphaChars = (subject.match(/[A-Za-z]/g) || []).length;
  const capitalizationPercentage = alphaChars > 0 ? Math.round((upperCaseChars / alphaChars) * 100) : 0;
  const isAllCaps = alphaChars > 4 && capitalizationPercentage >= 75;

  if (isAllCaps) {
    score -= 30;
    reasons.push('Excessive capitalization / ALL CAPS detected.');
    suggestions.push('Switch to sentence case or title case; shouting triggers spam filters and lowers trust.');
  } else if (capitalizationPercentage > 45 && alphaChars > 15) {
    score -= 10;
    reasons.push('High proportion of capital letters in subject.');
    suggestions.push('Reserve capital letters for proper nouns and the first letter of key words.');
  }

  // 3. Repeated punctuation (!!!, ???, $$$, etc.)
  const punctMatches = subject.match(/([!?$*%]{2,})/g);
  if (punctMatches) {
    repeatedPunctuation.push(...punctMatches);
    score -= 25;
    reasons.push(`Contains repeated spam punctuation: ${punctMatches.join(', ')}.`);
    suggestions.push('Limit punctuation to a single period, question mark, or clear separator.');
  }

  // 4. Urgency and Scarcity
  const lowerSubject = subject.toLowerCase();
  for (const trigger of URGENCY_WORDS) {
    if (lowerSubject.includes(trigger)) {
      urgencyTriggers.push(trigger);
    }
  }
  if (urgencyTriggers.length > 0) {
    score -= urgencyTriggers.length * 10;
    reasons.push(`Contains artificial urgency keywords: "${urgencyTriggers.join('", "')}".`);
    suggestions.push('Replace high-pressure urgency with clear, benefit-driven value.');
  }

  // 5. Promotional & discounts
  for (const promo of PROMOTIONAL_WORDS) {
    const wordPattern = new RegExp(`\\b${promo.replace(/%/g, '\\%')}\\b`, 'i');
    if (wordPattern.test(lowerSubject)) {
      promotionalTriggers.push(promo);
    }
  }
  if (promotionalTriggers.length > 1) {
    score -= promotionalTriggers.length * 8;
    reasons.push(`Contains multiple aggressive promotional keywords: "${promotionalTriggers.join('", "')}".`);
    suggestions.push('Focus on the recipient\'s interest rather than overt sales hype.');
  }

  // Check discount patterns like "90% OFF"
  const discountMatch = subject.match(/\b\d{2,3}%\s*(off|discount|free)/i);
  if (discountMatch) {
    excessiveDiscounts.push(discountMatch[0]);
    score -= 10;
    reasons.push(`High discount claim: "${discountMatch[0]}".`);
    suggestions.push('Highlight the product or solution rather than leading with huge discount percentages.');
  }

  // 6. Fear-based language
  for (const fear of FEAR_WORDS) {
    if (lowerSubject.includes(fear)) {
      fearTriggers.push(fear);
    }
  }
  if (fearTriggers.length > 0) {
    score -= 20;
    reasons.push(`Fear-based or alarming wording: "${fearTriggers.join('", "')}".`);
    suggestions.push('Avoid alarmist phrasing unless this is a verified critical security dispatch.');
  }

  // 7. Clickbait patterns
  for (const pattern of CLICKBAIT_PATTERNS) {
    const match = subject.match(pattern);
    if (match) {
      clickbaitPatterns.push(match[0]);
    }
  }
  if (clickbaitPatterns.length > 0) {
    score -= 18;
    reasons.push(`Clickbait phrasing detected: "${clickbaitPatterns.join('", "')}".`);
    suggestions.push('State clearly what the recipient will gain from opening the email.');
  }

  // 8. Emojis
  const emojiMatches = subject.match(EMOJI_REGEX) || [];
  const emojiCount = emojiMatches.length;
  if (emojiCount > 2) {
    score -= 12;
    reasons.push(`Too many emojis (${emojiCount}) in the subject line.`);
    suggestions.push('Limit emojis to at most 1 relevant, tasteful symbol, or none.');
  }

  // 9. Suspicious spacing (e.g., F R E E or D E A L)
  if (/\b([A-Za-z]\s){3,}[A-Za-z]\b/.test(subject)) {
    score -= 30;
    reasons.push('Spaced-out character pattern (e.g. "F R E E") detected.');
    suggestions.push('Write standard words without manual character spacing.');
  }

  // Final score clamping
  score = Math.max(0, Math.min(100, score));

  // Risk assessment
  let risk: RiskLevel = 'low';
  if (score < 60) risk = 'high';
  else if (score < 80) risk = 'medium';

  // Generate 3 legitimate alternative subjects
  const suggestedAlternatives = generateRuleBasedAlternatives(subject, {
    urgencyTriggers,
    promotionalTriggers,
    isAllCaps,
    repeatedPunctuation,
  });

  return {
    originalSubject: subject,
    length: characterCount,
    characterCount,
    wordCount,
    capitalizationPercentage,
    isAllCaps,
    excessivePunctuation: repeatedPunctuation.length > 0,
    repeatedPunctuation,
    urgencyTriggers,
    fearTriggers,
    misleadingTriggers,
    promotionalTriggers,
    emojiCount,
    clickbaitPatterns,
    excessiveDiscounts,
    artificialScarcity,
    score,
    risk,
    reasons,
    suggestions,
    suggestedAlternatives,
  };
}

/**
 * Generates 3 clean, legitimate alternative subjects based on the original.
 * Avoids simply replacing words with synonyms to evade filters; focuses on clear value and truthful tone.
 */
export function generateRuleBasedAlternatives(
  originalSubject: string,
  context: {
    urgencyTriggers: string[];
    promotionalTriggers: string[];
    isAllCaps: boolean;
    repeatedPunctuation: string[];
  }
): SubjectAlternative[] {
  let cleaned = originalSubject
    // Remove repeated punctuation
    .replace(/[!?$*%]{2,}/g, '')
    // Remove excessive exclamation marks
    .replace(/!/g, '')
    .trim();

  // Fix ALL CAPS
  if (context.isAllCaps) {
    cleaned = cleaned
      .toLowerCase()
      .replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
  }

  // Remove aggressive urgency terms
  for (const trigger of context.urgencyTriggers) {
    const reg = new RegExp(`\\b${trigger}\\b`, 'gi');
    cleaned = cleaned.replace(reg, '').trim();
  }

  // Remove leading separators like ": " or "- "
  cleaned = cleaned.replace(/^[\s:\-—–|]+/, '').replace(/[\s:\-—–|]+$/, '').trim();

  if (!cleaned || cleaned.length < 5) {
    cleaned = 'Important update for your account';
  }

  return [
    {
      subject: `${cleaned}`,
      rationale: 'Clean, professional title case with zero spam-trigger punctuation or forced urgency.',
      tone: 'professional',
      estimatedScore: 95,
    },
    {
      subject: `Your latest update: ${cleaned}`,
      rationale: 'Conversational, direct, and sets clear expectations for what is inside.',
      tone: 'conversational',
      estimatedScore: 92,
    },
    {
      subject: `How to get the most out of ${cleaned.slice(0, 35)}`,
      rationale: 'Benefit-driven framing that sparks legitimate recipient interest without clickbait.',
      tone: 'benefit-driven',
      estimatedScore: 94,
    },
  ];
}
