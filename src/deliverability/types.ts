export type IssueSeverity = 'blocker' | 'warning' | 'info';

export type IssueCategory =
  | 'subject'
  | 'html'
  | 'content'
  | 'links'
  | 'authentication'
  | 'compliance'
  | 'compatibility';

export interface DeliverabilityIssue {
  id: string;
  code: string;
  category: IssueCategory;
  severity: IssueSeverity;
  problem: string;
  whyItMatters: string;
  recommendedFix: string;
  autoFixed?: boolean;
  fixedDescription?: string;
  details?: Record<string, any>;
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface CategoryScore {
  category: IssueCategory;
  name: string;
  score: number; // e.g. 0-25
  maxScore: number;
  weightPercentage: number;
  status: 'good' | 'warning' | 'critical';
  summary: string;
}

export interface DeliverabilityScoreResult {
  score: number; // 0-100 overall explainable score
  risk: RiskLevel;
  canSend: boolean;
  blockers: DeliverabilityIssue[];
  warnings: DeliverabilityIssue[];
  info: DeliverabilityIssue[];
  recommendations: string[];
  categories: Record<IssueCategory, CategoryScore>;
  checks: Record<
    string,
    {
      score: number;
      maxScore: number;
      passed: boolean;
      details: string;
    }
  >;
}

export interface SubjectAnalysis {
  originalSubject: string;
  length: number;
  characterCount: number;
  wordCount: number;
  capitalizationPercentage: number;
  isAllCaps: boolean;
  excessivePunctuation: boolean;
  repeatedPunctuation: string[];
  urgencyTriggers: string[];
  fearTriggers: string[];
  misleadingTriggers: string[];
  promotionalTriggers: string[];
  emojiCount: number;
  clickbaitPatterns: string[];
  excessiveDiscounts: string[];
  artificialScarcity: string[];
  score: number; // 0-100
  risk: RiskLevel;
  reasons: string[];
  suggestions: string[];
  suggestedAlternatives: SubjectAlternative[];
}

export interface SubjectAlternative {
  subject: string;
  rationale: string;
  tone: 'professional' | 'conversational' | 'benefit-driven';
  estimatedScore: number;
}

export interface HtmlElementDetail {
  type: string;
  snippet?: string;
  reason: string;
}

export interface HtmlAnalysis {
  isValid: boolean;
  hasHtmlTag: boolean;
  hasBodyTag: boolean;
  hasHeadTag: boolean;
  totalSizeKb: number;
  isGmailClippingRisk: boolean; // > 102KB
  nestingDepth: number;
  tableCount: number;
  inlineStylesCount: number;
  hiddenElements: HtmlElementDetail[];
  suspiciousCss: string[];
  zeroSizeElements: HtmlElementDetail[];
  transparentTextFound: boolean;
  offScreenElements: HtmlElementDetail[];
  hiddenLinks: string[];
  zeroWidthCharactersFound: boolean;
  excessiveCommentsLength: number;
  missingImageAltCount: number;
  totalImagesCount: number;
  imageToTextRatio: number; // percentage of image count vs text density
  unsupportedElements: string[]; // script, form, iframe, svg, etc.
  unsupportedCssFeatures: string[];
  accessibilityIssues: string[];
  score: number; // 0-100
  issues: DeliverabilityIssue[];
}

export interface ContentAnalysis {
  visibleTextLength: number;
  wordCount: number;
  sentenceCount: number;
  averageSentenceLength: number;
  readabilityScore: number; // Flesch Reading Ease (0-100)
  readabilityGrade: string;
  detectedLanguage: string; // 'en' | 'fr' | 'ar' | 'other'
  promotionalDensity: number; // percentage
  urgencyDensity: number; // percentage
  callToActionCount: number;
  ctaDensityPer100Words: number;
  excessiveRepetitionClusters: string[];
  bodyAllCapsPercentage: number;
  misleadingClaims: string[];
  emotionalPressurePhrases: string[];
  textCoherenceScore: number; // 0-100
  score: number; // 0-100
  issues: DeliverabilityIssue[];
}

export type LinkClassification =
  | 'essential_tracking'
  | 'optional_tracking'
  | 'potentially_problematic';

export interface LinkItem {
  url: string;
  hostname: string;
  isHttps: boolean;
  anchorText: string;
  isMismatch: boolean; // Phishing indicator
  hasTrackingParams: boolean;
  trackingParams: string[];
  isShortener: boolean;
  classification: LinkClassification;
  riskNote?: string;
}

export interface LinkAnalysis {
  totalLinks: number;
  uniqueDomains: string[];
  httpsRatio: number; // percentage
  nonHttpsLinks: string[];
  shortenerLinks: string[];
  mismatchedLinks: LinkItem[];
  linksPer100Words: number;
  links: LinkItem[];
  score: number; // 0-100
  issues: DeliverabilityIssue[];
}

export interface ComplianceAnalysis {
  hasUnsubscribeLink: boolean;
  unsubscribeMethod: 'url' | 'placeholder' | 'mailto' | 'none';
  unsubscribeSnippet?: string;
  hasPhysicalAddress: boolean;
  detectedAddressSnippet?: string;
  hasSenderIdentity: boolean;
  senderEmail?: string;
  replyToProvided: boolean;
  replyToEmail?: string;
  hasPrivacyPolicyLink: boolean;
  hasListUnsubscribeHeader: boolean;
  canSpamCompliant: boolean;
  gdprCompliant: boolean;
  score: number; // 0-100
  issues: DeliverabilityIssue[];
}

export type AuthStatus = 'pass' | 'fail' | 'neutral' | 'unknown';

export interface AuthenticationAnalysis {
  status: AuthStatus;
  domain?: string;
  spf: { status: AuthStatus; details: string; record?: string };
  dkim: { status: AuthStatus; details: string; selector?: string };
  dmarc: { status: AuthStatus; details: string; policy?: string };
  returnPath: { status: AuthStatus; details: string };
  fromDomainAlignment: { aligned: boolean; details: string };
  dkimAlignment: { aligned: boolean; details: string };
  dmarcAlignment: { aligned: boolean; details: string };
  ptrDns: { status: AuthStatus; details: string };
  heloEhlo: { status: AuthStatus; details: string };
  score: number; // 0-100
  isMockOrEstimated: boolean; // Always false or labeled clearly
  issues: DeliverabilityIssue[];
}

export interface CompatibilityAnalysis {
  score: number; // 0-100
  outlookCompatibility: 'good' | 'warning' | 'poor';
  gmailCompatibility: 'good' | 'warning' | 'poor';
  appleMailCompatibility: 'good' | 'warning' | 'poor';
  yahooCompatibility: 'good' | 'warning' | 'poor';
  mobileResponsive: boolean;
  maxContainerWidth: number;
  hasTableLayoutFallback: boolean;
  unsupportedFeatures: string[];
  issues: DeliverabilityIssue[];
}

export interface OptimizationChange {
  category: IssueCategory;
  description: string;
  beforeSnippet?: string;
  afterSnippet?: string;
  impact: 'major' | 'moderate' | 'minor';
}

export interface OptimizationResult {
  originalSubject: string;
  optimizedSubject: string;
  originalHtml: string;
  optimizedHtml: string;
  changes: OptimizationChange[];
  originalScore: number;
  optimizedScore: number;
  scoreDelta: number;
  iterationsRun: number;
  alternativeSubjects: SubjectAlternative[];
  appliedFixes: string[];
  engineUsed?: string;
  aiConfidence?: 'high' | 'medium' | 'fallback-rules';
  aiProviderName?: string;
  detectedIssuesCount?: number;
  fixedIssuesCount?: number;
}

export interface FullDeliverabilityAnalysis {
  score: DeliverabilityScoreResult;
  subjectAnalysis: SubjectAnalysis;
  htmlAnalysis: HtmlAnalysis;
  contentAnalysis: ContentAnalysis;
  linkAnalysis: LinkAnalysis;
  complianceAnalysis: ComplianceAnalysis;
  authenticationAnalysis: AuthenticationAnalysis;
  compatibilityAnalysis: CompatibilityAnalysis;
  timestamp: string;
}

export interface ScanRecord {
  id: string;
  userId?: string;
  campaignId?: string;
  originalSubject: string;
  optimizedSubject: string;
  originalHtml: string;
  optimizedHtml: string;
  originalScore: number;
  optimizedScore: number;
  risk: RiskLevel;
  issues: DeliverabilityIssue[];
  changes: OptimizationChange[];
  testResults?: any[];
  createdAt: string;
}
