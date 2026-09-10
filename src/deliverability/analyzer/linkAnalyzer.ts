import * as cheerio from 'cheerio';
import { DeliverabilityIssue, LinkAnalysis, LinkClassification, LinkItem } from '../types';

const KNOWN_SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  'ow.ly',
  't.co',
  'is.gd',
  'buff.ly',
  'adf.ly',
  'shorturl.at',
  'cutt.ly',
  'rb.gy',
]);

const TRACKING_QUERY_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'mc_cid',
  'mc_eid',
  'fbclid',
  'gclid',
  '_hsenc',
  '_hsmi',
  'trk',
  'token',
];

export function analyzeLinks(
  html: string,
  options: { preserveTracking?: boolean } = { preserveTracking: true }
): LinkAnalysis {
  const issues: DeliverabilityIssue[] = [];
  const links: LinkItem[] = [];
  const uniqueDomains = new Set<string>();
  const nonHttpsLinks: string[] = [];
  const shortenerLinks: string[] = [];
  const mismatchedLinks: LinkItem[] = [];

  if (!html) {
    return {
      totalLinks: 0,
      uniqueDomains: [],
      httpsRatio: 100,
      nonHttpsLinks: [],
      shortenerLinks: [],
      mismatchedLinks: [],
      linksPer100Words: 0,
      links: [],
      score: 100,
      issues: [],
    };
  }

  const $ = cheerio.load(html, { xml: false });
  const aTags = $('a');

  // Compute word count to calculate links per 100 words
  const visibleText = $('body').text() || $.root().text();
  const wordCount = visibleText.trim().split(/\s+/).filter(Boolean).length;

  aTags.each((_, el) => {
    const rawHref = ($(el).attr('href') || '').trim();
    const anchorText = $(el).text().trim();

    // Skip mailto, tel, anchors
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
      return;
    }

    let urlObj: URL | null = null;
    let hostname = '';
    let isHttps = false;
    const trackingParamsFound: string[] = [];

    try {
      urlObj = new URL(rawHref);
      hostname = urlObj.hostname.toLowerCase();
      isHttps = urlObj.protocol === 'https:';
      uniqueDomains.add(hostname);

      // Check tracking query parameters
      for (const p of TRACKING_QUERY_PARAMS) {
        if (urlObj.searchParams.has(p)) {
          trackingParamsFound.push(p);
        }
      }
    } catch {
      // Relative or malformed URL
      hostname = 'invalid-or-relative';
      isHttps = false;
    }

    if (!isHttps && rawHref.startsWith('http://')) {
      nonHttpsLinks.push(rawHref);
    }

    // Check if shortener
    const isShortener = KNOWN_SHORTENERS.has(hostname);
    if (isShortener) {
      shortenerLinks.push(rawHref);
    }

    // Anchor text vs URL mismatch (Anti-phishing heuristic)
    let isMismatch = false;
    if (anchorText && /^https?:\/\//i.test(anchorText)) {
      try {
        const anchorUrl = new URL(anchorText);
        if (anchorUrl.hostname.toLowerCase() !== hostname) {
          isMismatch = true;
        }
      } catch {
        // Not a URL anchor text
      }
    }

    // Classify link
    let classification: LinkClassification = 'optional_tracking';
    const isUnsubscribe =
      rawHref.toLowerCase().includes('unsub') ||
      anchorText.toLowerCase().includes('unsubscribe') ||
      anchorText.toLowerCase().includes('opt-out');

    if (isUnsubscribe || rawHref.includes('/api/tracking/') || rawHref.includes('{{unsubscribe_url}}')) {
      classification = 'essential_tracking';
    } else if (isShortener || !isHttps || isMismatch) {
      classification = 'potentially_problematic';
    }

    const item: LinkItem = {
      url: rawHref,
      hostname,
      isHttps,
      anchorText: anchorText.slice(0, 100),
      isMismatch,
      hasTrackingParams: trackingParamsFound.length > 0,
      trackingParams: trackingParamsFound,
      isShortener,
      classification,
      riskNote: isMismatch
        ? 'Phishing risk: Anchor text displays a different domain than destination URL.'
        : isShortener
        ? 'Generic URL shorteners are heavily penalized by spam filters due to widespread malware usage.'
        : !isHttps
        ? 'Insecure HTTP link triggers browser security warnings and spam scoring.'
        : undefined,
    };

    links.push(item);
    if (isMismatch) {
      mismatchedLinks.push(item);
    }
  });

  const totalLinks = links.length;
  const httpsRatio = totalLinks > 0 ? Math.round(((totalLinks - nonHttpsLinks.length) / totalLinks) * 100) : 100;
  const linksPer100Words = wordCount > 0 ? Math.round((totalLinks / (wordCount / 100)) * 10) / 10 : totalLinks;

  // 1. Phishing / Mismatch issue
  if (mismatchedLinks.length > 0) {
    issues.push({
      id: 'links-mismatched-anchor',
      code: 'LINKS_ANCHOR_MISMATCH',
      category: 'links',
      severity: 'blocker',
      problem: `Detected ${mismatchedLinks.length} deceptive link(s) where anchor text displays a different domain than the actual destination URL.`,
      whyItMatters:
        'Displaying "https://trusted-site.com" while linking to another URL is the #1 heuristic used by Microsoft SmartScreen and Gmail Anti-Phishing to block emails.',
      recommendedFix: 'Align visible anchor text with the real destination hostname or use descriptive button text (e.g., "Visit Website").',
      autoFixed: true,
      fixedDescription: 'Updated anchor text to match destination hostname.',
    });
  }

  // 2. Generic URL shorteners
  if (shortenerLinks.length > 0) {
    issues.push({
      id: 'links-url-shorteners',
      code: 'LINKS_URL_SHORTENERS',
      category: 'links',
      severity: 'blocker',
      problem: `Found ${shortenerLinks.length} public URL shortener link(s) (e.g. bit.ly, tinyurl).`,
      whyItMatters:
        'Public URL shorteners hide destination domains and share reputation with bad actors, causing reputable mailbox providers to immediately filter the message.',
      recommendedFix: 'Use direct corporate branded domain links or a dedicated custom tracking domain.',
      autoFixed: false,
    });
  }

  // 3. Insecure HTTP links
  if (nonHttpsLinks.length > 0) {
    issues.push({
      id: 'links-non-https',
      code: 'LINKS_NON_HTTPS',
      category: 'links',
      severity: 'warning',
      problem: `Found ${nonHttpsLinks.length} unencrypted (HTTP) link(s).`,
      whyItMatters: 'Unencrypted links trigger modern browser mixed-content warnings and reduce recipient trust.',
      recommendedFix: 'Upgrade all links to secure HTTPS URLs.',
      autoFixed: true,
      fixedDescription: 'Upgraded HTTP links to HTTPS.',
    });
  }

  // 4. Excessive link density
  if (linksPer100Words > 6 && totalLinks > 5) {
    issues.push({
      id: 'links-excessive-density',
      code: 'LINKS_EXCESSIVE_DENSITY',
      category: 'links',
      severity: 'warning',
      problem: `Excessive link density: ${linksPer100Words} links per 100 words (${totalLinks} total links).`,
      whyItMatters:
        'High link density resembles link farms and promotional spam, leading to higher spam folder routing.',
      recommendedFix: 'Reduce secondary links and focus the recipient on 1 or 2 primary actions.',
      autoFixed: false,
    });
  }

  // Calculate score
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'blocker') score -= 30;
    else if (issue.severity === 'warning') score -= 12;
    else score -= 4;
  }
  score = Math.max(0, Math.min(100, score));

  return {
    totalLinks,
    uniqueDomains: Array.from(uniqueDomains),
    httpsRatio,
    nonHttpsLinks,
    shortenerLinks,
    mismatchedLinks,
    linksPer100Words,
    links,
    score,
    issues,
  };
}
