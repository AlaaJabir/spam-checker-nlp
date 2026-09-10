import {
  AuthenticationAnalysis,
  CategoryScore,
  CompatibilityAnalysis,
  ComplianceAnalysis,
  ContentAnalysis,
  DeliverabilityIssue,
  DeliverabilityScoreResult,
  HtmlAnalysis,
  IssueCategory,
  LinkAnalysis,
  RiskLevel,
  SubjectAnalysis,
} from '../types';

export function calculateDeliverabilityScore(analyses: {
  subject: SubjectAnalysis;
  html: HtmlAnalysis;
  content: ContentAnalysis;
  links: LinkAnalysis;
  compliance: ComplianceAnalysis;
  authentication: AuthenticationAnalysis;
  compatibility: CompatibilityAnalysis;
}): DeliverabilityScoreResult {
  const { subject, html, content, links, compliance, authentication, compatibility } = analyses;

  // Category Max Points
  const WEIGHTS: Record<IssueCategory, number> = {
    content: 25,
    html: 20,
    subject: 15,
    authentication: 15,
    compliance: 10,
    links: 10,
    compatibility: 5,
  };

  // Convert each category score (0-100) to weighted points
  const contentPts = Math.round((content.score / 100) * WEIGHTS.content);
  const htmlPts = Math.round((html.score / 100) * WEIGHTS.html);
  const subjectPts = Math.round((subject.score / 100) * WEIGHTS.subject);
  const authPts = Math.round((authentication.score / 100) * WEIGHTS.authentication);
  const compliancePts = Math.round((compliance.score / 100) * WEIGHTS.compliance);
  const linksPts = Math.round((links.score / 100) * WEIGHTS.links);
  const compatPts = Math.round((compatibility.score / 100) * WEIGHTS.compatibility);

  const totalScore = Math.max(0, Math.min(100, contentPts + htmlPts + subjectPts + authPts + compliancePts + linksPts + compatPts));

  // Collect all issues
  const allIssues: DeliverabilityIssue[] = [
    ...html.issues,
    ...content.issues,
    ...links.issues,
    ...compliance.issues,
    ...authentication.issues,
    ...compatibility.issues,
  ];

  // Subject issues
  if (subject.isAllCaps) {
    allIssues.push({
      id: 'sub-all-caps',
      code: 'SUB_ALL_CAPS',
      category: 'subject',
      severity: 'blocker',
      problem: 'Subject line is in ALL CAPS.',
      whyItMatters: 'Shouting in subject lines triggers aggressive spam heuristics and drastically drops open rates.',
      recommendedFix: 'Convert subject to sentence case or title case.',
      autoFixed: true,
      fixedDescription: 'Converted subject line to title case.',
    });
  }
  if (subject.excessivePunctuation) {
    allIssues.push({
      id: 'sub-excessive-punct',
      code: 'SUB_EXCESSIVE_PUNCT',
      category: 'subject',
      severity: 'warning',
      problem: `Subject contains spam punctuation: ${subject.repeatedPunctuation.join(', ')}`,
      whyItMatters: 'Repeated exclamation marks and dollar signs are key spam indicators.',
      recommendedFix: 'Remove excessive punctuation marks.',
      autoFixed: true,
      fixedDescription: 'Cleaned trailing and repeated punctuation.',
    });
  }
  if (subject.urgencyTriggers.length > 0) {
    allIssues.push({
      id: 'sub-urgency',
      code: 'SUB_URGENCY',
      category: 'subject',
      severity: 'warning',
      problem: `Subject contains artificial urgency triggers: "${subject.urgencyTriggers.join('", "')}"`,
      whyItMatters: 'High-pressure scarcity phrasing increases recipient complaints.',
      recommendedFix: 'Frame subject with legitimate value and clear information.',
      autoFixed: true,
      fixedDescription: 'Rephrased subject with objective professional tone.',
    });
  }

  const blockers = allIssues.filter((i) => i.severity === 'blocker');
  const warnings = allIssues.filter((i) => i.severity === 'warning');
  const info = allIssues.filter((i) => i.severity === 'info');

  // Risk Classification
  let risk: RiskLevel = 'low';
  if (totalScore < 65 || blockers.length > 0) {
    risk = 'high';
  } else if (totalScore < 85 || warnings.length > 2) {
    risk = 'medium';
  }

  // Can send: False if any hard blockers exist (e.g. missing unsubscribe, malicious script, phishing mismatch)
  const canSend = blockers.length === 0;

  // Build recommendations list
  const recommendations: string[] = [];
  if (blockers.length > 0) {
    recommendations.push(`Fix ${blockers.length} critical deliverability blocker(s) before launching campaign.`);
  }
  if (!compliance.hasUnsubscribeLink) {
    recommendations.push('Add an unsubscribe link in the email footer to comply with 2024 mailbox mandates.');
  }
  if (html.isGmailClippingRisk) {
    recommendations.push('Reduce HTML code size to under 95 KB to avoid Gmail truncation.');
  }
  if (links.nonHttpsLinks.length > 0) {
    recommendations.push('Upgrade insecure HTTP links to HTTPS.');
  }
  if (subject.suggestedAlternatives.length > 0 && subject.score < 80) {
    recommendations.push(`Consider using recommended subject alternative: "${subject.suggestedAlternatives[0].subject}".`);
  }
  if (authentication.status === 'unknown') {
    recommendations.push('Verify your sending domain SPF and DMARC records to ensure inbox placement.');
  }

  function getStatus(score: number, max: number): 'good' | 'warning' | 'critical' {
    const pct = (score / max) * 100;
    if (pct >= 80) return 'good';
    if (pct >= 60) return 'warning';
    return 'critical';
  }

  const categories: Record<IssueCategory, CategoryScore> = {
    content: {
      category: 'content',
      name: 'Content & Copywriting',
      score: contentPts,
      maxScore: WEIGHTS.content,
      weightPercentage: 25,
      status: getStatus(contentPts, WEIGHTS.content),
      summary: `${content.wordCount} words, ${content.promotionalDensity}% promotional density, ${content.readabilityGrade} readability`,
    },
    html: {
      category: 'html',
      name: 'HTML & Code Hygiene',
      score: htmlPts,
      maxScore: WEIGHTS.html,
      weightPercentage: 20,
      status: getStatus(htmlPts, WEIGHTS.html),
      summary: `${html.totalSizeKb} KB total size, ${html.missingImageAltCount} images missing alt, ${html.hiddenElements.length} hidden elements`,
    },
    subject: {
      category: 'subject',
      name: 'Subject Line Health',
      score: subjectPts,
      maxScore: WEIGHTS.subject,
      weightPercentage: 15,
      status: getStatus(subjectPts, WEIGHTS.subject),
      summary: `${subject.characterCount} chars, ${subject.urgencyTriggers.length} urgency triggers, ${subject.emojiCount} emojis`,
    },
    authentication: {
      category: 'authentication',
      name: 'Domain Authentication',
      score: authPts,
      maxScore: WEIGHTS.authentication,
      weightPercentage: 15,
      status: getStatus(authPts, WEIGHTS.authentication),
      summary: `SPF: ${authentication.spf.status}, DMARC: ${authentication.dmarc.status}, DKIM: ${authentication.dkim.status}`,
    },
    compliance: {
      category: 'compliance',
      name: 'Legal & CAN-SPAM Compliance',
      score: compliancePts,
      maxScore: WEIGHTS.compliance,
      weightPercentage: 10,
      status: getStatus(compliancePts, WEIGHTS.compliance),
      summary: `Unsubscribe: ${compliance.hasUnsubscribeLink ? 'Present' : 'MISSING'}, Address: ${compliance.hasPhysicalAddress ? 'Present' : 'Missing'}`,
    },
    links: {
      category: 'links',
      name: 'Links & Tracking Security',
      score: linksPts,
      maxScore: WEIGHTS.links,
      weightPercentage: 10,
      status: getStatus(linksPts, WEIGHTS.links),
      summary: `${links.totalLinks} links, ${links.httpsRatio}% HTTPS, ${links.mismatchedLinks.length} mismatches`,
    },
    compatibility: {
      category: 'compatibility',
      name: 'Email Client Compatibility',
      score: compatPts,
      maxScore: WEIGHTS.compatibility,
      weightPercentage: 5,
      status: getStatus(compatPts, WEIGHTS.compatibility),
      summary: `Outlook: ${compatibility.outlookCompatibility}, Mobile: ${compatibility.mobileResponsive ? 'Yes' : 'No'}`,
    },
  };

  const checks: Record<string, { score: number; maxScore: number; passed: boolean; details: string }> = {
    'html.validity': {
      score: html.hasHtmlTag && html.hasBodyTag ? 5 : 2,
      maxScore: 5,
      passed: html.hasHtmlTag && html.hasBodyTag,
      details: html.hasHtmlTag && html.hasBodyTag ? 'Valid document structure' : 'Missing <!DOCTYPE> or <body> wrapper',
    },
    'html.clipping': {
      score: html.isGmailClippingRisk ? 0 : 5,
      maxScore: 5,
      passed: !html.isGmailClippingRisk,
      details: `${html.totalSizeKb} KB (Gmail clips at 102 KB)`,
    },
    'html.hidden_content': {
      score: html.hiddenElements.length === 0 && !html.zeroWidthCharactersFound ? 5 : 0,
      maxScore: 5,
      passed: html.hiddenElements.length === 0 && !html.zeroWidthCharactersFound,
      details: html.hiddenElements.length === 0 ? 'No cloaking or hidden text' : `${html.hiddenElements.length} hidden elements detected`,
    },
    'subject.urgency': {
      score: subject.urgencyTriggers.length === 0 && !subject.isAllCaps ? 5 : 1,
      maxScore: 5,
      passed: subject.urgencyTriggers.length === 0 && !subject.isAllCaps,
      details: subject.urgencyTriggers.length === 0 ? 'Natural tone without artificial panic' : `${subject.urgencyTriggers.length} urgency keywords`,
    },
    'compliance.unsubscribe': {
      score: compliance.hasUnsubscribeLink ? 5 : 0,
      maxScore: 5,
      passed: compliance.hasUnsubscribeLink,
      details: compliance.hasUnsubscribeLink ? 'Unsubscribe link present' : 'CRITICAL: Missing unsubscribe link',
    },
    'links.security': {
      score: links.mismatchedLinks.length === 0 && links.nonHttpsLinks.length === 0 ? 5 : 2,
      maxScore: 5,
      passed: links.mismatchedLinks.length === 0 && links.nonHttpsLinks.length === 0,
      details: `${links.httpsRatio}% secure HTTPS, no phishing mismatches`,
    },
    'auth.dns': {
      score: authentication.status === 'pass' ? 5 : authentication.status === 'unknown' ? 3 : 0,
      maxScore: 5,
      passed: authentication.status === 'pass' || authentication.status === 'neutral',
      details: `SPF: ${authentication.spf.status} | DMARC: ${authentication.dmarc.status}`,
    },
  };

  return {
    score: totalScore,
    risk,
    canSend,
    blockers,
    warnings,
    info,
    recommendations,
    categories,
    checks,
  };
}
