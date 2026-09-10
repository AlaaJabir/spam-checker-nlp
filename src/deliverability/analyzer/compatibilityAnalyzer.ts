import * as cheerio from 'cheerio';
import { CompatibilityAnalysis, DeliverabilityIssue } from '../types';

export function analyzeCompatibility(html: string): CompatibilityAnalysis {
  const issues: DeliverabilityIssue[] = [];
  const lowerHtml = (html || '').toLowerCase();
  const $ = cheerio.load(html || '', { xml: false });

  const unsupportedFeatures: string[] = [];
  let outlookCompatibility: 'good' | 'warning' | 'poor' = 'good';
  let gmailCompatibility: 'good' | 'warning' | 'poor' = 'good';
  let appleMailCompatibility: 'good' | 'warning' | 'poor' = 'good';
  let yahooCompatibility: 'good' | 'warning' | 'poor' = 'good';

  // 1. Table layout fallback check for Outlook
  const tableCount = $('table').length;
  const divCount = $('div').length;
  const hasTableLayoutFallback = tableCount > 0;

  if (divCount > 5 && tableCount === 0) {
    outlookCompatibility = 'poor';
    unsupportedFeatures.push('Div-only layout (breaks multi-column in Outlook desktop)');
    issues.push({
      id: 'compat-outlook-tables',
      code: 'COMPAT_OUTLOOK_NO_TABLES',
      category: 'compatibility',
      severity: 'warning',
      problem: 'Email relies purely on <div> tags without <table> structures.',
      whyItMatters:
        'Outlook 2016-2024 desktop on Windows uses the Microsoft Word rendering engine (MSO), which does not support flexbox or CSS grid and collapses multi-column <div> containers vertically.',
      recommendedFix: 'Wrap structural columns in standard HTML tables with role="presentation".',
      autoFixed: true,
      fixedDescription: 'Added table container structure with role="presentation" for Outlook compatibility.',
    });
  }

  // 2. Viewport meta tag check for mobile
  const hasViewport = $('meta[name="viewport"]').length > 0;
  if (!hasViewport) {
    issues.push({
      id: 'compat-missing-viewport',
      code: 'COMPAT_MISSING_VIEWPORT',
      category: 'compatibility',
      severity: 'warning',
      problem: 'Missing <meta name="viewport" content="width=device-width, initial-scale=1.0"> tag.',
      whyItMatters: 'Mobile email apps will zoom out and render text at microscopic sizes on iOS and Android.',
      recommendedFix: 'Add the mobile viewport meta tag inside the <head> section.',
      autoFixed: true,
      fixedDescription: 'Injected responsive viewport meta tag into head.',
    });
  }

  // 3. SVG tag check (Outlook desktop shows red X for SVG)
  if ($('svg').length > 0) {
    outlookCompatibility = 'poor';
    unsupportedFeatures.push('SVG inline elements');
    issues.push({
      id: 'compat-svg-outlook',
      code: 'COMPAT_SVG_OUTLOOK',
      category: 'compatibility',
      severity: 'warning',
      problem: 'Email contains inline <svg> graphics.',
      whyItMatters: 'Outlook desktop completely refuses to render SVG vectors, showing broken missing image icons.',
      recommendedFix: 'Convert inline SVG icons to PNG / WebP images hosted on a CDN or standard text symbols.',
      autoFixed: false,
    });
  }

  // 4. CSS Grid or Flexbox in style
  if (lowerHtml.includes('display:grid') || lowerHtml.includes('display: grid')) {
    outlookCompatibility = 'poor';
    unsupportedFeatures.push('CSS Grid');
  } else if (lowerHtml.includes('display:flex') || lowerHtml.includes('display: flex')) {
    outlookCompatibility = 'warning';
    unsupportedFeatures.push('CSS Flexbox (ignored in Outlook)');
  }

  // 5. Max width check (standard desktop email width is 600px - 650px)
  let maxContainerWidth = 600;
  $('table, div').each((_, el) => {
    const width = $(el).attr('width');
    if (width && /^\d+$/.test(width)) {
      const num = parseInt(width, 10);
      if (num > maxContainerWidth && num <= 1200) {
        maxContainerWidth = num;
      }
    }
  });

  if (maxContainerWidth > 680) {
    issues.push({
      id: 'compat-container-width',
      code: 'COMPAT_WIDE_CONTAINER',
      category: 'compatibility',
      severity: 'info',
      problem: `Max container width is ${maxContainerWidth}px (industry standard is 600px).`,
      whyItMatters:
        'Desktop email client reading panes (e.g. Outlook side preview) are typically 600px wide. Wider templates force horizontal scrolling.',
      recommendedFix: 'Cap outer email wrapper width at 600px.',
      autoFixed: true,
      fixedDescription: 'Adjusted max-width constraint to 600px.',
    });
  }

  // Calculate score
  let score = 100;
  if (outlookCompatibility === 'poor') score -= 25;
  else if (outlookCompatibility === 'warning') score -= 10;
  if (!hasViewport) score -= 15;
  if (unsupportedFeatures.length > 0) score -= unsupportedFeatures.length * 8;
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    outlookCompatibility,
    gmailCompatibility,
    appleMailCompatibility,
    yahooCompatibility,
    mobileResponsive: hasViewport,
    maxContainerWidth,
    hasTableLayoutFallback,
    unsupportedFeatures,
    issues,
  };
}
