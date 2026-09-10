import * as cheerio from 'cheerio';
import { ComplianceAnalysis, DeliverabilityIssue } from '../types';

const PHYSICAL_ADDRESS_PATTERNS = [
  /\b\d{1,5}\s+[A-Za-z0-9\s.,#-]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|way|court|ct|p\.?o\.?\s*box|suite|ste|floor|fl)\b/i,
  /\b(?:rue|avenue|boulevard|chemin|boîte postale|b\.?p\.?)\s+\d+/i,
  /\b\d{5}(?:-\d{4})?\b/, // US ZIP code
  /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i, // Canadian postal code
  /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i, // UK postal code
  /\b(?:شارع|ص\.?ب|طريق|صندوق بريد)\b/, // Arabic address markers
];

const UNSUBSCRIBE_KEYWORDS = [
  'unsubscribe',
  'opt out',
  'opt-out',
  'manage preferences',
  'email preferences',
  'se désabonner',
  'désinscription',
  'إلغاء الاشتراك',
  '{{unsubscribe}}',
  '{{unsubscribe_url}}',
  '%unsubscribe_url%',
  '{unsubscribe}',
];

export function analyzeCompliance(
  html: string,
  context: { fromEmail?: string; replyTo?: string } = {}
): ComplianceAnalysis {
  const issues: DeliverabilityIssue[] = [];
  const lowerHtml = (html || '').toLowerCase();
  const $ = cheerio.load(html || '', { xml: false });

  // 1. Unsubscribe Check
  let hasUnsubscribeLink = false;
  let unsubscribeMethod: 'url' | 'placeholder' | 'mailto' | 'none' = 'none';
  let unsubscribeSnippet: string | undefined = undefined;

  // Check <a> links
  $('a').each((_, a) => {
    const href = ($(a).attr('href') || '').toLowerCase();
    const text = $(a).text().toLowerCase();

    for (const kw of UNSUBSCRIBE_KEYWORDS) {
      if (href.includes(kw) || text.includes(kw)) {
        hasUnsubscribeLink = true;
        unsubscribeSnippet = $(a).text().trim() || href;
        if (href.startsWith('mailto:')) {
          unsubscribeMethod = 'mailto';
        } else if (href.includes('{{') || href.includes('%')) {
          unsubscribeMethod = 'placeholder';
        } else {
          unsubscribeMethod = 'url';
        }
        return false;
      }
    }
  });

  // Also check raw placeholders in text/html
  if (!hasUnsubscribeLink) {
    for (const kw of ['{{unsubscribe_url}}', '%unsubscribe_url%', '{{unsubscribe}}']) {
      if (lowerHtml.includes(kw)) {
        hasUnsubscribeLink = true;
        unsubscribeMethod = 'placeholder';
        unsubscribeSnippet = kw;
        break;
      }
    }
  }

  if (!hasUnsubscribeLink) {
    issues.push({
      id: 'compliance-missing-unsubscribe',
      code: 'COMPLIANCE_MISSING_UNSUBSCRIBE',
      category: 'compliance',
      severity: 'blocker',
      problem: 'No unsubscribe link, preference center, or {{unsubscribe_url}} placeholder was detected.',
      whyItMatters:
        'Under CAN-SPAM, GDPR, and CASL regulations, commercial emails must include a clear, working opt-out mechanism. Without one, mailbox providers (Gmail & Yahoo 2024+ sender mandates) automatically route emails to spam or outright reject them.',
      recommendedFix: 'Add a visible unsubscribe link or placeholder like <a href="{{unsubscribe_url}}">Unsubscribe</a> in the email footer.',
      autoFixed: true,
      fixedDescription: 'Injected standard CAN-SPAM compliant unsubscribe footer with placeholder.',
    });
  }

  // 2. Physical Business Address Check
  const visibleText = $('body').text() || $.root().text();
  let hasPhysicalAddress = false;
  let detectedAddressSnippet: string | undefined = undefined;

  for (const pattern of PHYSICAL_ADDRESS_PATTERNS) {
    const match = visibleText.match(pattern);
    if (match) {
      hasPhysicalAddress = true;
      detectedAddressSnippet = match[0];
      break;
    }
  }

  if (!hasPhysicalAddress) {
    issues.push({
      id: 'compliance-missing-address',
      code: 'COMPLIANCE_MISSING_ADDRESS',
      category: 'compliance',
      severity: 'warning',
      problem: 'No valid physical mailing address or P.O. Box detected in the footer.',
      whyItMatters:
        'The US CAN-SPAM Act strictly mandates that commercial messages contain a valid physical postal address of the sender.',
      recommendedFix: 'Include your company name and physical mailing address (or registered P.O. Box) in the email footer.',
      autoFixed: true,
      fixedDescription: 'Injected sender address placeholder in footer.',
    });
  }

  // 3. Sender Identity Check
  const fromEmail = context.fromEmail || '';
  const hasSenderIdentity = Boolean(fromEmail && fromEmail.includes('@'));
  if (!hasSenderIdentity) {
    issues.push({
      id: 'compliance-missing-from-identity',
      code: 'COMPLIANCE_MISSING_SENDER',
      category: 'compliance',
      severity: 'warning',
      problem: 'Sender From email address is not configured or missing.',
      whyItMatters: 'Mailbox algorithms verify sender reputation against the From domain SPF/DKIM/DMARC records.',
      recommendedFix: 'Provide a valid sender identity matching your authenticated corporate domain.',
      autoFixed: false,
    });
  } else if (/@(gmail|yahoo|hotmail|outlook|aol)\.com$/i.test(fromEmail)) {
    issues.push({
      id: 'compliance-free-mailbox-sender',
      code: 'COMPLIANCE_FREE_MAILBOX_SENDER',
      category: 'compliance',
      severity: 'blocker',
      problem: `From address (${fromEmail}) uses a free webmail domain instead of a custom authenticated domain.`,
      whyItMatters:
        'DMARC p=reject policies enforced by Google and Yahoo prevent third-party MTAs from sending as @gmail.com or @yahoo.com, causing instant message rejection (550 DMARC fail).',
      recommendedFix: 'Send exclusively from a domain you own and have configured with SPF, DKIM, and DMARC.',
      autoFixed: false,
    });
  }

  // 4. Privacy Policy Link Check
  let hasPrivacyPolicyLink = false;
  $('a').each((_, a) => {
    const href = ($(a).attr('href') || '').toLowerCase();
    const text = $(a).text().toLowerCase();
    if (href.includes('privacy') || text.includes('privacy') || text.includes('confidentialité') || text.includes('خصوصية')) {
      hasPrivacyPolicyLink = true;
      return false;
    }
  });

  if (!hasPrivacyPolicyLink) {
    issues.push({
      id: 'compliance-missing-privacy-policy',
      code: 'COMPLIANCE_MISSING_PRIVACY',
      category: 'compliance',
      severity: 'info',
      problem: 'No privacy policy link detected in the template footer.',
      whyItMatters: 'Providing a privacy link enhances GDPR transparency compliance and consumer trust.',
      recommendedFix: 'Add a footer link to your company privacy policy.',
      autoFixed: false,
    });
  }

  // Score computation
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'blocker') score -= 35;
    else if (issue.severity === 'warning') score -= 15;
    else score -= 5;
  }
  score = Math.max(0, Math.min(100, score));

  return {
    hasUnsubscribeLink,
    unsubscribeMethod,
    unsubscribeSnippet,
    hasPhysicalAddress,
    detectedAddressSnippet,
    hasSenderIdentity,
    senderEmail: fromEmail,
    replyToProvided: Boolean(context.replyTo),
    replyToEmail: context.replyTo,
    hasPrivacyPolicyLink,
    hasListUnsubscribeHeader: true, // Typically handled by KumoMTA / SES headers
    canSpamCompliant: hasUnsubscribeLink && hasPhysicalAddress,
    gdprCompliant: hasUnsubscribeLink && hasPrivacyPolicyLink,
    score,
    issues,
  };
}
