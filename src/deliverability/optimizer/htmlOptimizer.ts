import * as cheerio from 'cheerio';
import { OptimizationChange } from '../types';

export interface HtmlOptimizationResult {
  optimizedHtml: string;
  changes: OptimizationChange[];
  appliedFixes: string[];
}

export function optimizeHtml(
  rawHtml: string,
  options: {
    preserveTracking?: boolean;
    companyAddress?: string;
    unsubscribeUrl?: string;
  } = {}
): HtmlOptimizationResult {
  const changes: OptimizationChange[] = [];
  const appliedFixes: string[] = [];

  if (!rawHtml || !rawHtml.trim()) {
    return {
      optimizedHtml: '',
      changes: [],
      appliedFixes: [],
    };
  }

  let html = rawHtml;

  // 1. Remove zero-width characters (\u200B, \u200C, \u200D, \uFEFF, \u00AD)
  const hadZeroWidth = /[\u200B\u200C\u200D\uFEFF\u00AD]/.test(html);
  if (hadZeroWidth) {
    html = html.replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, '');
    changes.push({
      category: 'html',
      description: 'Removed invisible zero-width unicode characters',
      impact: 'major',
    });
    appliedFixes.push('Removed hidden zero-width characters');
  }

  // 2. Remove non-MSO comments that trigger heuristic spam filters
  const nonMsoCommentRegex = /<!--(?!\[if)[\s\S]*?-->/g;
  if (nonMsoCommentRegex.test(html)) {
    html = html.replace(nonMsoCommentRegex, '');
    changes.push({
      category: 'html',
      description: 'Stripped non-MSO HTML comments to reduce payload size',
      impact: 'minor',
    });
    appliedFixes.push('Cleaned unnecessary HTML comments');
  }

  // Parse with Cheerio
  const $ = cheerio.load(html, { xml: false });

  // 3. Remove prohibited and security-risk tags (script, iframe, form, object, embed)
  const dangerousTags = ['script', 'iframe', 'form', 'input[type="text"]', 'object', 'embed'];
  let removedTagCount = 0;
  dangerousTags.forEach((tag) => {
    const count = $(tag).length;
    if (count > 0) {
      $(tag).remove();
      removedTagCount += count;
    }
  });
  if (removedTagCount > 0) {
    changes.push({
      category: 'html',
      description: `Removed ${removedTagCount} prohibited/executable tag(s) (<script>, <iframe>, <form>)`,
      impact: 'major',
    });
    appliedFixes.push('Removed executable script and iframe tags');
  }

  // 4. Remove hidden elements (display:none, visibility:hidden, opacity:0, font-size:0, off-screen)
  let hiddenRemovedCount = 0;
  $('*').each((_, el) => {
    const style = ($(el).attr('style') || '').toLowerCase();
    const tagName = ((el as any).tagName || '').toLowerCase();

    // Do not touch standard document root tags
    if (['html', 'head', 'body', 'meta', 'link', 'style', 'title'].includes(tagName)) {
      return;
    }

    // Skip legitimate tracking pixels
    const src = $(el).attr('src') || '';
    const isTrackingPixel =
      tagName === 'img' &&
      (src.includes('track') || src.includes('open') || src.includes('pixel') || src.includes('beacon'));

    if (isTrackingPixel) return;

    // Check if element is a preheader (keep valid preheaders if concise)
    const text = $(el).text().trim();
    const isPreheader = text.length > 0 && text.length < 150 && (style.includes('font-size:0') || style.includes('max-height:0'));

    if (isPreheader) {
      return;
    }

    const isHidden =
      style.includes('display:none') ||
      style.includes('display: none') ||
      style.includes('visibility:hidden') ||
      style.includes('visibility: hidden') ||
      style.includes('opacity:0;') ||
      style.includes('opacity: 0;') ||
      style.includes('left:-99') ||
      style.includes('top:-99') ||
      style.includes('text-indent:-99');

    if (isHidden) {
      $(el).remove();
      hiddenRemovedCount++;
    }
  });

  if (hiddenRemovedCount > 0) {
    changes.push({
      category: 'html',
      description: `Removed ${hiddenRemovedCount} deceptive hidden/off-screen element(s)`,
      impact: 'major',
    });
    appliedFixes.push('Removed deceptive hidden content');
  }

  // 5. Add missing alt attributes to images
  let altAddedCount = 0;
  $('img').each((_, img) => {
    const alt = $(img).attr('alt');
    if (alt === undefined || alt.trim() === '') {
      // Derive a safe descriptive fallback
      const src = $(img).attr('src') || '';
      let fallbackAlt = 'Email visual';
      if (src.includes('logo')) fallbackAlt = 'Company Logo';
      else if (src.includes('header') || src.includes('banner')) fallbackAlt = 'Header Banner';
      else if (src.includes('icon')) fallbackAlt = 'Feature Icon';

      $(img).attr('alt', fallbackAlt);
      altAddedCount++;
    }
  });
  if (altAddedCount > 0) {
    changes.push({
      category: 'html',
      description: `Added descriptive alt attributes to ${altAddedCount} image(s)`,
      impact: 'moderate',
    });
    appliedFixes.push('Added missing image alt attributes');
  }

  // 6. Ensure accessibility on layout tables
  let tablesRoleFixed = 0;
  $('table').each((_, tbl) => {
    const role = $(tbl).attr('role');
    if (!role) {
      $(tbl).attr('role', 'presentation');
      $(tbl).attr('cellpadding', $(tbl).attr('cellpadding') || '0');
      $(tbl).attr('cellspacing', $(tbl).attr('cellspacing') || '0');
      $(tbl).attr('border', $(tbl).attr('border') || '0');
      tablesRoleFixed++;
    }
  });
  if (tablesRoleFixed > 0) {
    changes.push({
      category: 'compatibility',
      description: `Added role="presentation" to ${tablesRoleFixed} layout table(s) for screen reader accessibility and Outlook consistency`,
      impact: 'minor',
    });
    appliedFixes.push('Standardized table layout accessibility attributes');
  }

  // 7. Upgrade insecure HTTP links to HTTPS (where safe)
  let httpUpgradedCount = 0;
  $('a').each((_, a) => {
    const href = $(a).attr('href') || '';
    if (href.startsWith('http://') && !href.includes('localhost')) {
      $(a).attr('href', href.replace(/^http:\/\//i, 'https://'));
      httpUpgradedCount++;
    }
  });
  if (httpUpgradedCount > 0) {
    changes.push({
      category: 'links',
      description: `Upgraded ${httpUpgradedCount} link(s) from HTTP to secure HTTPS`,
      impact: 'moderate',
    });
    appliedFixes.push('Upgraded HTTP links to HTTPS');
  }

  // 8. Ensure Unsubscribe link and Physical Address footer are present
  const lowerBody = $('body').text().toLowerCase();
  const hasUnsub =
    lowerBody.includes('unsubscribe') ||
    lowerBody.includes('opt-out') ||
    lowerBody.includes('se désabonner') ||
    lowerBody.includes('إلغاء الاشتراك') ||
    html.includes('{{unsubscribe_url}}') ||
    html.includes('%unsubscribe_url%');

  const defaultUnsubUrl = options.unsubscribeUrl || '{{unsubscribe_url}}';
  const defaultAddress = options.companyAddress || '100 Innovation Parkway, Suite 400, San Francisco, CA 94105';

  if (!hasUnsub) {
    const footerHtml = `
<div id="emailin-compliance-footer" style="margin-top: 32px; padding: 20px 10px; border-top: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; line-height: 18px; color: #64748b; text-align: center;">
  <p style="margin: 0 0 8px 0;">You are receiving this email because you subscribed to updates from our team.</p>
  <p style="margin: 0 0 8px 0;">
    <a href="${defaultUnsubUrl}" style="color: #475569; text-decoration: underline;">Unsubscribe</a> | 
    <a href="{{preferences_url}}" style="color: #475569; text-decoration: underline;">Manage Preferences</a> | 
    <a href="https://example.com/privacy" style="color: #475569; text-decoration: underline;">Privacy Policy</a>
  </p>
  <p style="margin: 0; font-size: 11px; color: #94a3b8;">${defaultAddress}</p>
</div>`;

    if ($('body').length > 0) {
      $('body').append(footerHtml);
    } else {
      $.root().append(footerHtml);
    }

    changes.push({
      category: 'compliance',
      description: 'Appended standard CAN-SPAM / GDPR compliant footer with unsubscribe placeholder and physical address',
      impact: 'major',
    });
    appliedFixes.push('Injected compliant unsubscribe footer and business address');
  }

  // 9. Ensure standard DOCTYPE, HTML, HEAD, BODY wrappers
  let resultHtml = $.html();
  const hasDoctype = /<!doctype html>/i.test(resultHtml);
  if (!hasDoctype) {
    if (!$('head').length) {
      resultHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
${resultHtml}
</body>
</html>`;
    } else {
      resultHtml = `<!DOCTYPE html>\n${resultHtml}`;
    }
    changes.push({
      category: 'html',
      description: 'Wrapped email in standard HTML5 email doctype and responsive viewport meta tags',
      impact: 'moderate',
    });
    appliedFixes.push('Standardized email DOCTYPE and viewport meta tags');
  }

  return {
    optimizedHtml: resultHtml,
    changes,
    appliedFixes,
  };
}
