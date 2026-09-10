import * as cheerio from 'cheerio';
import { DeliverabilityIssue, HtmlAnalysis, HtmlElementDetail } from '../types';

export function analyzeHtml(rawHtml: string): HtmlAnalysis {
  const issues: DeliverabilityIssue[] = [];
  const html = rawHtml || '';
  const totalSizeBytes = Buffer.byteLength(html, 'utf8');
  const totalSizeKb = Math.round((totalSizeBytes / 1024) * 10) / 10;

  // 1. Structure tags check
  const lowerHtml = html.toLowerCase();
  const hasHtmlTag = /<html[\s>]/i.test(lowerHtml);
  const hasHeadTag = /<head[\s>]/i.test(lowerHtml);
  const hasBodyTag = /<body[\s>]/i.test(lowerHtml);

  if (!hasHtmlTag || !hasBodyTag) {
    issues.push({
      id: 'html-missing-doctype-or-body',
      code: 'HTML_MISSING_BODY',
      category: 'html',
      severity: 'warning',
      problem: 'Email HTML is missing standard <html> or <body> tags.',
      whyItMatters:
        'Email clients (especially Outlook and Gmail web) wrap bare HTML fragments unpredictably, frequently corrupting font sizes, alignment, and background colors.',
      recommendedFix: 'Wrap email content in a standard HTML document structure with <!DOCTYPE html>, <html>, <head>, and <body> tags.',
      autoFixed: true,
      fixedDescription: 'Injected standard HTML5 doctype, head, and body wrappers.',
    });
  }

  // 2. Gmail 102KB clipping check
  const isGmailClippingRisk = totalSizeKb >= 102;
  if (isGmailClippingRisk) {
    issues.push({
      id: 'html-gmail-clipping',
      code: 'HTML_GMAIL_CLIPPING',
      category: 'html',
      severity: 'blocker',
      problem: `Email HTML size is ${totalSizeKb} KB, exceeding Gmail's 102 KB clipping threshold.`,
      whyItMatters:
        'Gmail truncates emails exceeding 102 KB with "[Message clipped] View entire message". This cuts off the unsubscribe link (triggering spam complaints) and hides the open tracking pixel.',
      recommendedFix: 'Minify HTML, compress inline CSS, remove unused attributes, and optimize markup so total size remains below 95 KB.',
      autoFixed: false,
    });
  } else if (totalSizeKb > 95) {
    issues.push({
      id: 'html-near-clipping',
      code: 'HTML_NEAR_CLIPPING',
      category: 'html',
      severity: 'warning',
      problem: `Email HTML size is ${totalSizeKb} KB, dangerously close to Gmail's 102 KB limit.`,
      whyItMatters: 'Adding ESP tracking pixels or dynamic content during sending may push the final message size over 102 KB.',
      recommendedFix: 'Reduce HTML overhead to comfortably under 90 KB.',
      autoFixed: false,
    });
  }

  // 3. Zero-width and obfuscated characters
  const zeroWidthRegex = /[\u200B\u200C\u200D\uFEFF\u00AD]/g;
  const zeroWidthMatches = html.match(zeroWidthRegex);
  const zeroWidthCharactersFound = Boolean(zeroWidthMatches && zeroWidthMatches.length > 0);
  if (zeroWidthCharactersFound) {
    issues.push({
      id: 'html-zero-width-chars',
      code: 'HTML_ZERO_WIDTH_CHARS',
      category: 'html',
      severity: 'blocker',
      problem: `Detected ${zeroWidthMatches?.length} hidden zero-width characters (e.g. \\u200B, \\uFEFF).`,
      whyItMatters:
        'Spam filters flag zero-width characters as hash-busting or keyword obfuscation attempts, directly routing messages to the spam folder.',
      recommendedFix: 'Strip all non-printing zero-width unicode characters from the template.',
      autoFixed: true,
      fixedDescription: 'Removed all hidden zero-width characters.',
    });
  }

  // 4. Excessive comments
  const commentMatches = html.match(/<!--[\s\S]*?-->/g) || [];
  let totalCommentLength = 0;
  for (const c of commentMatches) {
    // Exclude MSO conditional comments like <!--[if mso]>
    if (!c.includes('[if') && !c.includes('<![endif]')) {
      totalCommentLength += c.length;
    }
  }
  if (totalCommentLength > 1500) {
    issues.push({
      id: 'html-excessive-comments',
      code: 'HTML_EXCESSIVE_COMMENTS',
      category: 'html',
      severity: 'warning',
      problem: `HTML contains ${Math.round(totalCommentLength / 1024)} KB of non-MSO comments.`,
      whyItMatters:
        'Large blocks of hidden comments inflate email file size and can trigger heuristic spam filters that look for hidden comment text.',
      recommendedFix: 'Remove unnecessary development comments prior to deployment.',
      autoFixed: true,
      fixedDescription: 'Stripped non-conditional HTML comments.',
    });
  }

  // Parse DOM with Cheerio
  const $ = cheerio.load(html, { xml: false });

  // 5. Unsupported & dangerous elements
  const unsupportedElements: string[] = [];
  const dangerousTags = ['script', 'iframe', 'form', 'input', 'button[type="submit"]', 'object', 'embed', 'svg'];
  dangerousTags.forEach((tag) => {
    const count = $(tag).length;
    if (count > 0) {
      unsupportedElements.push(`${tag} (${count})`);
      const isSecurityRisk = ['script', 'iframe', 'object', 'embed'].includes(tag);
      issues.push({
        id: `html-unsupported-${tag}`,
        code: `HTML_TAG_${tag.toUpperCase()}`,
        category: 'html',
        severity: isSecurityRisk ? 'blocker' : 'warning',
        problem: `Found prohibited or risky tag <${tag}> (${count} occurrence${count > 1 ? 's' : ''}).`,
        whyItMatters: isSecurityRisk
          ? 'Modern mail clients (Gmail, Outlook, Apple Mail) strictly block or quarantine emails containing active scripts or executable embeds.'
          : `<${tag}> elements are not supported in major desktop and web email clients (like Outlook Desktop), causing broken layout or failed interactions.`,
        recommendedFix: isSecurityRisk
          ? `Remove <${tag}> tags entirely.`
          : `Replace interactive <${tag}> elements with standard HTML tables, static images, and <a> links.`,
        autoFixed: isSecurityRisk,
        fixedDescription: isSecurityRisk ? `Removed <${tag}> elements.` : undefined,
      });
    }
  });

  // 6. Hidden elements & suspicious CSS
  const hiddenElements: HtmlElementDetail[] = [];
  const suspiciousCss: string[] = [];
  const zeroSizeElements: HtmlElementDetail[] = [];
  const offScreenElements: HtmlElementDetail[] = [];
  let transparentTextFound = false;

  $('*').each((_, el) => {
    const style = ($(el).attr('style') || '').toLowerCase();
    const width = $(el).attr('width');
    const height = $(el).attr('height');
    const tagName = ((el as any).tagName || '').toLowerCase();

    // Ignore html, head, body, meta, link, script, style tags
    if (['html', 'head', 'meta', 'link', 'style', 'title'].includes(tagName)) {
      return;
    }

    // Skip legitimate tracking pixels when evaluating zero-size
    const isImg = tagName === 'img';
    const src = $(el).attr('src') || '';
    const isTrackingPixel = isImg && (src.includes('track') || src.includes('open') || src.includes('pixel') || src.includes('beacon'));

    // Check display:none or visibility:hidden
    if (style.includes('display:none') || style.includes('display: none') || style.includes('visibility:hidden') || style.includes('visibility: hidden')) {
      // Check if it is an email preheader (preheader is common, but must have text and reasonable size)
      const text = $(el).text().trim();
      const isPreheader = text.length > 0 && text.length < 200 && (style.includes('font-size:0') || style.includes('max-height:0'));
      if (!isPreheader) {
        hiddenElements.push({
          type: tagName,
          snippet: style.slice(0, 100),
          reason: 'Element hidden via display:none or visibility:hidden',
        });
      }
    }

    // Check zero-size elements (non-tracking pixels)
    if (!isTrackingPixel && ((width === '0' && height === '0') || style.includes('font-size:0px') || style.includes('font-size: 0'))) {
      const text = $(el).text().trim();
      if (text.length > 0 && text.length > 150) {
        zeroSizeElements.push({
          type: tagName,
          snippet: style.slice(0, 100),
          reason: 'Text container with zero dimensions or zero font-size',
        });
      }
    }

    // Check off-screen positioning
    if (
      style.includes('left:-') ||
      style.includes('left: -') ||
      style.includes('top:-') ||
      style.includes('top: -') ||
      style.includes('margin-left:-9') ||
      style.includes('text-indent:-999')
    ) {
      offScreenElements.push({
        type: tagName,
        snippet: style.slice(0, 100),
        reason: 'Off-screen negative positioning',
      });
    }

    // Check transparent text
    if (
      style.includes('color:transparent') ||
      style.includes('color: rgba(0,0,0,0)') ||
      style.includes('color:rgba(0,0,0,0)') ||
      style.includes('opacity:0;') ||
      style.includes('opacity: 0;')
    ) {
      transparentTextFound = true;
    }
  });

  if (hiddenElements.length > 0) {
    issues.push({
      id: 'html-hidden-elements',
      code: 'HTML_HIDDEN_CONTENT',
      category: 'html',
      severity: 'blocker',
      problem: `Detected ${hiddenElements.length} hidden element(s) with display:none or visibility:hidden.`,
      whyItMatters:
        'Hidden text and elements are heavily penalized by spam algorithms (SpamAssassin, Barracuda, Gmail spam filters) as deceptive cloaking techniques.',
      recommendedFix: 'Remove hidden containers or convert them to visible, legitimate email content.',
      autoFixed: true,
      fixedDescription: 'Removed deceptive hidden elements.',
    });
  }

  if (offScreenElements.length > 0) {
    issues.push({
      id: 'html-offscreen-elements',
      code: 'HTML_OFFSCREEN_ELEMENTS',
      category: 'html',
      severity: 'blocker',
      problem: `Detected ${offScreenElements.length} element(s) positioned off-screen using negative coordinates.`,
      whyItMatters: 'Off-screen positioning is treated as an obfuscation technique by modern Bayesian filters.',
      recommendedFix: 'Eliminate negative position offsets (e.g. left: -9999px).',
      autoFixed: true,
      fixedDescription: 'Removed off-screen negative positioning styles.',
    });
  }

  if (transparentTextFound) {
    issues.push({
      id: 'html-transparent-text',
      code: 'HTML_TRANSPARENT_TEXT',
      category: 'html',
      severity: 'blocker',
      problem: 'Found transparent or 0-opacity text styling in the HTML body.',
      whyItMatters: 'Transparent text is flagged as an invisible keyword-stuffing tactic designed to manipulate search indices and spam scanners.',
      recommendedFix: 'Remove transparent and 0-opacity color rules.',
      autoFixed: true,
      fixedDescription: 'Restored legible text contrast and removed transparent opacity.',
    });
  }

  // 7. Image ALT tags & Image-to-Text ratio
  const images = $('img');
  const totalImagesCount = images.length;
  let missingImageAltCount = 0;

  images.each((_, img) => {
    const alt = $(img).attr('alt');
    if (alt === undefined || alt.trim() === '') {
      missingImageAltCount++;
    }
  });

  if (missingImageAltCount > 0) {
    issues.push({
      id: 'html-missing-image-alt',
      code: 'HTML_MISSING_IMG_ALT',
      category: 'html',
      severity: 'warning',
      problem: `${missingImageAltCount} of ${totalImagesCount} image(s) lack descriptive alt attributes.`,
      whyItMatters:
        'When email clients block remote images by default, users see empty boxes. Accessible alt attributes provide context, prevent unsubscribe triggers, and improve deliverability reputation.',
      recommendedFix: 'Provide concise descriptive alt text for each image.',
      autoFixed: true,
      fixedDescription: 'Added descriptive alt tags to images.',
    });
  }

  // Calculate visible text length
  $('script, style, noscript').remove();
  const bodyText = $('body').text() || $.root().text();
  const visibleWordCount = bodyText.trim().split(/\s+/).filter(Boolean).length;
  const imageToTextRatio = visibleWordCount === 0 ? 100 : Math.round((totalImagesCount / (visibleWordCount / 20)) * 10);

  if (totalImagesCount >= 3 && visibleWordCount < 50) {
    issues.push({
      id: 'html-high-image-ratio',
      code: 'HTML_HIGH_IMAGE_RATIO',
      category: 'html',
      severity: 'warning',
      problem: `High image-to-text ratio: ${totalImagesCount} images with only ${visibleWordCount} words of text.`,
      whyItMatters:
        'Image-only emails cannot be indexed by content filters, and spam filters heavily penalize emails that lack substantial legible body copy.',
      recommendedFix: 'Add at least 150-200 words of real text to balance the email template.',
      autoFixed: false,
    });
  }

  // 8. Nesting depth & Table count
  let maxDepth = 0;
  function getDepth(el: any, currentDepth: number) {
    if (currentDepth > maxDepth) maxDepth = currentDepth;
    $(el)
      .children()
      .each((_, child) => getDepth(child, currentDepth + 1));
  }
  $('body')
    .children()
    .each((_, child) => getDepth(child, 1));

  const tableCount = $('table').length;
  if (maxDepth > 15) {
    issues.push({
      id: 'html-excessive-nesting',
      code: 'HTML_EXCESSIVE_NESTING',
      category: 'html',
      severity: 'warning',
      problem: `Excessive DOM nesting depth (${maxDepth} levels).`,
      whyItMatters: 'Deeply nested markup often breaks in Outlook and mobile rendering engines, causing clipping and horizontal scrolling.',
      recommendedFix: 'Simplify DOM structure and flatten nested container tables.',
      autoFixed: false,
    });
  }

  // 9. Unsupported CSS rules check (CSS variables, CSS grid)
  const unsupportedCssFeatures: string[] = [];
  const fullHtml = $.html().toLowerCase();
  if (fullHtml.includes('var(--')) {
    unsupportedCssFeatures.push('CSS Custom Properties (var(--*))');
  }
  if (fullHtml.includes('display:grid') || fullHtml.includes('display: grid')) {
    unsupportedCssFeatures.push('CSS Grid (display: grid)');
  }
  if (fullHtml.includes('position:fixed') || fullHtml.includes('position: fixed')) {
    unsupportedCssFeatures.push('Fixed Positioning (position: fixed)');
  }

  if (unsupportedCssFeatures.length > 0) {
    issues.push({
      id: 'html-unsupported-css',
      code: 'HTML_UNSUPPORTED_CSS',
      category: 'compatibility',
      severity: 'warning',
      problem: `Found CSS features unsupported in major email clients: ${unsupportedCssFeatures.join(', ')}.`,
      whyItMatters: 'Outlook and older mobile clients do not support modern CSS grid or variables, leading to broken email rendering.',
      recommendedFix: 'Use inline fallback styles and standard HTML table layouts.',
      autoFixed: true,
      fixedDescription: 'Replaced unsupported CSS with inline email-safe styling.',
    });
  }

  // Compute HTML category score (0-100)
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'blocker') score -= 25;
    else if (issue.severity === 'warning') score -= 10;
    else score -= 3;
  }
  score = Math.max(0, Math.min(100, score));

  return {
    isValid: issues.filter((i) => i.severity === 'blocker').length === 0,
    hasHtmlTag,
    hasBodyTag,
    hasHeadTag,
    totalSizeKb,
    isGmailClippingRisk,
    nestingDepth: maxDepth,
    tableCount,
    inlineStylesCount: $('[style]').length,
    hiddenElements,
    suspiciousCss,
    zeroSizeElements,
    transparentTextFound,
    offScreenElements,
    hiddenLinks: [],
    zeroWidthCharactersFound,
    excessiveCommentsLength: totalCommentLength,
    missingImageAltCount,
    totalImagesCount,
    imageToTextRatio,
    unsupportedElements,
    unsupportedCssFeatures,
    accessibilityIssues: missingImageAltCount > 0 ? [`${missingImageAltCount} images missing alt text`] : [],
    score,
    issues,
  };
}
