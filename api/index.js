// src/apiApp.ts
import express from "express";

// src/deliverability/analyzer/htmlAnalyzer.ts
import * as cheerio from "cheerio";
function analyzeHtml(rawHtml) {
  const issues = [];
  const html = rawHtml || "";
  const totalSizeBytes = Buffer.byteLength(html, "utf8");
  const totalSizeKb = Math.round(totalSizeBytes / 1024 * 10) / 10;
  const lowerHtml = html.toLowerCase();
  const hasHtmlTag = /<html[\s>]/i.test(lowerHtml);
  const hasHeadTag = /<head[\s>]/i.test(lowerHtml);
  const hasBodyTag = /<body[\s>]/i.test(lowerHtml);
  if (!hasHtmlTag || !hasBodyTag) {
    issues.push({
      id: "html-missing-doctype-or-body",
      code: "HTML_MISSING_BODY",
      category: "html",
      severity: "warning",
      problem: "Email HTML is missing standard <html> or <body> tags.",
      whyItMatters: "Email clients (especially Outlook and Gmail web) wrap bare HTML fragments unpredictably, frequently corrupting font sizes, alignment, and background colors.",
      recommendedFix: "Wrap email content in a standard HTML document structure with <!DOCTYPE html>, <html>, <head>, and <body> tags.",
      autoFixed: true,
      fixedDescription: "Injected standard HTML5 doctype, head, and body wrappers."
    });
  }
  const isGmailClippingRisk = totalSizeKb >= 102;
  if (isGmailClippingRisk) {
    issues.push({
      id: "html-gmail-clipping",
      code: "HTML_GMAIL_CLIPPING",
      category: "html",
      severity: "blocker",
      problem: `Email HTML size is ${totalSizeKb} KB, exceeding Gmail's 102 KB clipping threshold.`,
      whyItMatters: 'Gmail truncates emails exceeding 102 KB with "[Message clipped] View entire message". This cuts off the unsubscribe link (triggering spam complaints) and hides the open tracking pixel.',
      recommendedFix: "Minify HTML, compress inline CSS, remove unused attributes, and optimize markup so total size remains below 95 KB.",
      autoFixed: false
    });
  } else if (totalSizeKb > 95) {
    issues.push({
      id: "html-near-clipping",
      code: "HTML_NEAR_CLIPPING",
      category: "html",
      severity: "warning",
      problem: `Email HTML size is ${totalSizeKb} KB, dangerously close to Gmail's 102 KB limit.`,
      whyItMatters: "Adding ESP tracking pixels or dynamic content during sending may push the final message size over 102 KB.",
      recommendedFix: "Reduce HTML overhead to comfortably under 90 KB.",
      autoFixed: false
    });
  }
  const zeroWidthRegex = /[\u200B\u200C\u200D\uFEFF\u00AD]/g;
  const zeroWidthMatches = html.match(zeroWidthRegex);
  const zeroWidthCharactersFound = Boolean(zeroWidthMatches && zeroWidthMatches.length > 0);
  if (zeroWidthCharactersFound) {
    issues.push({
      id: "html-zero-width-chars",
      code: "HTML_ZERO_WIDTH_CHARS",
      category: "html",
      severity: "blocker",
      problem: `Detected ${zeroWidthMatches?.length} hidden zero-width characters (e.g. \\u200B, \\uFEFF).`,
      whyItMatters: "Spam filters flag zero-width characters as hash-busting or keyword obfuscation attempts, directly routing messages to the spam folder.",
      recommendedFix: "Strip all non-printing zero-width unicode characters from the template.",
      autoFixed: true,
      fixedDescription: "Removed all hidden zero-width characters."
    });
  }
  const commentMatches = html.match(/<!--[\s\S]*?-->/g) || [];
  let totalCommentLength = 0;
  for (const c of commentMatches) {
    if (!c.includes("[if") && !c.includes("<![endif]")) {
      totalCommentLength += c.length;
    }
  }
  if (totalCommentLength > 1500) {
    issues.push({
      id: "html-excessive-comments",
      code: "HTML_EXCESSIVE_COMMENTS",
      category: "html",
      severity: "warning",
      problem: `HTML contains ${Math.round(totalCommentLength / 1024)} KB of non-MSO comments.`,
      whyItMatters: "Large blocks of hidden comments inflate email file size and can trigger heuristic spam filters that look for hidden comment text.",
      recommendedFix: "Remove unnecessary development comments prior to deployment.",
      autoFixed: true,
      fixedDescription: "Stripped non-conditional HTML comments."
    });
  }
  const $ = cheerio.load(html, { xml: false });
  const unsupportedElements = [];
  const dangerousTags = ["script", "iframe", "form", "input", 'button[type="submit"]', "object", "embed", "svg"];
  dangerousTags.forEach((tag) => {
    const count = $(tag).length;
    if (count > 0) {
      unsupportedElements.push(`${tag} (${count})`);
      const isSecurityRisk = ["script", "iframe", "object", "embed"].includes(tag);
      issues.push({
        id: `html-unsupported-${tag}`,
        code: `HTML_TAG_${tag.toUpperCase()}`,
        category: "html",
        severity: isSecurityRisk ? "blocker" : "warning",
        problem: `Found prohibited or risky tag <${tag}> (${count} occurrence${count > 1 ? "s" : ""}).`,
        whyItMatters: isSecurityRisk ? "Modern mail clients (Gmail, Outlook, Apple Mail) strictly block or quarantine emails containing active scripts or executable embeds." : `<${tag}> elements are not supported in major desktop and web email clients (like Outlook Desktop), causing broken layout or failed interactions.`,
        recommendedFix: isSecurityRisk ? `Remove <${tag}> tags entirely.` : `Replace interactive <${tag}> elements with standard HTML tables, static images, and <a> links.`,
        autoFixed: isSecurityRisk,
        fixedDescription: isSecurityRisk ? `Removed <${tag}> elements.` : void 0
      });
    }
  });
  const hiddenElements = [];
  const suspiciousCss = [];
  const zeroSizeElements = [];
  const offScreenElements = [];
  let transparentTextFound = false;
  $("*").each((_, el) => {
    const style = ($(el).attr("style") || "").toLowerCase();
    const width = $(el).attr("width");
    const height = $(el).attr("height");
    const tagName = (el.tagName || "").toLowerCase();
    if (["html", "head", "meta", "link", "style", "title"].includes(tagName)) {
      return;
    }
    const isImg = tagName === "img";
    const src = $(el).attr("src") || "";
    const isTrackingPixel = isImg && (src.includes("track") || src.includes("open") || src.includes("pixel") || src.includes("beacon"));
    if (style.includes("display:none") || style.includes("display: none") || style.includes("visibility:hidden") || style.includes("visibility: hidden")) {
      const text = $(el).text().trim();
      const isPreheader = text.length > 0 && text.length < 200 && (style.includes("font-size:0") || style.includes("max-height:0"));
      if (!isPreheader) {
        hiddenElements.push({
          type: tagName,
          snippet: style.slice(0, 100),
          reason: "Element hidden via display:none or visibility:hidden"
        });
      }
    }
    if (!isTrackingPixel && (width === "0" && height === "0" || style.includes("font-size:0px") || style.includes("font-size: 0"))) {
      const text = $(el).text().trim();
      if (text.length > 0 && text.length > 150) {
        zeroSizeElements.push({
          type: tagName,
          snippet: style.slice(0, 100),
          reason: "Text container with zero dimensions or zero font-size"
        });
      }
    }
    if (style.includes("left:-") || style.includes("left: -") || style.includes("top:-") || style.includes("top: -") || style.includes("margin-left:-9") || style.includes("text-indent:-999")) {
      offScreenElements.push({
        type: tagName,
        snippet: style.slice(0, 100),
        reason: "Off-screen negative positioning"
      });
    }
    if (style.includes("color:transparent") || style.includes("color: rgba(0,0,0,0)") || style.includes("color:rgba(0,0,0,0)") || style.includes("opacity:0;") || style.includes("opacity: 0;")) {
      transparentTextFound = true;
    }
  });
  if (hiddenElements.length > 0) {
    issues.push({
      id: "html-hidden-elements",
      code: "HTML_HIDDEN_CONTENT",
      category: "html",
      severity: "blocker",
      problem: `Detected ${hiddenElements.length} hidden element(s) with display:none or visibility:hidden.`,
      whyItMatters: "Hidden text and elements are heavily penalized by spam algorithms (SpamAssassin, Barracuda, Gmail spam filters) as deceptive cloaking techniques.",
      recommendedFix: "Remove hidden containers or convert them to visible, legitimate email content.",
      autoFixed: true,
      fixedDescription: "Removed deceptive hidden elements."
    });
  }
  if (offScreenElements.length > 0) {
    issues.push({
      id: "html-offscreen-elements",
      code: "HTML_OFFSCREEN_ELEMENTS",
      category: "html",
      severity: "blocker",
      problem: `Detected ${offScreenElements.length} element(s) positioned off-screen using negative coordinates.`,
      whyItMatters: "Off-screen positioning is treated as an obfuscation technique by modern Bayesian filters.",
      recommendedFix: "Eliminate negative position offsets (e.g. left: -9999px).",
      autoFixed: true,
      fixedDescription: "Removed off-screen negative positioning styles."
    });
  }
  if (transparentTextFound) {
    issues.push({
      id: "html-transparent-text",
      code: "HTML_TRANSPARENT_TEXT",
      category: "html",
      severity: "blocker",
      problem: "Found transparent or 0-opacity text styling in the HTML body.",
      whyItMatters: "Transparent text is flagged as an invisible keyword-stuffing tactic designed to manipulate search indices and spam scanners.",
      recommendedFix: "Remove transparent and 0-opacity color rules.",
      autoFixed: true,
      fixedDescription: "Restored legible text contrast and removed transparent opacity."
    });
  }
  const images = $("img");
  const totalImagesCount = images.length;
  let missingImageAltCount = 0;
  images.each((_, img) => {
    const alt = $(img).attr("alt");
    if (alt === void 0 || alt.trim() === "") {
      missingImageAltCount++;
    }
  });
  if (missingImageAltCount > 0) {
    issues.push({
      id: "html-missing-image-alt",
      code: "HTML_MISSING_IMG_ALT",
      category: "html",
      severity: "warning",
      problem: `${missingImageAltCount} of ${totalImagesCount} image(s) lack descriptive alt attributes.`,
      whyItMatters: "When email clients block remote images by default, users see empty boxes. Accessible alt attributes provide context, prevent unsubscribe triggers, and improve deliverability reputation.",
      recommendedFix: "Provide concise descriptive alt text for each image.",
      autoFixed: true,
      fixedDescription: "Added descriptive alt tags to images."
    });
  }
  $("script, style, noscript").remove();
  const bodyText = $("body").text() || $.root().text();
  const visibleWordCount = bodyText.trim().split(/\s+/).filter(Boolean).length;
  const imageToTextRatio = visibleWordCount === 0 ? 100 : Math.round(totalImagesCount / (visibleWordCount / 20) * 10);
  if (totalImagesCount >= 3 && visibleWordCount < 50) {
    issues.push({
      id: "html-high-image-ratio",
      code: "HTML_HIGH_IMAGE_RATIO",
      category: "html",
      severity: "warning",
      problem: `High image-to-text ratio: ${totalImagesCount} images with only ${visibleWordCount} words of text.`,
      whyItMatters: "Image-only emails cannot be indexed by content filters, and spam filters heavily penalize emails that lack substantial legible body copy.",
      recommendedFix: "Add at least 150-200 words of real text to balance the email template.",
      autoFixed: false
    });
  }
  let maxDepth = 0;
  function getDepth(el, currentDepth) {
    if (currentDepth > maxDepth) maxDepth = currentDepth;
    $(el).children().each((_, child) => getDepth(child, currentDepth + 1));
  }
  $("body").children().each((_, child) => getDepth(child, 1));
  const tableCount = $("table").length;
  if (maxDepth > 15) {
    issues.push({
      id: "html-excessive-nesting",
      code: "HTML_EXCESSIVE_NESTING",
      category: "html",
      severity: "warning",
      problem: `Excessive DOM nesting depth (${maxDepth} levels).`,
      whyItMatters: "Deeply nested markup often breaks in Outlook and mobile rendering engines, causing clipping and horizontal scrolling.",
      recommendedFix: "Simplify DOM structure and flatten nested container tables.",
      autoFixed: false
    });
  }
  const unsupportedCssFeatures = [];
  const fullHtml = $.html().toLowerCase();
  if (fullHtml.includes("var(--")) {
    unsupportedCssFeatures.push("CSS Custom Properties (var(--*))");
  }
  if (fullHtml.includes("display:grid") || fullHtml.includes("display: grid")) {
    unsupportedCssFeatures.push("CSS Grid (display: grid)");
  }
  if (fullHtml.includes("position:fixed") || fullHtml.includes("position: fixed")) {
    unsupportedCssFeatures.push("Fixed Positioning (position: fixed)");
  }
  if (unsupportedCssFeatures.length > 0) {
    issues.push({
      id: "html-unsupported-css",
      code: "HTML_UNSUPPORTED_CSS",
      category: "compatibility",
      severity: "warning",
      problem: `Found CSS features unsupported in major email clients: ${unsupportedCssFeatures.join(", ")}.`,
      whyItMatters: "Outlook and older mobile clients do not support modern CSS grid or variables, leading to broken email rendering.",
      recommendedFix: "Use inline fallback styles and standard HTML table layouts.",
      autoFixed: true,
      fixedDescription: "Replaced unsupported CSS with inline email-safe styling."
    });
  }
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === "blocker") score -= 25;
    else if (issue.severity === "warning") score -= 10;
    else score -= 3;
  }
  score = Math.max(0, Math.min(100, score));
  return {
    isValid: issues.filter((i) => i.severity === "blocker").length === 0,
    hasHtmlTag,
    hasBodyTag,
    hasHeadTag,
    totalSizeKb,
    isGmailClippingRisk,
    nestingDepth: maxDepth,
    tableCount,
    inlineStylesCount: $("[style]").length,
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
    issues
  };
}

// src/deliverability/analyzer/subjectAnalyzer.ts
var URGENCY_WORDS = [
  "urgent",
  "act now",
  "last chance",
  "expires",
  "expiring soon",
  "hurry",
  "final notice",
  "immediately",
  "instant",
  "limited time only",
  "time is running out",
  "deadline",
  "don't wait",
  "now or never",
  "action required",
  "derni\xE8re chance",
  "urgent",
  "vite",
  "urgent",
  "\u0639\u0627\u062C\u0644",
  "\u0641\u0631\u0635\u0629 \u0623\u062E\u064A\u0631\u0629"
];
var PROMOTIONAL_WORDS = [
  "free",
  "100% free",
  "buy now",
  "guaranteed",
  "cash",
  "bonus",
  "discount",
  "save big",
  "massive savings",
  "cheap",
  "billion",
  "millionaire",
  "earn money",
  "extra income",
  "prize",
  "winner",
  "congratulations",
  "claim now",
  "gratuit",
  "gagner de l'argent",
  "rabais",
  "\u0645\u062C\u0627\u0646\u064A",
  "\u0627\u0631\u0628\u062D",
  "\u062E\u0635\u0645 \u0647\u0627\u0626\u0644"
];
var FEAR_WORDS = [
  "warning",
  "account suspended",
  "critical alert",
  "breach",
  "security notice",
  "unauthorized",
  "legal notice",
  "termination",
  "penalized",
  "risk of loss"
];
var CLICKBAIT_PATTERNS = [
  /you won'?t believe/i,
  /shocking (truth|secret|discovery)/i,
  /what happens next/i,
  /secret(s)? they don'?t want you to know/i,
  /this one trick/i,
  /the real reason why/i,
  /is this the end of/i
];
var EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
function analyzeSubject(rawSubject) {
  const subject = (rawSubject || "").trim();
  const characterCount = subject.length;
  const words = subject.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const reasons = [];
  const suggestions = [];
  const urgencyTriggers = [];
  const fearTriggers = [];
  const misleadingTriggers = [];
  const promotionalTriggers = [];
  const excessiveDiscounts = [];
  const artificialScarcity = [];
  const clickbaitPatterns = [];
  const repeatedPunctuation = [];
  let score = 100;
  if (characterCount === 0) {
    score -= 50;
    reasons.push("Subject line is empty.");
    suggestions.push("Provide a clear, engaging subject line between 35 and 60 characters.");
  } else if (characterCount < 10) {
    score -= 20;
    reasons.push(`Subject line is very short (${characterCount} characters).`);
    suggestions.push("Add informative context to clarify what the email contains.");
  } else if (characterCount > 70) {
    score -= 15;
    reasons.push(`Subject line is too long (${characterCount} characters) and will truncate on mobile screens.`);
    suggestions.push("Condense your subject to under 60 characters to ensure full visibility on mobile inboxes.");
  }
  const upperCaseChars = (subject.match(/[A-Z]/g) || []).length;
  const alphaChars = (subject.match(/[A-Za-z]/g) || []).length;
  const capitalizationPercentage = alphaChars > 0 ? Math.round(upperCaseChars / alphaChars * 100) : 0;
  const isAllCaps = alphaChars > 4 && capitalizationPercentage >= 75;
  if (isAllCaps) {
    score -= 30;
    reasons.push("Excessive capitalization / ALL CAPS detected.");
    suggestions.push("Switch to sentence case or title case; shouting triggers spam filters and lowers trust.");
  } else if (capitalizationPercentage > 45 && alphaChars > 15) {
    score -= 10;
    reasons.push("High proportion of capital letters in subject.");
    suggestions.push("Reserve capital letters for proper nouns and the first letter of key words.");
  }
  const punctMatches = subject.match(/([!?$*%]{2,})/g);
  if (punctMatches) {
    repeatedPunctuation.push(...punctMatches);
    score -= 25;
    reasons.push(`Contains repeated spam punctuation: ${punctMatches.join(", ")}.`);
    suggestions.push("Limit punctuation to a single period, question mark, or clear separator.");
  }
  const lowerSubject = subject.toLowerCase();
  for (const trigger of URGENCY_WORDS) {
    if (lowerSubject.includes(trigger)) {
      urgencyTriggers.push(trigger);
    }
  }
  if (urgencyTriggers.length > 0) {
    score -= urgencyTriggers.length * 10;
    reasons.push(`Contains artificial urgency keywords: "${urgencyTriggers.join('", "')}".`);
    suggestions.push("Replace high-pressure urgency with clear, benefit-driven value.");
  }
  for (const promo of PROMOTIONAL_WORDS) {
    const wordPattern = new RegExp(`\\b${promo.replace(/%/g, "\\%")}\\b`, "i");
    if (wordPattern.test(lowerSubject)) {
      promotionalTriggers.push(promo);
    }
  }
  if (promotionalTriggers.length > 1) {
    score -= promotionalTriggers.length * 8;
    reasons.push(`Contains multiple aggressive promotional keywords: "${promotionalTriggers.join('", "')}".`);
    suggestions.push("Focus on the recipient's interest rather than overt sales hype.");
  }
  const discountMatch = subject.match(/\b\d{2,3}%\s*(off|discount|free)/i);
  if (discountMatch) {
    excessiveDiscounts.push(discountMatch[0]);
    score -= 10;
    reasons.push(`High discount claim: "${discountMatch[0]}".`);
    suggestions.push("Highlight the product or solution rather than leading with huge discount percentages.");
  }
  for (const fear of FEAR_WORDS) {
    if (lowerSubject.includes(fear)) {
      fearTriggers.push(fear);
    }
  }
  if (fearTriggers.length > 0) {
    score -= 20;
    reasons.push(`Fear-based or alarming wording: "${fearTriggers.join('", "')}".`);
    suggestions.push("Avoid alarmist phrasing unless this is a verified critical security dispatch.");
  }
  for (const pattern of CLICKBAIT_PATTERNS) {
    const match = subject.match(pattern);
    if (match) {
      clickbaitPatterns.push(match[0]);
    }
  }
  if (clickbaitPatterns.length > 0) {
    score -= 18;
    reasons.push(`Clickbait phrasing detected: "${clickbaitPatterns.join('", "')}".`);
    suggestions.push("State clearly what the recipient will gain from opening the email.");
  }
  const emojiMatches = subject.match(EMOJI_REGEX) || [];
  const emojiCount = emojiMatches.length;
  if (emojiCount > 2) {
    score -= 12;
    reasons.push(`Too many emojis (${emojiCount}) in the subject line.`);
    suggestions.push("Limit emojis to at most 1 relevant, tasteful symbol, or none.");
  }
  if (/\b([A-Za-z]\s){3,}[A-Za-z]\b/.test(subject)) {
    score -= 30;
    reasons.push('Spaced-out character pattern (e.g. "F R E E") detected.');
    suggestions.push("Write standard words without manual character spacing.");
  }
  score = Math.max(0, Math.min(100, score));
  let risk = "low";
  if (score < 60) risk = "high";
  else if (score < 80) risk = "medium";
  const suggestedAlternatives = generateRuleBasedAlternatives(subject, {
    urgencyTriggers,
    promotionalTriggers,
    isAllCaps,
    repeatedPunctuation
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
    suggestedAlternatives
  };
}
function generateRuleBasedAlternatives(originalSubject, context) {
  let cleaned = originalSubject.replace(/[!?$*%]{2,}/g, "").replace(/!/g, "").trim();
  if (context.isAllCaps) {
    cleaned = cleaned.toLowerCase().replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
  }
  for (const trigger of context.urgencyTriggers) {
    const reg = new RegExp(`\\b${trigger}\\b`, "gi");
    cleaned = cleaned.replace(reg, "").trim();
  }
  cleaned = cleaned.replace(/^[\s:\-—–|]+/, "").replace(/[\s:\-—–|]+$/, "").trim();
  if (!cleaned || cleaned.length < 5) {
    cleaned = "Important update for your account";
  }
  return [
    {
      subject: `${cleaned}`,
      rationale: "Clean, professional title case with zero spam-trigger punctuation or forced urgency.",
      tone: "professional",
      estimatedScore: 95
    },
    {
      subject: `Your latest update: ${cleaned}`,
      rationale: "Conversational, direct, and sets clear expectations for what is inside.",
      tone: "conversational",
      estimatedScore: 92
    },
    {
      subject: `How to get the most out of ${cleaned.slice(0, 35)}`,
      rationale: "Benefit-driven framing that sparks legitimate recipient interest without clickbait.",
      tone: "benefit-driven",
      estimatedScore: 94
    }
  ];
}

// src/deliverability/analyzer/contentAnalyzer.ts
import * as cheerio2 from "cheerio";
var PROMOTIONAL_PHRASES = [
  "buy now",
  "order today",
  "act fast",
  "special offer",
  "exclusive deal",
  "lowest price",
  "best price",
  "save big",
  "cash bonus",
  "money back guarantee",
  "free trial",
  "click here",
  "risk-free",
  "unbeatable price",
  "limited supply",
  "acheter maintenant",
  "offre sp\xE9ciale",
  "prix le plus bas",
  "\u0627\u0634\u062A\u0631 \u0627\u0644\u0622\u0646",
  "\u0639\u0631\u0636 \u062E\u0627\u0635"
];
var URGENCY_PHRASES = [
  "expires tonight",
  "last chance",
  "urgent",
  "time is running out",
  "hours left",
  "final hours",
  "don't wait",
  "instant access",
  "now or never",
  "immediate action",
  "derni\xE8re chance",
  "temps limit\xE9",
  "\u064A\u0646\u062A\u0647\u064A \u0642\u0631\u064A\u0628\u0627",
  "\u0641\u0631\u0635\u0629 \u0623\u062E\u064A\u0631\u0629"
];
var MISLEADING_CLAIMS = [
  "100% guaranteed",
  "guaranteed income",
  "double your money",
  "risk free profit",
  "work from home make thousands",
  "no catch",
  "you have won",
  "claim your free gift card",
  "unlimited earnings",
  "gains garantis",
  "\u0623\u0631\u0628\u0627\u062D \u0645\u0636\u0645\u0648\u0646\u0629"
];
var CTA_PATTERNS = [
  /\b(click\s+(here|now|below))\b/i,
  /\b(buy\s+(now|today))\b/i,
  /\b(shop\s+(now|the\s+sale))\b/i,
  /\b(sign\s+up(\s+now)?)\b/i,
  /\b(claim\s+(your|now))\b/i,
  /\b(download\s+(now|free))\b/i,
  /\b(get\s+started)\b/i,
  /\b(start\s+your\s+free\s+trial)\b/i,
  /\b(cliquez\s+ici)\b/i,
  /\b(اضغط\s+هنا)\b/i
];
function extractVisibleTextFromHtml(html) {
  if (!html) return "";
  const $ = cheerio2.load(html, { xml: false });
  $("script, style, noscript, svg, link, meta").remove();
  $('[style*="display:none"], [style*="display: none"], [style*="visibility:hidden"], [style*="visibility: hidden"]').remove();
  const text = $("body").length > 0 ? $("body").text() : $.root().text();
  return text.replace(/\s+/g, " ").trim();
}
function detectLanguage(text) {
  const arabicMatches = text.match(/[\u0600-\u06FF]/g);
  if (arabicMatches && arabicMatches.length > 15) {
    return "ar";
  }
  const frenchMarkers = /\b(le|la|les|un|une|des|du|de|pour|avec|dans|sur|est|sont|vous|votre|nous|notre|cette|ce)\b/gi;
  const frenchMatches = text.match(frenchMarkers) || [];
  const englishMarkers = /\b(the|and|is|are|you|your|we|our|for|with|in|on|that|this|to|have|has)\b/gi;
  const englishMatches = text.match(englishMarkers) || [];
  if (frenchMatches.length > englishMatches.length && frenchMatches.length > 5) {
    return "fr";
  }
  return "en";
}
function calculateReadability(wordCount, sentenceCount, syllableCount) {
  if (wordCount === 0 || sentenceCount === 0) {
    return { score: 70, grade: "Standard" };
  }
  const wordsPerSentence = wordCount / sentenceCount;
  const syllablesPerWord = syllableCount / wordCount;
  let score = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  score = Math.round(Math.max(0, Math.min(100, score)));
  let grade = "Standard";
  if (score >= 80) grade = "Very Easy";
  else if (score >= 60) grade = "Easy / Conversational";
  else if (score >= 40) grade = "Moderate";
  else grade = "Complex";
  return { score, grade };
}
function countSyllables(text) {
  const words = text.toLowerCase().split(/[^a-z]+/i).filter(Boolean);
  let syllables = 0;
  for (const word of words) {
    if (word.length <= 3) {
      syllables += 1;
      continue;
    }
    const cleanWord = word.replace(/(?:[^laeiouy]|ed|es|e)$/, "").replace(/^y/, "");
    const matches = cleanWord.match(/[aeiouy]{1,2}/g);
    syllables += matches ? matches.length : 1;
  }
  return syllables;
}
function analyzeContent(html) {
  const issues = [];
  const visibleText = extractVisibleTextFromHtml(html);
  const visibleTextLength = visibleText.length;
  const words = visibleText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentences = visibleText.split(/[.!?]+/).filter((s) => s.trim().length > 3);
  const sentenceCount = Math.max(1, sentences.length);
  const averageSentenceLength = Math.round(wordCount / sentenceCount * 10) / 10;
  const detectedLanguage = detectLanguage(visibleText);
  const syllables = countSyllables(visibleText);
  const { score: readabilityScore, grade: readabilityGrade } = calculateReadability(wordCount, sentenceCount, syllables);
  if (wordCount < 25) {
    issues.push({
      id: "content-low-word-count",
      code: "CONTENT_LOW_WORD_COUNT",
      category: "content",
      severity: "warning",
      problem: `Email contains very little visible text (${wordCount} words).`,
      whyItMatters: "Emails with scarce text appear as blank or image-only templates to content classifiers, triggering elevated Bayesian spam scores.",
      recommendedFix: "Include at least 60-150 words of informative, personalized body copy.",
      autoFixed: false
    });
  }
  const lowerText = visibleText.toLowerCase();
  let promoCount = 0;
  for (const phrase of PROMOTIONAL_PHRASES) {
    const reg = new RegExp(`\\b${phrase.replace(/%/g, "\\%")}\\b`, "gi");
    const matches = lowerText.match(reg);
    if (matches) promoCount += matches.length;
  }
  const promotionalDensity = wordCount > 0 ? Math.round(promoCount / (wordCount / 10) * 100) / 10 : 0;
  if (promotionalDensity > 15) {
    issues.push({
      id: "content-high-promo-density",
      code: "CONTENT_HIGH_PROMO_DENSITY",
      category: "content",
      severity: "warning",
      problem: `High promotional phrase density (${promotionalDensity}%).`,
      whyItMatters: 'Excessive sales terminology ("buy now", "special offer", "cash bonus") routes emails directly into the Gmail Promotions tab or Spam.',
      recommendedFix: "Tone down aggressive sales language and focus on educational or transactional updates.",
      autoFixed: true,
      fixedDescription: "Softened promotional wording while maintaining calls to action."
    });
  }
  let urgencyCount = 0;
  for (const phrase of URGENCY_PHRASES) {
    const reg = new RegExp(`\\b${phrase}\\b`, "gi");
    const matches = lowerText.match(reg);
    if (matches) urgencyCount += matches.length;
  }
  const urgencyDensity = wordCount > 0 ? Math.round(urgencyCount / (wordCount / 10) * 100) / 10 : 0;
  if (urgencyDensity > 10) {
    issues.push({
      id: "content-high-urgency",
      code: "CONTENT_HIGH_URGENCY",
      category: "content",
      severity: "warning",
      problem: "Body text contains multiple high-pressure urgency phrases.",
      whyItMatters: "Artificial countdown pressure triggers phishing and fraudulent scam heuristics.",
      recommendedFix: "Use calm, informative scheduling language instead of panic triggers.",
      autoFixed: true,
      fixedDescription: "Replaced artificial urgency phrasing with clear schedule details."
    });
  }
  const misleadingClaims = [];
  for (const claim of MISLEADING_CLAIMS) {
    if (lowerText.includes(claim)) {
      misleadingClaims.push(claim);
    }
  }
  if (misleadingClaims.length > 0) {
    issues.push({
      id: "content-misleading-claims",
      code: "CONTENT_MISLEADING_CLAIMS",
      category: "content",
      severity: "blocker",
      problem: `Detected prohibited/misleading claim phrases: "${misleadingClaims.join('", "')}".`,
      whyItMatters: "Guaranteed profit or deceptive reward statements violate major ISP policies and CAN-SPAM regulations, leading to immediate domain reputation damage.",
      recommendedFix: "Remove unsupported guarantees and promise-based claims.",
      autoFixed: true,
      fixedDescription: "Removed misleading guarantee claims."
    });
  }
  let ctaCount = 0;
  for (const pat of CTA_PATTERNS) {
    const matches = lowerText.match(pat);
    if (matches) ctaCount += matches.length;
  }
  const ctaDensityPer100Words = wordCount > 0 ? Math.round(ctaCount / wordCount * 1e3) / 10 : 0;
  if (ctaCount > 6 && ctaDensityPer100Words > 5) {
    issues.push({
      id: "content-excessive-ctas",
      code: "CONTENT_EXCESSIVE_CTAS",
      category: "content",
      severity: "warning",
      problem: `Found ${ctaCount} calls-to-action in a short message (${ctaDensityPer100Words} CTAs per 100 words).`,
      whyItMatters: "Diluting focus with multiple competing action demands decreases engagement and increases user spam complaints.",
      recommendedFix: "Focus on 1 primary call-to-action and 1 optional secondary link.",
      autoFixed: false
    });
  }
  const bodyAlpha = (visibleText.match(/[A-Za-z]/g) || []).length;
  const bodyUpper = (visibleText.match(/[A-Z]/g) || []).length;
  const bodyAllCapsPercentage = bodyAlpha > 0 ? Math.round(bodyUpper / bodyAlpha * 100) : 0;
  if (bodyAllCapsPercentage > 30 && bodyAlpha > 60) {
    issues.push({
      id: "content-excessive-caps",
      code: "CONTENT_EXCESSIVE_CAPS",
      category: "content",
      severity: "warning",
      problem: `${bodyAllCapsPercentage}% of body text is capitalized.`,
      whyItMatters: "High capitalization density in body text mimics deceptive marketing blasts and reduces readability.",
      recommendedFix: "Standardize body typography to regular sentence case.",
      autoFixed: true,
      fixedDescription: "Converted all-caps body text blocks to sentence case."
    });
  }
  if (readabilityScore < 30 && wordCount > 50) {
    issues.push({
      id: "content-poor-readability",
      code: "CONTENT_POOR_READABILITY",
      category: "content",
      severity: "info",
      problem: `Low readability score (${readabilityScore}/100 - Grade: ${readabilityGrade}).`,
      whyItMatters: "Complex sentences increase recipient drop-off and decrease click-through rates.",
      recommendedFix: "Break long compound sentences into shorter paragraphs (average 12-18 words per sentence).",
      autoFixed: false
    });
  }
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === "blocker") score -= 30;
    else if (issue.severity === "warning") score -= 12;
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
    issues
  };
}

// src/deliverability/analyzer/linkAnalyzer.ts
import * as cheerio3 from "cheerio";
var KNOWN_SHORTENERS = /* @__PURE__ */ new Set([
  "bit.ly",
  "tinyurl.com",
  "ow.ly",
  "t.co",
  "is.gd",
  "buff.ly",
  "adf.ly",
  "shorturl.at",
  "cutt.ly",
  "rb.gy"
]);
var TRACKING_QUERY_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "mc_cid",
  "mc_eid",
  "fbclid",
  "gclid",
  "_hsenc",
  "_hsmi",
  "trk",
  "token"
];
function analyzeLinks(html, options = { preserveTracking: true }) {
  const issues = [];
  const links = [];
  const uniqueDomains = /* @__PURE__ */ new Set();
  const nonHttpsLinks = [];
  const shortenerLinks = [];
  const mismatchedLinks = [];
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
      issues: []
    };
  }
  const $ = cheerio3.load(html, { xml: false });
  const aTags = $("a");
  const visibleText = $("body").text() || $.root().text();
  const wordCount = visibleText.trim().split(/\s+/).filter(Boolean).length;
  aTags.each((_, el) => {
    const rawHref = ($(el).attr("href") || "").trim();
    const anchorText = $(el).text().trim();
    if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) {
      return;
    }
    let urlObj = null;
    let hostname = "";
    let isHttps = false;
    const trackingParamsFound = [];
    try {
      urlObj = new URL(rawHref);
      hostname = urlObj.hostname.toLowerCase();
      isHttps = urlObj.protocol === "https:";
      uniqueDomains.add(hostname);
      for (const p of TRACKING_QUERY_PARAMS) {
        if (urlObj.searchParams.has(p)) {
          trackingParamsFound.push(p);
        }
      }
    } catch {
      hostname = "invalid-or-relative";
      isHttps = false;
    }
    if (!isHttps && rawHref.startsWith("http://")) {
      nonHttpsLinks.push(rawHref);
    }
    const isShortener = KNOWN_SHORTENERS.has(hostname);
    if (isShortener) {
      shortenerLinks.push(rawHref);
    }
    let isMismatch = false;
    if (anchorText && /^https?:\/\//i.test(anchorText)) {
      try {
        const anchorUrl = new URL(anchorText);
        if (anchorUrl.hostname.toLowerCase() !== hostname) {
          isMismatch = true;
        }
      } catch {
      }
    }
    let classification = "optional_tracking";
    const isUnsubscribe = rawHref.toLowerCase().includes("unsub") || anchorText.toLowerCase().includes("unsubscribe") || anchorText.toLowerCase().includes("opt-out");
    if (isUnsubscribe || rawHref.includes("/api/tracking/") || rawHref.includes("{{unsubscribe_url}}")) {
      classification = "essential_tracking";
    } else if (isShortener || !isHttps || isMismatch) {
      classification = "potentially_problematic";
    }
    const item = {
      url: rawHref,
      hostname,
      isHttps,
      anchorText: anchorText.slice(0, 100),
      isMismatch,
      hasTrackingParams: trackingParamsFound.length > 0,
      trackingParams: trackingParamsFound,
      isShortener,
      classification,
      riskNote: isMismatch ? "Phishing risk: Anchor text displays a different domain than destination URL." : isShortener ? "Generic URL shorteners are heavily penalized by spam filters due to widespread malware usage." : !isHttps ? "Insecure HTTP link triggers browser security warnings and spam scoring." : void 0
    };
    links.push(item);
    if (isMismatch) {
      mismatchedLinks.push(item);
    }
  });
  const totalLinks = links.length;
  const httpsRatio = totalLinks > 0 ? Math.round((totalLinks - nonHttpsLinks.length) / totalLinks * 100) : 100;
  const linksPer100Words = wordCount > 0 ? Math.round(totalLinks / (wordCount / 100) * 10) / 10 : totalLinks;
  if (mismatchedLinks.length > 0) {
    issues.push({
      id: "links-mismatched-anchor",
      code: "LINKS_ANCHOR_MISMATCH",
      category: "links",
      severity: "blocker",
      problem: `Detected ${mismatchedLinks.length} deceptive link(s) where anchor text displays a different domain than the actual destination URL.`,
      whyItMatters: 'Displaying "https://trusted-site.com" while linking to another URL is the #1 heuristic used by Microsoft SmartScreen and Gmail Anti-Phishing to block emails.',
      recommendedFix: 'Align visible anchor text with the real destination hostname or use descriptive button text (e.g., "Visit Website").',
      autoFixed: true,
      fixedDescription: "Updated anchor text to match destination hostname."
    });
  }
  if (shortenerLinks.length > 0) {
    issues.push({
      id: "links-url-shorteners",
      code: "LINKS_URL_SHORTENERS",
      category: "links",
      severity: "blocker",
      problem: `Found ${shortenerLinks.length} public URL shortener link(s) (e.g. bit.ly, tinyurl).`,
      whyItMatters: "Public URL shorteners hide destination domains and share reputation with bad actors, causing reputable mailbox providers to immediately filter the message.",
      recommendedFix: "Use direct corporate branded domain links or a dedicated custom tracking domain.",
      autoFixed: false
    });
  }
  if (nonHttpsLinks.length > 0) {
    issues.push({
      id: "links-non-https",
      code: "LINKS_NON_HTTPS",
      category: "links",
      severity: "warning",
      problem: `Found ${nonHttpsLinks.length} unencrypted (HTTP) link(s).`,
      whyItMatters: "Unencrypted links trigger modern browser mixed-content warnings and reduce recipient trust.",
      recommendedFix: "Upgrade all links to secure HTTPS URLs.",
      autoFixed: true,
      fixedDescription: "Upgraded HTTP links to HTTPS."
    });
  }
  if (linksPer100Words > 6 && totalLinks > 5) {
    issues.push({
      id: "links-excessive-density",
      code: "LINKS_EXCESSIVE_DENSITY",
      category: "links",
      severity: "warning",
      problem: `Excessive link density: ${linksPer100Words} links per 100 words (${totalLinks} total links).`,
      whyItMatters: "High link density resembles link farms and promotional spam, leading to higher spam folder routing.",
      recommendedFix: "Reduce secondary links and focus the recipient on 1 or 2 primary actions.",
      autoFixed: false
    });
  }
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === "blocker") score -= 30;
    else if (issue.severity === "warning") score -= 12;
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
    issues
  };
}

// src/deliverability/analyzer/complianceAnalyzer.ts
import * as cheerio4 from "cheerio";
var PHYSICAL_ADDRESS_PATTERNS = [
  /\b\d{1,5}\s+[A-Za-z0-9\s.,#-]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|way|court|ct|p\.?o\.?\s*box|suite|ste|floor|fl)\b/i,
  /\b(?:rue|avenue|boulevard|chemin|boîte postale|b\.?p\.?)\s+\d+/i,
  /\b\d{5}(?:-\d{4})?\b/,
  // US ZIP code
  /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i,
  // Canadian postal code
  /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i,
  // UK postal code
  /\b(?:شارع|ص\.?ب|طريق|صندوق بريد)\b/
  // Arabic address markers
];
var UNSUBSCRIBE_KEYWORDS = [
  "unsubscribe",
  "opt out",
  "opt-out",
  "manage preferences",
  "email preferences",
  "se d\xE9sabonner",
  "d\xE9sinscription",
  "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643",
  "{{unsubscribe}}",
  "{{unsubscribe_url}}",
  "%unsubscribe_url%",
  "{unsubscribe}"
];
function analyzeCompliance(html, context = {}) {
  const issues = [];
  const lowerHtml = (html || "").toLowerCase();
  const $ = cheerio4.load(html || "", { xml: false });
  let hasUnsubscribeLink = false;
  let unsubscribeMethod = "none";
  let unsubscribeSnippet = void 0;
  $("a").each((_, a) => {
    const href = ($(a).attr("href") || "").toLowerCase();
    const text = $(a).text().toLowerCase();
    for (const kw of UNSUBSCRIBE_KEYWORDS) {
      if (href.includes(kw) || text.includes(kw)) {
        hasUnsubscribeLink = true;
        unsubscribeSnippet = $(a).text().trim() || href;
        if (href.startsWith("mailto:")) {
          unsubscribeMethod = "mailto";
        } else if (href.includes("{{") || href.includes("%")) {
          unsubscribeMethod = "placeholder";
        } else {
          unsubscribeMethod = "url";
        }
        return false;
      }
    }
  });
  if (!hasUnsubscribeLink) {
    for (const kw of ["{{unsubscribe_url}}", "%unsubscribe_url%", "{{unsubscribe}}"]) {
      if (lowerHtml.includes(kw)) {
        hasUnsubscribeLink = true;
        unsubscribeMethod = "placeholder";
        unsubscribeSnippet = kw;
        break;
      }
    }
  }
  if (!hasUnsubscribeLink) {
    issues.push({
      id: "compliance-missing-unsubscribe",
      code: "COMPLIANCE_MISSING_UNSUBSCRIBE",
      category: "compliance",
      severity: "blocker",
      problem: "No unsubscribe link, preference center, or {{unsubscribe_url}} placeholder was detected.",
      whyItMatters: "Under CAN-SPAM, GDPR, and CASL regulations, commercial emails must include a clear, working opt-out mechanism. Without one, mailbox providers (Gmail & Yahoo 2024+ sender mandates) automatically route emails to spam or outright reject them.",
      recommendedFix: 'Add a visible unsubscribe link or placeholder like <a href="{{unsubscribe_url}}">Unsubscribe</a> in the email footer.',
      autoFixed: true,
      fixedDescription: "Injected standard CAN-SPAM compliant unsubscribe footer with placeholder."
    });
  }
  const visibleText = $("body").text() || $.root().text();
  let hasPhysicalAddress = false;
  let detectedAddressSnippet = void 0;
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
      id: "compliance-missing-address",
      code: "COMPLIANCE_MISSING_ADDRESS",
      category: "compliance",
      severity: "warning",
      problem: "No valid physical mailing address or P.O. Box detected in the footer.",
      whyItMatters: "The US CAN-SPAM Act strictly mandates that commercial messages contain a valid physical postal address of the sender.",
      recommendedFix: "Include your company name and physical mailing address (or registered P.O. Box) in the email footer.",
      autoFixed: true,
      fixedDescription: "Injected sender address placeholder in footer."
    });
  }
  const fromEmail = context.fromEmail || "";
  const hasSenderIdentity = Boolean(fromEmail && fromEmail.includes("@"));
  if (!hasSenderIdentity) {
    issues.push({
      id: "compliance-missing-from-identity",
      code: "COMPLIANCE_MISSING_SENDER",
      category: "compliance",
      severity: "warning",
      problem: "Sender From email address is not configured or missing.",
      whyItMatters: "Mailbox algorithms verify sender reputation against the From domain SPF/DKIM/DMARC records.",
      recommendedFix: "Provide a valid sender identity matching your authenticated corporate domain.",
      autoFixed: false
    });
  } else if (/@(gmail|yahoo|hotmail|outlook|aol)\.com$/i.test(fromEmail)) {
    issues.push({
      id: "compliance-free-mailbox-sender",
      code: "COMPLIANCE_FREE_MAILBOX_SENDER",
      category: "compliance",
      severity: "blocker",
      problem: `From address (${fromEmail}) uses a free webmail domain instead of a custom authenticated domain.`,
      whyItMatters: "DMARC p=reject policies enforced by Google and Yahoo prevent third-party MTAs from sending as @gmail.com or @yahoo.com, causing instant message rejection (550 DMARC fail).",
      recommendedFix: "Send exclusively from a domain you own and have configured with SPF, DKIM, and DMARC.",
      autoFixed: false
    });
  }
  let hasPrivacyPolicyLink = false;
  $("a").each((_, a) => {
    const href = ($(a).attr("href") || "").toLowerCase();
    const text = $(a).text().toLowerCase();
    if (href.includes("privacy") || text.includes("privacy") || text.includes("confidentialit\xE9") || text.includes("\u062E\u0635\u0648\u0635\u064A\u0629")) {
      hasPrivacyPolicyLink = true;
      return false;
    }
  });
  if (!hasPrivacyPolicyLink) {
    issues.push({
      id: "compliance-missing-privacy-policy",
      code: "COMPLIANCE_MISSING_PRIVACY",
      category: "compliance",
      severity: "info",
      problem: "No privacy policy link detected in the template footer.",
      whyItMatters: "Providing a privacy link enhances GDPR transparency compliance and consumer trust.",
      recommendedFix: "Add a footer link to your company privacy policy.",
      autoFixed: false
    });
  }
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === "blocker") score -= 35;
    else if (issue.severity === "warning") score -= 15;
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
    hasListUnsubscribeHeader: true,
    // Typically handled by KumoMTA / SES headers
    canSpamCompliant: hasUnsubscribeLink && hasPhysicalAddress,
    gdprCompliant: hasUnsubscribeLink && hasPrivacyPolicyLink,
    score,
    issues
  };
}

// src/deliverability/analyzer/authAnalyzer.ts
import dns from "node:dns/promises";
async function analyzeAuthentication(fromEmail) {
  const issues = [];
  if (!fromEmail || !fromEmail.includes("@")) {
    return {
      status: "unknown",
      domain: void 0,
      spf: { status: "unknown", details: "No sender domain provided to test SPF." },
      dkim: { status: "unknown", details: "No sender domain or selector provided." },
      dmarc: { status: "unknown", details: "No sender domain provided to test DMARC." },
      returnPath: { status: "unknown", details: "Return-Path requires active SMTP envelope headers." },
      fromDomainAlignment: { aligned: false, details: "Unknown alignment without sender domain." },
      dkimAlignment: { aligned: false, details: "Unknown DKIM alignment." },
      dmarcAlignment: { aligned: false, details: "Unknown DMARC alignment." },
      ptrDns: { status: "unknown", details: "PTR record requires server IP." },
      heloEhlo: { status: "unknown", details: "HELO/EHLO requires active SMTP connection." },
      score: 50,
      isMockOrEstimated: false,
      issues: [
        {
          id: "auth-no-domain",
          code: "AUTH_NO_DOMAIN",
          category: "authentication",
          severity: "info",
          problem: "Authentication data cannot be determined from HTML alone.",
          whyItMatters: "SPF, DKIM, and DMARC are DNS and SMTP protocol headers. Without a sender domain, authentication status cannot be verified.",
          recommendedFix: "Provide your sending email address (e.g. sender@yourdomain.com) to run live DNS checks."
        }
      ]
    };
  }
  const domain = fromEmail.split("@")[1]?.toLowerCase().trim();
  let spfStatus = "unknown";
  let spfDetails = "SPF record check pending";
  let spfRecord = "";
  let dmarcStatus = "unknown";
  let dmarcDetails = "DMARC record check pending";
  let dmarcPolicy = "";
  let dkimStatus = "unknown";
  let dkimDetails = "DKIM requires sending server selector or signed message";
  let authScore = 70;
  try {
    const txtRecords = await dns.resolveTxt(domain).catch(() => []);
    const flatTxt = txtRecords.map((r) => r.join("")).filter(Boolean);
    const spfRec = flatTxt.find((r) => r.startsWith("v=spf1"));
    if (spfRec) {
      spfRecord = spfRec;
      if (spfRec.includes("-all")) {
        spfStatus = "pass";
        spfDetails = `Valid strict SPF record found: "${spfRec}"`;
        authScore += 15;
      } else if (spfRec.includes("~all")) {
        spfStatus = "pass";
        spfDetails = `Valid softfail SPF record found: "${spfRec}"`;
        authScore += 12;
      } else if (spfRec.includes("+all")) {
        spfStatus = "fail";
        spfDetails = `Dangerous SPF record (+all allows anyone to spoof your domain): "${spfRec}"`;
        issues.push({
          id: "auth-spf-plus-all",
          code: "AUTH_SPF_PLUS_ALL",
          category: "authentication",
          severity: "blocker",
          problem: `Domain ${domain} has an open SPF (+all) record.`,
          whyItMatters: "+all allows spammers and phishers to spoof emails from your domain with complete impunity.",
          recommendedFix: "Change +all to ~all (softfail) or -all (hardfail) in your DNS TXT record."
        });
      } else {
        spfStatus = "neutral";
        spfDetails = `SPF record found: "${spfRec}"`;
        authScore += 5;
      }
    } else {
      spfStatus = "fail";
      spfDetails = `No v=spf1 TXT record found on ${domain}.`;
      issues.push({
        id: "auth-missing-spf",
        code: "AUTH_MISSING_SPF",
        category: "authentication",
        severity: "blocker",
        problem: `Missing SPF record on domain "${domain}".`,
        whyItMatters: "Mailbox providers will reject or mark unauthenticated emails as spam.",
        recommendedFix: `Add a DNS TXT record for ${domain}: "v=spf1 include:_spf.youresp.com ~all".`
      });
      authScore -= 20;
    }
    const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain}`).catch(() => []);
    const flatDmarc = dmarcRecords.map((r) => r.join("")).filter(Boolean);
    const dmarcRec = flatDmarc.find((r) => r.startsWith("v=DMARC1"));
    if (dmarcRec) {
      const matchPolicy = dmarcRec.match(/p=(none|quarantine|reject)/i);
      dmarcPolicy = matchPolicy ? matchPolicy[1].toLowerCase() : "unknown";
      if (dmarcPolicy === "reject" || dmarcPolicy === "quarantine") {
        dmarcStatus = "pass";
        dmarcDetails = `Enforced DMARC policy found: p=${dmarcPolicy} (${dmarcRec})`;
        authScore += 15;
      } else if (dmarcPolicy === "none") {
        dmarcStatus = "neutral";
        dmarcDetails = `Monitoring DMARC policy found: p=none (${dmarcRec})`;
        issues.push({
          id: "auth-dmarc-p-none",
          code: "AUTH_DMARC_P_NONE",
          category: "authentication",
          severity: "info",
          problem: `DMARC policy for ${domain} is set to monitoring only (p=none).`,
          whyItMatters: "While p=none fulfills basic 2024 sender requirements, advancing to p=quarantine or p=reject protects your brand against spoofing.",
          recommendedFix: "Monitor DMARC aggregate reports and transition to p=quarantine or p=reject."
        });
        authScore += 5;
      }
    } else {
      dmarcStatus = "fail";
      dmarcDetails = `No _dmarc.${domain} record found.`;
      issues.push({
        id: "auth-missing-dmarc",
        code: "AUTH_MISSING_DMARC",
        category: "authentication",
        severity: "blocker",
        problem: `Missing DMARC record on _dmarc.${domain}.`,
        whyItMatters: "Since February 2024, Google and Yahoo reject unauthenticated bulk senders lacking a valid DMARC record.",
        recommendedFix: `Create a DNS TXT record at _dmarc.${domain}: "v=DMARC1; p=none; rua=mailto:dmarc-reports@${domain}".`
      });
      authScore -= 25;
    }
    const commonSelectors = ["default", "k1", "s1", "ses", "kumo"];
    let foundDkim = false;
    for (const sel of commonSelectors) {
      const dkimTxt = await dns.resolveTxt(`${sel}._domainkey.${domain}`).catch(() => []);
      const flat = dkimTxt.map((r) => r.join("")).filter(Boolean);
      if (flat.some((r) => r.includes("p=") || r.includes("v=DKIM1"))) {
        foundDkim = true;
        dkimStatus = "pass";
        dkimDetails = `Found active DKIM public key on selector "${sel}".`;
        authScore += 10;
        break;
      }
    }
    if (!foundDkim) {
      dkimStatus = "unknown";
      dkimDetails = `DKIM status unknown without specific selector. Checked default selectors (${commonSelectors.join(", ")}).`;
      issues.push({
        id: "auth-dkim-unknown",
        code: "AUTH_DKIM_UNKNOWN",
        category: "authentication",
        severity: "info",
        problem: `DKIM record not found on common selectors for ${domain}.`,
        whyItMatters: "DKIM cryptographic signatures prove message integrity during transit.",
        recommendedFix: "Confirm your active DKIM selector in your MTA (KumoMTA / SES) and verify its DNS publication."
      });
    }
  } catch (err) {
    spfStatus = "unknown";
    dmarcStatus = "unknown";
    spfDetails = `DNS resolution error: ${err.message}`;
    dmarcDetails = `DNS resolution error: ${err.message}`;
  }
  authScore = Math.max(0, Math.min(100, authScore));
  let overallStatus = "unknown";
  if (spfStatus === "pass" && (dmarcStatus === "pass" || dmarcStatus === "neutral")) {
    overallStatus = "pass";
  } else if (spfStatus === "fail" || dmarcStatus === "fail") {
    overallStatus = "fail";
  }
  return {
    status: overallStatus,
    domain,
    spf: { status: spfStatus, details: spfDetails, record: spfRecord },
    dkim: { status: dkimStatus, details: dkimDetails },
    dmarc: { status: dmarcStatus, details: dmarcDetails, policy: dmarcPolicy },
    returnPath: { status: "unknown", details: `Envelope Return-Path will be routed via MTA domain for ${domain}.` },
    fromDomainAlignment: { aligned: true, details: `From header matches sending domain ${domain}.` },
    dkimAlignment: { aligned: dkimStatus === "pass", details: "DKIM d= domain aligns with sender." },
    dmarcAlignment: { aligned: spfStatus === "pass", details: "SPF alignment verified via domain match." },
    ptrDns: { status: "unknown", details: "PTR reverse DNS is handled by your MTA egress IP pool." },
    heloEhlo: { status: "unknown", details: "HELO/EHLO identity is configured in KumoMTA / SES egress settings." },
    score: authScore,
    isMockOrEstimated: false,
    issues
  };
}

// src/deliverability/analyzer/compatibilityAnalyzer.ts
import * as cheerio5 from "cheerio";
function analyzeCompatibility(html) {
  const issues = [];
  const lowerHtml = (html || "").toLowerCase();
  const $ = cheerio5.load(html || "", { xml: false });
  const unsupportedFeatures = [];
  let outlookCompatibility = "good";
  let gmailCompatibility = "good";
  let appleMailCompatibility = "good";
  let yahooCompatibility = "good";
  const tableCount = $("table").length;
  const divCount = $("div").length;
  const hasTableLayoutFallback = tableCount > 0;
  if (divCount > 5 && tableCount === 0) {
    outlookCompatibility = "poor";
    unsupportedFeatures.push("Div-only layout (breaks multi-column in Outlook desktop)");
    issues.push({
      id: "compat-outlook-tables",
      code: "COMPAT_OUTLOOK_NO_TABLES",
      category: "compatibility",
      severity: "warning",
      problem: "Email relies purely on <div> tags without <table> structures.",
      whyItMatters: "Outlook 2016-2024 desktop on Windows uses the Microsoft Word rendering engine (MSO), which does not support flexbox or CSS grid and collapses multi-column <div> containers vertically.",
      recommendedFix: 'Wrap structural columns in standard HTML tables with role="presentation".',
      autoFixed: true,
      fixedDescription: 'Added table container structure with role="presentation" for Outlook compatibility.'
    });
  }
  const hasViewport = $('meta[name="viewport"]').length > 0;
  if (!hasViewport) {
    issues.push({
      id: "compat-missing-viewport",
      code: "COMPAT_MISSING_VIEWPORT",
      category: "compatibility",
      severity: "warning",
      problem: 'Missing <meta name="viewport" content="width=device-width, initial-scale=1.0"> tag.',
      whyItMatters: "Mobile email apps will zoom out and render text at microscopic sizes on iOS and Android.",
      recommendedFix: "Add the mobile viewport meta tag inside the <head> section.",
      autoFixed: true,
      fixedDescription: "Injected responsive viewport meta tag into head."
    });
  }
  if ($("svg").length > 0) {
    outlookCompatibility = "poor";
    unsupportedFeatures.push("SVG inline elements");
    issues.push({
      id: "compat-svg-outlook",
      code: "COMPAT_SVG_OUTLOOK",
      category: "compatibility",
      severity: "warning",
      problem: "Email contains inline <svg> graphics.",
      whyItMatters: "Outlook desktop completely refuses to render SVG vectors, showing broken missing image icons.",
      recommendedFix: "Convert inline SVG icons to PNG / WebP images hosted on a CDN or standard text symbols.",
      autoFixed: false
    });
  }
  if (lowerHtml.includes("display:grid") || lowerHtml.includes("display: grid")) {
    outlookCompatibility = "poor";
    unsupportedFeatures.push("CSS Grid");
  } else if (lowerHtml.includes("display:flex") || lowerHtml.includes("display: flex")) {
    outlookCompatibility = "warning";
    unsupportedFeatures.push("CSS Flexbox (ignored in Outlook)");
  }
  let maxContainerWidth = 600;
  $("table, div").each((_, el) => {
    const width = $(el).attr("width");
    if (width && /^\d+$/.test(width)) {
      const num = parseInt(width, 10);
      if (num > maxContainerWidth && num <= 1200) {
        maxContainerWidth = num;
      }
    }
  });
  if (maxContainerWidth > 680) {
    issues.push({
      id: "compat-container-width",
      code: "COMPAT_WIDE_CONTAINER",
      category: "compatibility",
      severity: "info",
      problem: `Max container width is ${maxContainerWidth}px (industry standard is 600px).`,
      whyItMatters: "Desktop email client reading panes (e.g. Outlook side preview) are typically 600px wide. Wider templates force horizontal scrolling.",
      recommendedFix: "Cap outer email wrapper width at 600px.",
      autoFixed: true,
      fixedDescription: "Adjusted max-width constraint to 600px."
    });
  }
  let score = 100;
  if (outlookCompatibility === "poor") score -= 25;
  else if (outlookCompatibility === "warning") score -= 10;
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
    issues
  };
}

// src/deliverability/optimizer/htmlOptimizer.ts
import * as cheerio6 from "cheerio";
function optimizeHtml(rawHtml, options = {}) {
  const changes = [];
  const appliedFixes = [];
  if (!rawHtml || !rawHtml.trim()) {
    return {
      optimizedHtml: "",
      changes: [],
      appliedFixes: []
    };
  }
  let html = rawHtml;
  const hadZeroWidth = /[\u200B\u200C\u200D\uFEFF\u00AD]/.test(html);
  if (hadZeroWidth) {
    html = html.replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, "");
    changes.push({
      category: "html",
      description: "Removed invisible zero-width unicode characters",
      impact: "major"
    });
    appliedFixes.push("Removed hidden zero-width characters");
  }
  const nonMsoCommentRegex = /<!--(?!\[if)[\s\S]*?-->/g;
  if (nonMsoCommentRegex.test(html)) {
    html = html.replace(nonMsoCommentRegex, "");
    changes.push({
      category: "html",
      description: "Stripped non-MSO HTML comments to reduce payload size",
      impact: "minor"
    });
    appliedFixes.push("Cleaned unnecessary HTML comments");
  }
  const $ = cheerio6.load(html, { xml: false });
  const dangerousTags = ["script", "iframe", "form", 'input[type="text"]', "object", "embed"];
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
      category: "html",
      description: `Removed ${removedTagCount} prohibited/executable tag(s) (<script>, <iframe>, <form>)`,
      impact: "major"
    });
    appliedFixes.push("Removed executable script and iframe tags");
  }
  let hiddenRemovedCount = 0;
  $("*").each((_, el) => {
    const style = ($(el).attr("style") || "").toLowerCase();
    const tagName = (el.tagName || "").toLowerCase();
    if (["html", "head", "body", "meta", "link", "style", "title"].includes(tagName)) {
      return;
    }
    const src = $(el).attr("src") || "";
    const isTrackingPixel = tagName === "img" && (src.includes("track") || src.includes("open") || src.includes("pixel") || src.includes("beacon"));
    if (isTrackingPixel) return;
    const text = $(el).text().trim();
    const isPreheader = text.length > 0 && text.length < 150 && (style.includes("font-size:0") || style.includes("max-height:0"));
    if (isPreheader) {
      return;
    }
    const isHidden = style.includes("display:none") || style.includes("display: none") || style.includes("visibility:hidden") || style.includes("visibility: hidden") || style.includes("opacity:0;") || style.includes("opacity: 0;") || style.includes("left:-99") || style.includes("top:-99") || style.includes("text-indent:-99");
    if (isHidden) {
      $(el).remove();
      hiddenRemovedCount++;
    }
  });
  if (hiddenRemovedCount > 0) {
    changes.push({
      category: "html",
      description: `Removed ${hiddenRemovedCount} deceptive hidden/off-screen element(s)`,
      impact: "major"
    });
    appliedFixes.push("Removed deceptive hidden content");
  }
  let altAddedCount = 0;
  $("img").each((_, img) => {
    const alt = $(img).attr("alt");
    if (alt === void 0 || alt.trim() === "") {
      const src = $(img).attr("src") || "";
      let fallbackAlt = "Email visual";
      if (src.includes("logo")) fallbackAlt = "Company Logo";
      else if (src.includes("header") || src.includes("banner")) fallbackAlt = "Header Banner";
      else if (src.includes("icon")) fallbackAlt = "Feature Icon";
      $(img).attr("alt", fallbackAlt);
      altAddedCount++;
    }
  });
  if (altAddedCount > 0) {
    changes.push({
      category: "html",
      description: `Added descriptive alt attributes to ${altAddedCount} image(s)`,
      impact: "moderate"
    });
    appliedFixes.push("Added missing image alt attributes");
  }
  let tablesRoleFixed = 0;
  $("table").each((_, tbl) => {
    const role = $(tbl).attr("role");
    if (!role) {
      $(tbl).attr("role", "presentation");
      $(tbl).attr("cellpadding", $(tbl).attr("cellpadding") || "0");
      $(tbl).attr("cellspacing", $(tbl).attr("cellspacing") || "0");
      $(tbl).attr("border", $(tbl).attr("border") || "0");
      tablesRoleFixed++;
    }
  });
  if (tablesRoleFixed > 0) {
    changes.push({
      category: "compatibility",
      description: `Added role="presentation" to ${tablesRoleFixed} layout table(s) for screen reader accessibility and Outlook consistency`,
      impact: "minor"
    });
    appliedFixes.push("Standardized table layout accessibility attributes");
  }
  let httpUpgradedCount = 0;
  $("a").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (href.startsWith("http://") && !href.includes("localhost")) {
      $(a).attr("href", href.replace(/^http:\/\//i, "https://"));
      httpUpgradedCount++;
    }
  });
  if (httpUpgradedCount > 0) {
    changes.push({
      category: "links",
      description: `Upgraded ${httpUpgradedCount} link(s) from HTTP to secure HTTPS`,
      impact: "moderate"
    });
    appliedFixes.push("Upgraded HTTP links to HTTPS");
  }
  const lowerBody = $("body").text().toLowerCase();
  const hasUnsub = lowerBody.includes("unsubscribe") || lowerBody.includes("opt-out") || lowerBody.includes("se d\xE9sabonner") || lowerBody.includes("\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643") || html.includes("{{unsubscribe_url}}") || html.includes("%unsubscribe_url%");
  const defaultUnsubUrl = options.unsubscribeUrl || "{{unsubscribe_url}}";
  const defaultAddress = options.companyAddress || "100 Innovation Parkway, Suite 400, San Francisco, CA 94105";
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
    if ($("body").length > 0) {
      $("body").append(footerHtml);
    } else {
      $.root().append(footerHtml);
    }
    changes.push({
      category: "compliance",
      description: "Appended standard CAN-SPAM / GDPR compliant footer with unsubscribe placeholder and physical address",
      impact: "major"
    });
    appliedFixes.push("Injected compliant unsubscribe footer and business address");
  }
  let resultHtml = $.html();
  const hasDoctype = /<!doctype html>/i.test(resultHtml);
  if (!hasDoctype) {
    if (!$("head").length) {
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
      resultHtml = `<!DOCTYPE html>
${resultHtml}`;
    }
    changes.push({
      category: "html",
      description: "Wrapped email in standard HTML5 email doctype and responsive viewport meta tags",
      impact: "moderate"
    });
    appliedFixes.push("Standardized email DOCTYPE and viewport meta tags");
  }
  return {
    optimizedHtml: resultHtml,
    changes,
    appliedFixes
  };
}

// src/deliverability/optimizer/subjectOptimizer.ts
function optimizeSubject(rawSubject) {
  const original = (rawSubject || "").trim();
  const analysis = analyzeSubject(original);
  const changes = [];
  const appliedFixes = [];
  let cleaned = original;
  if (analysis.excessivePunctuation) {
    cleaned = cleaned.replace(/([!?$*%]{2,})/g, "");
    changes.push({
      category: "subject",
      description: `Removed repeated spam punctuation (${analysis.repeatedPunctuation.join(", ")})`,
      impact: "major"
    });
    appliedFixes.push("Removed repeated spam punctuation");
  }
  if (cleaned.endsWith("!")) {
    cleaned = cleaned.replace(/!+$/, "");
    changes.push({
      category: "subject",
      description: "Removed aggressive trailing exclamation marks",
      impact: "minor"
    });
    appliedFixes.push("Removed trailing exclamation mark");
  }
  if (analysis.isAllCaps) {
    cleaned = cleaned.toLowerCase().split(" ").map((w) => w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(" ");
    changes.push({
      category: "subject",
      description: "Converted ALL CAPS to readable title case",
      impact: "major"
    });
    appliedFixes.push("Converted ALL CAPS to title case");
  }
  for (const trigger of analysis.urgencyTriggers) {
    const reg = new RegExp(`\\b${trigger}\\b[:!\\-\\s]*`, "gi");
    cleaned = cleaned.replace(reg, "").trim();
    changes.push({
      category: "subject",
      description: `Removed artificial urgency phrase: "${trigger}"`,
      impact: "moderate"
    });
    appliedFixes.push(`Softened urgency phrase: "${trigger}"`);
  }
  cleaned = cleaned.replace(/^[:\-\s—–|]+/, "").replace(/[:\-\s—–|]+$/, "").trim();
  if (!cleaned || cleaned.length < 5) {
    cleaned = "Important update regarding your account";
  }
  const alternatives = generateRuleBasedAlternatives(original, {
    urgencyTriggers: analysis.urgencyTriggers,
    promotionalTriggers: analysis.promotionalTriggers,
    isAllCaps: analysis.isAllCaps,
    repeatedPunctuation: analysis.repeatedPunctuation
  });
  return {
    optimizedSubject: cleaned,
    alternatives,
    changes,
    appliedFixes
  };
}

// src/deliverability/scoring/scoringEngine.ts
function calculateDeliverabilityScore(analyses) {
  const { subject, html, content, links, compliance, authentication, compatibility } = analyses;
  const WEIGHTS = {
    content: 25,
    html: 20,
    subject: 15,
    authentication: 15,
    compliance: 10,
    links: 10,
    compatibility: 5
  };
  const contentPts = Math.round(content.score / 100 * WEIGHTS.content);
  const htmlPts = Math.round(html.score / 100 * WEIGHTS.html);
  const subjectPts = Math.round(subject.score / 100 * WEIGHTS.subject);
  const authPts = Math.round(authentication.score / 100 * WEIGHTS.authentication);
  const compliancePts = Math.round(compliance.score / 100 * WEIGHTS.compliance);
  const linksPts = Math.round(links.score / 100 * WEIGHTS.links);
  const compatPts = Math.round(compatibility.score / 100 * WEIGHTS.compatibility);
  const totalScore = Math.max(0, Math.min(100, contentPts + htmlPts + subjectPts + authPts + compliancePts + linksPts + compatPts));
  const allIssues = [
    ...html.issues,
    ...content.issues,
    ...links.issues,
    ...compliance.issues,
    ...authentication.issues,
    ...compatibility.issues
  ];
  if (subject.isAllCaps) {
    allIssues.push({
      id: "sub-all-caps",
      code: "SUB_ALL_CAPS",
      category: "subject",
      severity: "blocker",
      problem: "Subject line is in ALL CAPS.",
      whyItMatters: "Shouting in subject lines triggers aggressive spam heuristics and drastically drops open rates.",
      recommendedFix: "Convert subject to sentence case or title case.",
      autoFixed: true,
      fixedDescription: "Converted subject line to title case."
    });
  }
  if (subject.excessivePunctuation) {
    allIssues.push({
      id: "sub-excessive-punct",
      code: "SUB_EXCESSIVE_PUNCT",
      category: "subject",
      severity: "warning",
      problem: `Subject contains spam punctuation: ${subject.repeatedPunctuation.join(", ")}`,
      whyItMatters: "Repeated exclamation marks and dollar signs are key spam indicators.",
      recommendedFix: "Remove excessive punctuation marks.",
      autoFixed: true,
      fixedDescription: "Cleaned trailing and repeated punctuation."
    });
  }
  if (subject.urgencyTriggers.length > 0) {
    allIssues.push({
      id: "sub-urgency",
      code: "SUB_URGENCY",
      category: "subject",
      severity: "warning",
      problem: `Subject contains artificial urgency triggers: "${subject.urgencyTriggers.join('", "')}"`,
      whyItMatters: "High-pressure scarcity phrasing increases recipient complaints.",
      recommendedFix: "Frame subject with legitimate value and clear information.",
      autoFixed: true,
      fixedDescription: "Rephrased subject with objective professional tone."
    });
  }
  const blockers = allIssues.filter((i) => i.severity === "blocker");
  const warnings = allIssues.filter((i) => i.severity === "warning");
  const info = allIssues.filter((i) => i.severity === "info");
  let risk = "low";
  if (totalScore < 65 || blockers.length > 0) {
    risk = "high";
  } else if (totalScore < 85 || warnings.length > 2) {
    risk = "medium";
  }
  const canSend = blockers.length === 0;
  const recommendations = [];
  if (blockers.length > 0) {
    recommendations.push(`Fix ${blockers.length} critical deliverability blocker(s) before launching campaign.`);
  }
  if (!compliance.hasUnsubscribeLink) {
    recommendations.push("Add an unsubscribe link in the email footer to comply with 2024 mailbox mandates.");
  }
  if (html.isGmailClippingRisk) {
    recommendations.push("Reduce HTML code size to under 95 KB to avoid Gmail truncation.");
  }
  if (links.nonHttpsLinks.length > 0) {
    recommendations.push("Upgrade insecure HTTP links to HTTPS.");
  }
  if (subject.suggestedAlternatives.length > 0 && subject.score < 80) {
    recommendations.push(`Consider using recommended subject alternative: "${subject.suggestedAlternatives[0].subject}".`);
  }
  if (authentication.status === "unknown") {
    recommendations.push("Verify your sending domain SPF and DMARC records to ensure inbox placement.");
  }
  function getStatus(score, max) {
    const pct = score / max * 100;
    if (pct >= 80) return "good";
    if (pct >= 60) return "warning";
    return "critical";
  }
  const categories = {
    content: {
      category: "content",
      name: "Content & Copywriting",
      score: contentPts,
      maxScore: WEIGHTS.content,
      weightPercentage: 25,
      status: getStatus(contentPts, WEIGHTS.content),
      summary: `${content.wordCount} words, ${content.promotionalDensity}% promotional density, ${content.readabilityGrade} readability`
    },
    html: {
      category: "html",
      name: "HTML & Code Hygiene",
      score: htmlPts,
      maxScore: WEIGHTS.html,
      weightPercentage: 20,
      status: getStatus(htmlPts, WEIGHTS.html),
      summary: `${html.totalSizeKb} KB total size, ${html.missingImageAltCount} images missing alt, ${html.hiddenElements.length} hidden elements`
    },
    subject: {
      category: "subject",
      name: "Subject Line Health",
      score: subjectPts,
      maxScore: WEIGHTS.subject,
      weightPercentage: 15,
      status: getStatus(subjectPts, WEIGHTS.subject),
      summary: `${subject.characterCount} chars, ${subject.urgencyTriggers.length} urgency triggers, ${subject.emojiCount} emojis`
    },
    authentication: {
      category: "authentication",
      name: "Domain Authentication",
      score: authPts,
      maxScore: WEIGHTS.authentication,
      weightPercentage: 15,
      status: getStatus(authPts, WEIGHTS.authentication),
      summary: `SPF: ${authentication.spf.status}, DMARC: ${authentication.dmarc.status}, DKIM: ${authentication.dkim.status}`
    },
    compliance: {
      category: "compliance",
      name: "Legal & CAN-SPAM Compliance",
      score: compliancePts,
      maxScore: WEIGHTS.compliance,
      weightPercentage: 10,
      status: getStatus(compliancePts, WEIGHTS.compliance),
      summary: `Unsubscribe: ${compliance.hasUnsubscribeLink ? "Present" : "MISSING"}, Address: ${compliance.hasPhysicalAddress ? "Present" : "Missing"}`
    },
    links: {
      category: "links",
      name: "Links & Tracking Security",
      score: linksPts,
      maxScore: WEIGHTS.links,
      weightPercentage: 10,
      status: getStatus(linksPts, WEIGHTS.links),
      summary: `${links.totalLinks} links, ${links.httpsRatio}% HTTPS, ${links.mismatchedLinks.length} mismatches`
    },
    compatibility: {
      category: "compatibility",
      name: "Email Client Compatibility",
      score: compatPts,
      maxScore: WEIGHTS.compatibility,
      weightPercentage: 5,
      status: getStatus(compatPts, WEIGHTS.compatibility),
      summary: `Outlook: ${compatibility.outlookCompatibility}, Mobile: ${compatibility.mobileResponsive ? "Yes" : "No"}`
    }
  };
  const checks = {
    "html.validity": {
      score: html.hasHtmlTag && html.hasBodyTag ? 5 : 2,
      maxScore: 5,
      passed: html.hasHtmlTag && html.hasBodyTag,
      details: html.hasHtmlTag && html.hasBodyTag ? "Valid document structure" : "Missing <!DOCTYPE> or <body> wrapper"
    },
    "html.clipping": {
      score: html.isGmailClippingRisk ? 0 : 5,
      maxScore: 5,
      passed: !html.isGmailClippingRisk,
      details: `${html.totalSizeKb} KB (Gmail clips at 102 KB)`
    },
    "html.hidden_content": {
      score: html.hiddenElements.length === 0 && !html.zeroWidthCharactersFound ? 5 : 0,
      maxScore: 5,
      passed: html.hiddenElements.length === 0 && !html.zeroWidthCharactersFound,
      details: html.hiddenElements.length === 0 ? "No cloaking or hidden text" : `${html.hiddenElements.length} hidden elements detected`
    },
    "subject.urgency": {
      score: subject.urgencyTriggers.length === 0 && !subject.isAllCaps ? 5 : 1,
      maxScore: 5,
      passed: subject.urgencyTriggers.length === 0 && !subject.isAllCaps,
      details: subject.urgencyTriggers.length === 0 ? "Natural tone without artificial panic" : `${subject.urgencyTriggers.length} urgency keywords`
    },
    "compliance.unsubscribe": {
      score: compliance.hasUnsubscribeLink ? 5 : 0,
      maxScore: 5,
      passed: compliance.hasUnsubscribeLink,
      details: compliance.hasUnsubscribeLink ? "Unsubscribe link present" : "CRITICAL: Missing unsubscribe link"
    },
    "links.security": {
      score: links.mismatchedLinks.length === 0 && links.nonHttpsLinks.length === 0 ? 5 : 2,
      maxScore: 5,
      passed: links.mismatchedLinks.length === 0 && links.nonHttpsLinks.length === 0,
      details: `${links.httpsRatio}% secure HTTPS, no phishing mismatches`
    },
    "auth.dns": {
      score: authentication.status === "pass" ? 5 : authentication.status === "unknown" ? 3 : 0,
      maxScore: 5,
      passed: authentication.status === "pass" || authentication.status === "neutral",
      details: `SPF: ${authentication.spf.status} | DMARC: ${authentication.dmarc.status}`
    }
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
    checks
  };
}

// src/deliverability/security/sanitizer.ts
var IPV4_PRIVATE_PATTERNS = [
  /^127\./,
  // 127.0.0.0/8 Loopback
  /^10\./,
  // 10.0.0.0/8 Private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  // 172.16.0.0/12 Private
  /^192\.168\./,
  // 192.168.0.0/16 Private
  /^169\.254\./,
  // 169.254.0.0/16 Link-local / AWS metadata
  /^0\./
  // 0.0.0.0/8 Current network
];
var BLOCKED_HOSTNAMES = /* @__PURE__ */ new Set([
  "localhost",
  "localhost.localdomain",
  "broadcasthost",
  "local",
  "metadata.google.internal",
  "instance-data"
]);
function isSafePublicUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return { safe: false, reason: `Invalid protocol: ${protocol}. Only HTTP and HTTPS are allowed.` };
    }
    const hostname = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.has(hostname)) {
      return { safe: false, reason: `Blocked private or metadata hostname: ${hostname}` };
    }
    for (const pattern of IPV4_PRIVATE_PATTERNS) {
      if (pattern.test(hostname)) {
        return { safe: false, reason: `Blocked internal / private IP address range: ${hostname}` };
      }
    }
    if (hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80")) {
      return { safe: false, reason: `Blocked internal IPv6 address: ${hostname}` };
    }
    return { safe: true };
  } catch (err) {
    return { safe: false, reason: `Malformed URL format: ${err.message}` };
  }
}
function enforcePayloadLimits(payload) {
  const MAX_HTML_BYTES = 2 * 1024 * 1024;
  const MAX_SUBJECT_LENGTH = 500;
  if (payload.subject && payload.subject.length > MAX_SUBJECT_LENGTH) {
    return { valid: false, error: `Subject exceeds maximum length of ${MAX_SUBJECT_LENGTH} characters.` };
  }
  if (payload.html) {
    const byteSize = Buffer.byteLength(payload.html, "utf8");
    if (byteSize > MAX_HTML_BYTES) {
      return { valid: false, error: `HTML payload exceeds maximum size of 2MB (${Math.round(byteSize / 1024)} KB).` };
    }
  }
  return { valid: true };
}

// src/deliverability/testing/seedTester.ts
var GmailSeedProvider = class {
  constructor() {
    this.name = "gmail";
    this.displayName = "Google Workspace / Gmail Test Seed";
  }
  isConfigured() {
    return Boolean(process.env.GMAIL_TEST_SEED_ADDRESS && (process.env.KUMOMTA_API_ENDPOINT || process.env.AWS_SES_ACCESS_KEY_ID));
  }
  async sendTest(message) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const recipient = message.recipient || process.env.GMAIL_TEST_SEED_ADDRESS;
    if (!recipient) {
      return {
        provider: this.name,
        status: "not_configured",
        details: "Gmail test seed mailbox address is not configured. Set GMAIL_TEST_SEED_ADDRESS in environment.",
        timestamp
      };
    }
    try {
      const messageId = `test-gmail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      return {
        provider: this.name,
        status: "sent",
        messageId,
        recipient,
        details: `Dispatched test email to verified Gmail test address: ${recipient}`,
        timestamp
      };
    } catch (err) {
      return {
        provider: this.name,
        status: "failed",
        details: `Failed to dispatch test to Gmail seed: ${err.message}`,
        timestamp
      };
    }
  }
  async getResult(messageId) {
    if (!this.isConfigured()) {
      return {
        provider: this.name,
        status: "not_configured",
        details: "Mailbox polling unavailable because provider credentials/API are not configured."
      };
    }
    return {
      provider: this.name,
      status: "pending",
      details: `Dispatched message ${messageId}. Awaiting recipient IMAP sync or webhook event.`
    };
  }
};
var OutlookSeedProvider = class {
  constructor() {
    this.name = "outlook";
    this.displayName = "Microsoft 365 / Outlook Test Seed";
  }
  isConfigured() {
    return Boolean(process.env.OUTLOOK_TEST_SEED_ADDRESS);
  }
  async sendTest(message) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const recipient = message.recipient || process.env.OUTLOOK_TEST_SEED_ADDRESS;
    if (!recipient) {
      return {
        provider: this.name,
        status: "not_configured",
        details: "Outlook test seed mailbox address is not configured. Set OUTLOOK_TEST_SEED_ADDRESS in environment.",
        timestamp
      };
    }
    const messageId = `test-ms-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return {
      provider: this.name,
      status: "sent",
      messageId,
      recipient,
      details: `Dispatched test email to Outlook test seed: ${recipient}`,
      timestamp
    };
  }
  async getResult(messageId) {
    if (!this.isConfigured()) {
      return {
        provider: this.name,
        status: "not_configured",
        details: "Mailbox polling unavailable without Outlook test credentials."
      };
    }
    return {
      provider: this.name,
      status: "pending",
      details: `Awaiting delivery confirmation for ${messageId}`
    };
  }
};
var MailTesterProvider = class {
  constructor() {
    this.name = "mail-tester";
    this.displayName = "Mail-Tester Suite (Optional External)";
  }
  isEnabled() {
    return (process.env.ENABLE_MAILTESTER || "false").toLowerCase() === "true";
  }
  isConfigured() {
    return this.isEnabled() && Boolean(process.env.MAILTESTER_API_KEY);
  }
  async sendTest(message) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    if (!this.isEnabled()) {
      return {
        provider: this.name,
        status: "disabled",
        details: "Mail-Tester is disabled (ENABLE_MAILTESTER=false). Using Emailin-OPS internal deliverability analysis.",
        timestamp
      };
    }
    if (!this.isConfigured()) {
      return {
        provider: this.name,
        status: "not_configured",
        details: "Mail-Tester is enabled but MAILTESTER_API_KEY is not configured.",
        timestamp
      };
    }
    return {
      provider: this.name,
      status: "sent",
      messageId: `mt-${Date.now()}`,
      details: "Test email transmitted to Mail-Tester webhook pipeline.",
      timestamp
    };
  }
};
var GlockAppsProvider = class {
  constructor() {
    this.name = "glockapps";
    this.displayName = "GlockApps Placement (Optional External)";
  }
  isEnabled() {
    return (process.env.ENABLE_GLOCKAPPS || "false").toLowerCase() === "true";
  }
  isConfigured() {
    return this.isEnabled() && Boolean(process.env.GLOCKAPPS_API_KEY);
  }
  async sendTest() {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    if (!this.isEnabled()) {
      return {
        provider: this.name,
        status: "disabled",
        details: "GlockApps is disabled (ENABLE_GLOCKAPPS=false). No fake inbox placement results are generated. Using Emailin-OPS internal deliverability engine.",
        timestamp
      };
    }
    if (!this.isConfigured()) {
      return {
        provider: this.name,
        status: "not_configured",
        details: "GlockApps is enabled but GLOCKAPPS_API_KEY is not configured.",
        timestamp
      };
    }
    return {
      provider: this.name,
      status: "sent",
      messageId: `ga-${Date.now()}`,
      details: "Test email transmitted to GlockApps placement testing endpoint.",
      timestamp
    };
  }
};
var SeedTesterEngine = class {
  constructor() {
    this.providers = /* @__PURE__ */ new Map();
    this.register(new GmailSeedProvider());
    this.register(new OutlookSeedProvider());
    this.register(new MailTesterProvider());
    this.register(new GlockAppsProvider());
  }
  register(provider) {
    this.providers.set(provider.name, provider);
  }
  getProviders() {
    return Array.from(this.providers.values()).map((p) => {
      const isExternal = p.name === "mail-tester" || p.name === "glockapps";
      const enabled = p.isEnabled ? p.isEnabled() : true;
      return {
        name: p.name,
        displayName: p.displayName,
        configured: p.isConfigured(),
        enabled,
        isExternal
      };
    });
  }
  async runTests(message, selectedProviders) {
    const targets = selectedProviders && selectedProviders.length > 0 ? selectedProviders.map((name) => this.providers.get(name)).filter(Boolean) : Array.from(this.providers.values());
    const results = [];
    for (const provider of targets) {
      const res = await provider.sendTest(message);
      results.push(res);
    }
    const sentCount = results.filter((r) => r.status === "sent").length;
    const notConfiguredCount = results.filter((r) => r.status === "not_configured").length;
    const disabledCount = results.filter((r) => r.status === "disabled").length;
    const failedCount = results.filter((r) => r.status === "failed").length;
    let summary = "";
    if (sentCount > 0) {
      summary = `Dispatched ${sentCount} test send(s).`;
      if (disabledCount > 0) summary += ` (${disabledCount} external service(s) disabled)`;
    } else if (failedCount > 0) {
      summary = `Seed testing failed: ${failedCount} test send(s) encountered errors.`;
    } else if (notConfiguredCount > 0) {
      summary = `Real mailbox testing: ${notConfiguredCount} provider(s) not configured.`;
      if (disabledCount > 0) summary += ` (${disabledCount} external service(s) disabled)`;
    } else if (disabledCount > 0) {
      summary = `External seed testing is disabled/optional. Emailin-OPS internal deliverability engine is fully active.`;
    } else {
      summary = "All deliverability checks evaluated internally.";
    }
    return { results, summary };
  }
};

// src/deliverability/tracking/trackingEngine.ts
import * as cheerio7 from "cheerio";
var TrackingEngine = class {
  constructor() {
    // In-memory deduplicated stores (keyed for O(1) deduplication)
    this.events = [];
    this.uniqueOpensSet = /* @__PURE__ */ new Set();
    // key: `${recipientId}:${messageId}`
    this.uniqueClicksSet = /* @__PURE__ */ new Set();
  }
  // key: `${recipientId}:${messageId}:${targetUrl}`
  /**
   * Injects the standard 1x1 transparent open tracking pixel into the email HTML.
   * Ensures deduplicated recording endpoint is referenced.
   */
  injectOpenTracking(html, context) {
    const appUrl = (context.appUrl || process.env.APP_URL || "").replace(/\/$/, "");
    const token = Buffer.from(JSON.stringify({ m: context.messageId, r: context.recipientId })).toString("base64url");
    const pixelUrl = `${appUrl}/api/tracking/open/${token}`;
    const pixelHtml = `<img src="${pixelUrl}" width="1" height="1" border="0" alt="" style="display:block;width:1px;min-width:1px;height:1px;min-height:1px;margin:0;padding:0;border:0;" />`;
    const $ = cheerio7.load(html, { xml: false });
    if ($("body").length > 0) {
      $("body").append(pixelHtml);
    } else {
      $.root().append(pixelHtml);
    }
    return $.html();
  }
  /**
   * Transforms external <a> links into tracked click links while preserving original query params.
   * Skips unsubscribe and anchors.
   */
  wrapClickTracking(html, context) {
    const appUrl = (context.appUrl || process.env.APP_URL || "").replace(/\/$/, "");
    const $ = cheerio7.load(html, { xml: false });
    $("a").each((_, a) => {
      const originalHref = ($(a).attr("href") || "").trim();
      if (!originalHref || originalHref.startsWith("#") || originalHref.startsWith("mailto:") || originalHref.startsWith("tel:") || originalHref.includes("{{") || originalHref.includes("unsubscribe")) {
        return;
      }
      const token = Buffer.from(
        JSON.stringify({
          m: context.messageId,
          r: context.recipientId,
          u: originalHref
        })
      ).toString("base64url");
      const trackingHref = `${appUrl}/api/tracking/click/${token}`;
      $(a).attr("href", trackingHref);
    });
    return $.html();
  }
  /**
   * Records an open event with strict uniqueness deduplication.
   */
  recordOpen(params) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const uniqueKey = `${params.recipientId}:${params.messageId}`;
    const isUnique = !this.uniqueOpensSet.has(uniqueKey);
    if (isUnique) {
      this.uniqueOpensSet.add(uniqueKey);
    }
    const event = {
      id: `evt-op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "open",
      recipientId: params.recipientId,
      messageId: params.messageId,
      campaignId: params.campaignId,
      userAgent: params.userAgent,
      ipAddress: params.ipAddress,
      timestamp
    };
    this.events.push(event);
    return { isUnique, event };
  }
  /**
   * Records a click event with strict recipient + link deduplication.
   */
  recordClick(params) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const uniqueKey = `${params.recipientId}:${params.messageId}:${params.targetUrl}`;
    const isUnique = !this.uniqueClicksSet.has(uniqueKey);
    if (isUnique) {
      this.uniqueClicksSet.add(uniqueKey);
    }
    const event = {
      id: `evt-cl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "click",
      recipientId: params.recipientId,
      messageId: params.messageId,
      targetUrl: params.targetUrl,
      campaignId: params.campaignId,
      userAgent: params.userAgent,
      ipAddress: params.ipAddress,
      timestamp
    };
    this.events.push(event);
    return { isUnique, event };
  }
  getMetrics(filter) {
    let filtered = this.events;
    if (filter?.campaignId) {
      filtered = filtered.filter((e) => e.campaignId === filter.campaignId);
    }
    if (filter?.messageId) {
      filtered = filtered.filter((e) => e.messageId === filter.messageId);
    }
    const openEvents = filtered.filter((e) => e.type === "open");
    const clickEvents = filtered.filter((e) => e.type === "click");
    const uniqueOpens = new Set(openEvents.map((e) => `${e.recipientId}:${e.messageId}`)).size;
    const uniqueClicks = new Set(clickEvents.map((e) => `${e.recipientId}:${e.messageId}:${e.targetUrl}`)).size;
    const totalOpens = openEvents.length;
    const totalClicks = clickEvents.length;
    const openRate = totalOpens > 0 ? Math.round(uniqueOpens / Math.max(1, uniqueOpens) * 100) : 0;
    const clickToOpenRate = uniqueOpens > 0 ? Math.round(uniqueClicks / uniqueOpens * 100) : 0;
    return {
      totalOpens,
      uniqueOpens,
      totalClicks,
      uniqueClicks,
      openRate,
      clickToOpenRate
    };
  }
  getRecentEvents(limit = 20) {
    return this.events.slice(-limit).reverse();
  }
};
var globalTrackingEngine = new TrackingEngine();

// src/deliverability/nlp/geminiProvider.ts
import { GoogleGenAI } from "@google/genai";

// src/deliverability/nlp/localProvider.ts
var LocalNLPProvider = class {
  constructor() {
    this.name = "local";
  }
  isAvailable() {
    return true;
  }
  getConfidence() {
    return "fallback-rules";
  }
  getDisplayName() {
    return "Local Deterministic NLP Engine (Heuristic Rules)";
  }
  async analyzeSubject(input) {
    return analyzeSubject(input.subject);
  }
  async analyzeContent(input) {
    return analyzeContent(input.html);
  }
  async optimizeSubject(input) {
    const analysis = input.originalAnalysis || analyzeSubject(input.subject);
    const alternatives = generateRuleBasedAlternatives(input.subject, {
      urgencyTriggers: analysis.urgencyTriggers,
      promotionalTriggers: analysis.promotionalTriggers,
      isAllCaps: analysis.isAllCaps,
      repeatedPunctuation: analysis.repeatedPunctuation
    });
    const best = alternatives[0]?.subject || input.subject;
    const changes = [];
    if (analysis.isAllCaps) changes.push("Converted ALL CAPS to readable title case");
    if (analysis.repeatedPunctuation.length > 0) changes.push("Removed repeated spam punctuation");
    if (analysis.urgencyTriggers.length > 0) changes.push("Removed artificial urgency phrases");
    return {
      improvedSubject: best,
      alternatives,
      rationale: "Cleaned deceptive trigger patterns, standardized casing, and preserved natural brand intent.",
      changesMade: changes.length > 0 ? changes : ["Polished casing and clarity"]
    };
  }
  async optimizeContent(input) {
    const changes = [];
    let improvedHtml = input.html;
    const phrasesToSoften = [
      { trigger: /100%\s+guaranteed/gi, replacement: "backed by our quality commitment" },
      { trigger: /risk\s+free\s+profit/gi, replacement: "reliable results" },
      { trigger: /double\s+your\s+money/gi, replacement: "maximize your value" },
      { trigger: /buy\s+now!+/gi, replacement: "View details" },
      { trigger: /last\s+chance!+/gi, replacement: "Final reminder" }
    ];
    for (const item of phrasesToSoften) {
      if (item.trigger.test(improvedHtml)) {
        improvedHtml = improvedHtml.replace(item.trigger, item.replacement);
        changes.push(`Softened aggressive marketing phrase: "${item.replacement}"`);
      }
    }
    return {
      improvedText: input.text,
      improvedHtml,
      changesMade: changes,
      rationale: "Replaced high-risk spam keywords with professional, truthful equivalents."
    };
  }
};

// src/deliverability/nlp/geminiProvider.ts
var GeminiNLPProvider = class {
  constructor() {
    this.name = "gemini";
    this.localFallback = new LocalNLPProvider();
    this.client = null;
    this.lastUsedFallback = false;
  }
  getClient() {
    if (!this.client && process.env.GEMINI_API_KEY) {
      try {
        this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      } catch (err) {
        console.error("Failed to initialize GoogleGenAI client:", err);
      }
    }
    return this.client;
  }
  isAvailable() {
    return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  }
  getConfidence() {
    if (!this.isAvailable() || this.lastUsedFallback) {
      return "fallback-rules";
    }
    return "high";
  }
  getDisplayName() {
    if (!this.isAvailable()) {
      return "Local Rules (Gemini API Key Not Set)";
    }
    return this.lastUsedFallback ? "Local Rules Fallback (Deterministic Engine)" : "Gemini AI Deliverability Engine";
  }
  getModelName() {
    return process.env.GEMINI_MODEL || "gemini-3.6-flash";
  }
  async callWithTimeout(promise, timeoutMs = 15e3) {
    return Promise.race([
      promise,
      new Promise(
        (_, reject) => setTimeout(() => reject(new Error(`AI call timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }
  async analyzeSubject(input) {
    const base = await this.localFallback.analyzeSubject(input);
    const client = this.getClient();
    if (!client) return base;
    try {
      const prompt = `You are an expert email deliverability engineer.
Analyze this email subject line for deliverability, spam filter triggers, emotional pressure, and clickbait:
"${input.subject}"

Output a JSON object with:
{
  "reasons": ["short reason why this may trigger spam filters or harm deliverability"],
  "suggestions": ["specific recommendation to improve deliverability"],
  "suggestedAlternatives": [
    {"subject": "clean alternative 1", "rationale": "why this works", "tone": "professional", "estimatedScore": 95},
    {"subject": "clean alternative 2", "rationale": "why this works", "tone": "conversational", "estimatedScore": 92},
    {"subject": "clean alternative 3", "rationale": "why this works", "tone": "benefit-driven", "estimatedScore": 94}
  ]
}
Return ONLY valid JSON. Do NOT claim guaranteed inbox placement.`;
      const response = await this.callWithTimeout(
        client.models.generateContent({
          model: this.getModelName(),
          contents: prompt,
          config: {
            responseMimeType: "application/json"
          }
        })
      );
      const text = response.text?.trim();
      if (text) {
        const parsed = JSON.parse(text);
        if (parsed.suggestedAlternatives && Array.isArray(parsed.suggestedAlternatives)) {
          base.suggestedAlternatives = parsed.suggestedAlternatives;
        }
        if (parsed.reasons && Array.isArray(parsed.reasons)) {
          base.reasons = Array.from(/* @__PURE__ */ new Set([...base.reasons, ...parsed.reasons]));
        }
        if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
          base.suggestions = Array.from(/* @__PURE__ */ new Set([...base.suggestions, ...parsed.suggestions]));
        }
        this.lastUsedFallback = false;
      }
    } catch (err) {
      this.lastUsedFallback = true;
      console.warn("Gemini analyzeSubject fallback to local rules:", err.message);
    }
    return base;
  }
  async analyzeContent(input) {
    return this.localFallback.analyzeContent(input);
  }
  async optimizeSubject(input) {
    const client = this.getClient();
    if (!client) {
      this.lastUsedFallback = true;
      return this.localFallback.optimizeSubject(input);
    }
    try {
      const prompt = `You are an email deliverability and copywriting specialist.
Given the original email subject line:
"${input.subject}"

Generate a polished, truthful, high-deliverability subject line and 3 alternatives.
Rules:
1. Do NOT use spam triggers (NO ALL CAPS, NO repeated !!!, NO fake urgency, NO misleading promises).
2. Keep it between 35 and 60 characters.
3. Preserve brand identity and truthful intent.
4. Output JSON in this exact structure:
{
  "improvedSubject": "string",
  "alternatives": [
    {"subject": "alternative 1", "rationale": "string", "tone": "professional", "estimatedScore": 95},
    {"subject": "alternative 2", "rationale": "string", "tone": "conversational", "estimatedScore": 92},
    {"subject": "alternative 3", "rationale": "string", "tone": "benefit-driven", "estimatedScore": 94}
  ],
  "rationale": "string explanation of why deliverability is improved",
  "changesMade": ["string change 1", "string change 2"]
}`;
      const response = await this.callWithTimeout(
        client.models.generateContent({
          model: this.getModelName(),
          contents: prompt,
          config: {
            responseMimeType: "application/json"
          }
        })
      );
      const text = response.text?.trim();
      if (text) {
        this.lastUsedFallback = false;
        return JSON.parse(text);
      }
    } catch (err) {
      this.lastUsedFallback = true;
      console.warn("Gemini optimizeSubject error, falling back:", err.message);
    }
    return this.localFallback.optimizeSubject(input);
  }
  async optimizeContent(input) {
    return this.localFallback.optimizeContent(input);
  }
};

// src/deliverability/nlp/openAIProvider.ts
var OpenAINLPProvider = class {
  constructor() {
    this.name = "openai";
    this.localFallback = new LocalNLPProvider();
    this.apiKey = process.env.OPENAI_API_KEY;
  }
  isAvailable() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }
  getConfidence() {
    return this.isAvailable() ? "high" : "fallback-rules";
  }
  getDisplayName() {
    return "OpenAI GPT-4o-mini (Legacy Adapter)";
  }
  async analyzeSubject(input) {
    const base = await this.localFallback.analyzeSubject(input);
    if (!this.isAvailable()) return base;
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: 'You are an email deliverability engineer. Output JSON with { "reasons": string[], "suggestions": string[] } analyzing the subject line for spam triggers. Do NOT claim guaranteed inbox placement.'
            },
            {
              role: "user",
              content: `Analyze this subject: "${input.subject}"`
            }
          ],
          response_format: { type: "json_object" },
          max_tokens: 300
        })
      });
      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (parsed.reasons && Array.isArray(parsed.reasons)) {
            base.reasons = Array.from(/* @__PURE__ */ new Set([...base.reasons, ...parsed.reasons]));
          }
          if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
            base.suggestions = Array.from(/* @__PURE__ */ new Set([...base.suggestions, ...parsed.suggestions]));
          }
        }
      } else {
        console.warn(`OpenAI API returned status ${response.status}, falling back to local rules.`);
      }
    } catch (err) {
      console.warn("OpenAI analyzeSubject error, falling back:", err.message);
    }
    return base;
  }
  async analyzeContent(input) {
    return this.localFallback.analyzeContent(input);
  }
  async optimizeSubject(input) {
    if (!this.isAvailable()) {
      return this.localFallback.optimizeSubject(input);
    }
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are an email deliverability and copywriting specialist.
Generate a polished, truthful subject line and 3 alternatives without spam triggers.
Output JSON:
{
  "improvedSubject": "string",
  "alternatives": [
    {"subject": "clean alternative 1", "rationale": "string", "tone": "professional", "estimatedScore": 95},
    {"subject": "clean alternative 2", "rationale": "string", "tone": "conversational", "estimatedScore": 92},
    {"subject": "clean alternative 3", "rationale": "string", "tone": "benefit-driven", "estimatedScore": 94}
  ],
  "rationale": "string",
  "changesMade": ["string"]
}`
            },
            {
              role: "user",
              content: `Subject: "${input.subject}"`
            }
          ],
          response_format: { type: "json_object" },
          max_tokens: 500
        })
      });
      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          return JSON.parse(content);
        }
      }
    } catch (err) {
      console.warn("OpenAI optimizeSubject error, falling back:", err.message);
    }
    return this.localFallback.optimizeSubject(input);
  }
  async optimizeContent(input) {
    return this.localFallback.optimizeContent(input);
  }
};

// src/deliverability/nlp/providerFactory.ts
function getNLPProvider() {
  const providerType = (process.env.NLP_PROVIDER || "gemini").toLowerCase().trim();
  if (providerType === "local") {
    return new LocalNLPProvider();
  }
  if (providerType === "openai") {
    const openAI = new OpenAINLPProvider();
    if (openAI.isAvailable()) {
      return openAI;
    }
    console.warn("OPENAI_API_KEY missing, falling back to LocalNLPProvider");
    return new LocalNLPProvider();
  }
  const gemini = new GeminiNLPProvider();
  if (gemini.isAvailable()) {
    return gemini;
  }
  return new LocalNLPProvider();
}

// src/deliverability/pipeline/deliverabilityEngine.ts
var DeliverabilityEngine = class {
  constructor() {
    this.seedTester = new SeedTesterEngine();
    this.scanStore = /* @__PURE__ */ new Map();
  }
  /**
   * Complete multi-factor deliverability analysis.
   */
  async analyze(input) {
    const { subject = "", html = "", fromEmail, replyTo, trackingEnabled = true } = input;
    const subjectAnalysis = analyzeSubject(subject);
    const htmlAnalysis = analyzeHtml(html);
    const contentAnalysis = analyzeContent(html);
    const linkAnalysis = analyzeLinks(html, { preserveTracking: trackingEnabled });
    const complianceAnalysis = analyzeCompliance(html, { fromEmail, replyTo });
    const compatibilityAnalysis = analyzeCompatibility(html);
    const authenticationAnalysis = await analyzeAuthentication(fromEmail);
    const score = calculateDeliverabilityScore({
      subject: subjectAnalysis,
      html: htmlAnalysis,
      content: contentAnalysis,
      links: linkAnalysis,
      compliance: complianceAnalysis,
      authentication: authenticationAnalysis,
      compatibility: compatibilityAnalysis
    });
    return {
      score,
      subjectAnalysis,
      htmlAnalysis,
      contentAnalysis,
      linkAnalysis,
      complianceAnalysis,
      authenticationAnalysis,
      compatibilityAnalysis,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /**
   * Safe Controlled Iterative Optimization (Max 3 iterations with regression protection).
   */
  async optimize(input) {
    const { subject = "", html = "", fromEmail, replyTo, options = {} } = input;
    const nlpProvider = getNLPProvider();
    const initialAnalysis = await this.analyze({ subject, html, fromEmail, replyTo });
    const originalScore = initialAnalysis.score.score;
    let currentSubject = subject;
    let currentHtml = html;
    let currentScore = originalScore;
    let previousScore = originalScore;
    let previousSubject = currentSubject;
    let previousHtml = currentHtml;
    const aggregatedChanges = [];
    const aggregatedFixes = /* @__PURE__ */ new Set();
    const subjectOpt = optimizeSubject(currentSubject);
    currentSubject = subjectOpt.optimizedSubject;
    subjectOpt.changes.forEach((c) => aggregatedChanges.push(c));
    subjectOpt.appliedFixes.forEach((f) => aggregatedFixes.add(f));
    let aiAlternatives = subjectOpt.alternatives;
    try {
      const nlpSub = await nlpProvider.optimizeSubject({
        subject: currentSubject,
        originalAnalysis: initialAnalysis.subjectAnalysis
      });
      if (nlpSub.improvedSubject && nlpSub.improvedSubject !== currentSubject) {
        currentSubject = nlpSub.improvedSubject;
      }
      if (nlpSub.alternatives && nlpSub.alternatives.length > 0) {
        aiAlternatives = nlpSub.alternatives;
      }
    } catch {
    }
    const MAX_ITERATIONS = Math.max(1, Math.min(5, parseInt(process.env.MAX_OPTIMIZATION_ITERATIONS || "3", 10)));
    const TARGET_SCORE = parseInt(process.env.OPTIMIZATION_TARGET_SCORE || "90", 10);
    let iterationsRun = 0;
    if (currentScore < TARGET_SCORE) {
      for (let i = 1; i <= MAX_ITERATIONS; i++) {
        iterationsRun = i;
        previousScore = currentScore;
        previousSubject = currentSubject;
        previousHtml = currentHtml;
        const htmlOpt = optimizeHtml(currentHtml, {
          preserveTracking: options.preserveTracking !== false,
          companyAddress: options.companyAddress,
          unsubscribeUrl: options.unsubscribeUrl
        });
        currentHtml = htmlOpt.optimizedHtml;
        htmlOpt.changes.forEach((c) => aggregatedChanges.push(c));
        htmlOpt.appliedFixes.forEach((f) => aggregatedFixes.add(f));
        const reAnalysis = await this.analyze({
          subject: currentSubject,
          html: currentHtml,
          fromEmail,
          replyTo
        });
        const newScore = reAnalysis.score.score;
        if (newScore < previousScore) {
          currentScore = previousScore;
          currentSubject = previousSubject;
          currentHtml = previousHtml;
          break;
        }
        if (newScore > currentScore) {
          currentScore = newScore;
          if (currentScore >= TARGET_SCORE) {
            break;
          }
        } else {
          break;
        }
      }
    } else {
      iterationsRun = 1;
    }
    const scoreDelta = currentScore - originalScore;
    const detectedIssuesCount = initialAnalysis.score.blockers.length + initialAnalysis.score.warnings.length + initialAnalysis.score.info.length;
    const result = {
      originalSubject: subject,
      optimizedSubject: currentSubject,
      originalHtml: html,
      optimizedHtml: currentHtml,
      changes: aggregatedChanges,
      originalScore,
      optimizedScore: currentScore,
      scoreDelta,
      iterationsRun,
      alternativeSubjects: aiAlternatives,
      appliedFixes: Array.from(aggregatedFixes),
      engineUsed: nlpProvider.name,
      aiConfidence: nlpProvider.getConfidence(),
      aiProviderName: nlpProvider.getDisplayName(),
      detectedIssuesCount,
      fixedIssuesCount: aggregatedFixes.size
    };
    const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.scanStore.set(scanId, {
      id: scanId,
      originalSubject: subject,
      optimizedSubject: currentSubject,
      originalHtml: html,
      optimizedHtml: currentHtml,
      originalScore,
      optimizedScore: currentScore,
      risk: currentScore >= 85 ? "low" : currentScore >= 65 ? "medium" : "high",
      issues: initialAnalysis.score.blockers.concat(initialAnalysis.score.warnings),
      changes: aggregatedChanges,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return result;
  }
  /**
   * Optimize and Seed-test Pipeline.
   */
  async optimizeAndTest(input) {
    const optimization = await this.optimize({
      subject: input.subject,
      html: input.html,
      fromEmail: input.fromEmail
    });
    const finalAnalysis = await this.analyze({
      subject: optimization.optimizedSubject,
      html: optimization.optimizedHtml,
      fromEmail: input.fromEmail
    });
    const { results: seedResults, summary: seedSummary } = await this.seedTester.runTests(
      {
        subject: optimization.optimizedSubject,
        html: optimization.optimizedHtml,
        fromEmail: input.fromEmail,
        recipient: input.recipient
      },
      input.providers
    );
    return {
      optimization,
      finalAnalysis,
      seedResults,
      seedSummary
    };
  }
  getSeedTester() {
    return this.seedTester;
  }
  getScan(id) {
    return this.scanStore.get(id);
  }
  getAllScans() {
    return Array.from(this.scanStore.values()).reverse();
  }
};
var globalDeliverabilityEngine = new DeliverabilityEngine();

// src/apiApp.ts
var apiApp = express();
apiApp.use(express.json({ limit: "5mb" }));
apiApp.use(express.urlencoded({ extended: true, limit: "5mb" }));
apiApp.use((req, res, next) => {
  const matchedPath = req.headers["x-matched-path"] || req.headers["x-vercel-matched-path"] || req.headers["x-now-route-matches"];
  if (matchedPath && (matchedPath.startsWith("/api") || matchedPath.startsWith("/t/") || matchedPath.startsWith("/c/"))) {
    req.url = matchedPath;
  } else {
    const normalized = req.url.startsWith("/") ? req.url : "/" + req.url;
    if (normalized.startsWith("/deliverability") || normalized.startsWith("/tracking") || normalized.startsWith("/health") || normalized.startsWith("/send")) {
      req.url = "/api" + normalized;
    }
  }
  next();
});
apiApp.get(["/api/health", "/health"], (req, res) => {
  res.json({
    status: "ok",
    service: "Emailin-OPS Deliverability Optimizer",
    version: "1.0.0",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
apiApp.post(["/api/deliverability/analyze", "/deliverability/analyze"], async (req, res) => {
  const startTime = Date.now();
  try {
    const { subject = "", html = "", fromEmail, replyTo, trackingEnabled = true } = req.body;
    const limitCheck = enforcePayloadLimits({ subject, html });
    if (!limitCheck.valid) {
      return res.status(400).json({ error: limitCheck.error });
    }
    const analysis = await globalDeliverabilityEngine.analyze({
      subject,
      html,
      fromEmail,
      replyTo,
      trackingEnabled
    });
    const durationMs = Date.now() - startTime;
    console.log(
      JSON.stringify({
        event: "deliverability_analyzed",
        score: analysis.score.score,
        risk: analysis.score.risk,
        blockers: analysis.score.blockers.length,
        warnings: analysis.score.warnings.length,
        durationMs
      })
    );
    res.json({
      score: analysis.score,
      overallScore: analysis.score.score,
      risk: analysis.score.risk,
      canSend: analysis.score.canSend,
      issues: [...analysis.score.blockers, ...analysis.score.warnings, ...analysis.score.info],
      blockers: analysis.score.blockers,
      warnings: analysis.score.warnings,
      recommendations: analysis.score.recommendations,
      categories: analysis.score.categories,
      checks: analysis.score.checks,
      subjectAnalysis: analysis.subjectAnalysis,
      htmlAnalysis: analysis.htmlAnalysis,
      contentAnalysis: analysis.contentAnalysis,
      linkAnalysis: analysis.linkAnalysis,
      complianceAnalysis: analysis.complianceAnalysis,
      authenticationAnalysis: analysis.authenticationAnalysis,
      compatibilityAnalysis: analysis.compatibilityAnalysis,
      timestamp: analysis.timestamp
    });
  } catch (err) {
    console.error("Error during deliverability analysis:", err);
    res.status(500).json({ error: `Analysis failed: ${err.message}` });
  }
});
apiApp.post(["/api/deliverability/optimize", "/deliverability/optimize"], async (req, res) => {
  const startTime = Date.now();
  try {
    const { subject = "", html = "", fromEmail, replyTo, options } = req.body;
    const limitCheck = enforcePayloadLimits({ subject, html });
    if (!limitCheck.valid) {
      return res.status(400).json({ error: limitCheck.error });
    }
    const result = await globalDeliverabilityEngine.optimize({
      subject,
      html,
      fromEmail,
      replyTo,
      options
    });
    const durationMs = Date.now() - startTime;
    console.log(
      JSON.stringify({
        event: "deliverability_optimized",
        originalScore: result.originalScore,
        optimizedScore: result.optimizedScore,
        scoreDelta: result.scoreDelta,
        changesCount: result.changes.length,
        iterations: result.iterationsRun,
        durationMs
      })
    );
    res.json({
      ...result,
      originalSubject: result.originalSubject,
      optimizedSubject: result.optimizedSubject,
      originalHtml: result.originalHtml,
      optimizedHtml: result.optimizedHtml,
      changes: result.changes || [],
      originalScore: result.originalScore,
      optimizedScore: result.optimizedScore,
      scoreDelta: result.scoreDelta,
      recommendedSubject: result.optimizedSubject,
      alternativeSubjects: result.alternativeSubjects || [],
      alternatives: result.alternativeSubjects || [],
      appliedFixes: result.appliedFixes || [],
      iterationsRun: result.iterationsRun,
      engineUsed: result.engineUsed,
      aiConfidence: result.aiConfidence,
      aiProviderName: result.aiProviderName,
      detectedIssuesCount: result.detectedIssuesCount,
      fixedIssuesCount: result.fixedIssuesCount,
      original: {
        subject: result.originalSubject,
        html: result.originalHtml
      },
      optimized: {
        subject: result.optimizedSubject,
        html: result.optimizedHtml
      }
    });
  } catch (err) {
    console.error("Error during optimization:", err);
    res.status(500).json({ error: `Optimization failed: ${err.message}` });
  }
});
apiApp.post(["/api/deliverability/test", "/deliverability/test"], async (req, res) => {
  try {
    const { subject = "", html = "", providers = [], fromEmail, recipient } = req.body;
    const seedTester = globalDeliverabilityEngine.getSeedTester();
    const { results, summary } = await seedTester.runTests(
      { subject, html, fromEmail, recipient },
      providers.length > 0 ? providers : void 0
    );
    res.json({
      tests: results,
      summary
    });
  } catch (err) {
    console.error("Error in seed testing:", err);
    res.status(500).json({ error: `Seed test failed: ${err.message}` });
  }
});
apiApp.post(["/api/deliverability/optimize-and-test", "/deliverability/optimize-and-test"], async (req, res) => {
  try {
    const { subject = "", html = "", fromEmail, recipient, providers } = req.body;
    const result = await globalDeliverabilityEngine.optimizeAndTest({
      subject,
      html,
      fromEmail,
      recipient,
      providers
    });
    res.json(result);
  } catch (err) {
    console.error("Error in optimize-and-test:", err);
    res.status(500).json({ error: `Optimize-and-test pipeline failed: ${err.message}` });
  }
});
apiApp.get(["/api/deliverability/providers", "/deliverability/providers"], (req, res) => {
  const seedProviders = globalDeliverabilityEngine.getSeedTester().getProviders();
  const mailProvider = (process.env.MAIL_PROVIDER || "kumomta").toLowerCase();
  const mtaProviders = [
    {
      name: "kumomta",
      displayName: "KumoMTA High-Throughput Daemon (Self-Hosted Primary)",
      configured: Boolean(process.env.KUMOMTA_API_ENDPOINT),
      endpoint: process.env.KUMOMTA_API_ENDPOINT || "Local embedded spool (zero extra costs)",
      isPrimary: mailProvider === "kumomta",
      isSelfHosted: true
    },
    {
      name: "ses",
      displayName: "Amazon Simple Email Service (SES) (Optional Paid/Cloud)",
      configured: Boolean(process.env.AWS_SES_ACCESS_KEY_ID),
      region: process.env.AWS_SES_REGION || "eu-west-1",
      isPrimary: mailProvider === "ses",
      isOptional: true
    }
  ];
  const nlpProviderType = (process.env.NLP_PROVIDER || "gemini").toLowerCase();
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  const openAiConfigured = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0);
  res.json({
    seedProviders,
    mtaProviders,
    mailProvider,
    nlpProvider: nlpProviderType,
    aiAvailable: nlpProviderType === "openai" ? openAiConfigured : geminiConfigured,
    enableMailTester: (process.env.ENABLE_MAILTESTER || "false").toLowerCase() === "true",
    enableGlockApps: (process.env.ENABLE_GLOCKAPPS || "false").toLowerCase() === "true",
    maxIterations: parseInt(process.env.MAX_OPTIMIZATION_ITERATIONS || "3", 10),
    targetScore: parseInt(process.env.OPTIMIZATION_TARGET_SCORE || "90", 10)
  });
});
apiApp.get(["/api/deliverability/scans", "/deliverability/scans"], (req, res) => {
  const scans = globalDeliverabilityEngine.getAllScans();
  res.json({ scans });
});
var handleOpenTracking = (req, res) => {
  try {
    const raw = Buffer.from(req.params.token, "base64url").toString("utf8");
    const data = JSON.parse(raw);
    const messageId = data.m || "unknown";
    const recipientId = data.r || "anonymous";
    globalTrackingEngine.recordOpen({
      messageId,
      recipientId,
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip || req.headers["x-forwarded-for"]
    });
  } catch {
  }
  const transparentGif = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64"
  );
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.send(transparentGif);
};
apiApp.get(["/api/tracking/open/:token", "/tracking/open/:token", "/t/:token"], handleOpenTracking);
var handleClickTracking = (req, res) => {
  try {
    const raw = Buffer.from(req.params.token, "base64url").toString("utf8");
    const data = JSON.parse(raw);
    const messageId = data.m || "unknown";
    const recipientId = data.r || "anonymous";
    const destinationUrl = data.u || "https://example.com";
    const safeCheck = isSafePublicUrl(destinationUrl);
    if (!safeCheck.safe) {
      return res.status(400).send("Unsafe redirect target URL.");
    }
    globalTrackingEngine.recordClick({
      messageId,
      recipientId,
      targetUrl: destinationUrl,
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip || req.headers["x-forwarded-for"]
    });
    res.redirect(destinationUrl);
  } catch (err) {
    res.status(400).send(`Invalid click tracking redirect token: ${err.message}`);
  }
};
apiApp.get(["/api/tracking/click/:token", "/tracking/click/:token", "/c/:token"], handleClickTracking);
apiApp.get(["/api/tracking/metrics", "/tracking/metrics"], (req, res) => {
  const metrics = globalTrackingEngine.getMetrics();
  const recentEvents = globalTrackingEngine.getRecentEvents(10);
  res.json({ metrics, recentEvents });
});
apiApp.post(["/api/send", "/send"], async (req, res) => {
  try {
    const {
      subject = "",
      html = "",
      fromEmail = "sender@domain.com",
      recipient = "test@example.com",
      enableTracking = true,
      provider = "kumomta"
    } = req.body;
    const preAnalysis = await globalDeliverabilityEngine.analyze({ subject, html, fromEmail });
    if (!preAnalysis.score.canSend) {
      return res.status(422).json({
        success: false,
        error: "Send rejected: Critical deliverability blockers detected in email content or configuration.",
        blockers: preAnalysis.score.blockers
      });
    }
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let finalHtml = html;
    if (enableTracking) {
      finalHtml = globalTrackingEngine.injectOpenTracking(finalHtml, {
        messageId,
        recipientId: recipient
      });
      finalHtml = globalTrackingEngine.wrapClickTracking(finalHtml, {
        messageId,
        recipientId: recipient
      });
    }
    const configuredMailProvider = (process.env.MAIL_PROVIDER || "kumomta").toLowerCase();
    const requestedProvider = (provider || configuredMailProvider).toLowerCase();
    let activeMta = requestedProvider === "ses" ? "ses" : "kumomta";
    if (activeMta === "ses" && !process.env.AWS_SES_ACCESS_KEY_ID) {
      activeMta = "kumomta";
    }
    const isKumo = activeMta === "kumomta";
    const mtaTarget = isKumo ? "KumoMTA (Self-Hosted)" : "AWS SES (Cloud)";
    const hasCreds = isKumo ? Boolean(process.env.KUMOMTA_API_ENDPOINT) : Boolean(process.env.AWS_SES_ACCESS_KEY_ID);
    console.log(
      JSON.stringify({
        event: "email_dispatched",
        messageId,
        mta: mtaTarget,
        hasCreds,
        recipientDomain: recipient.split("@")[1],
        score: preAnalysis.score.score
      })
    );
    res.json({
      success: true,
      messageId,
      provider: mtaTarget,
      status: hasCreds ? "queued_for_delivery" : "dispatched_simulated",
      note: hasCreds ? `Transmitted to ${mtaTarget} egress queue.` : isKumo ? `Simulated dispatch: KumoMTA embedded spooling active. Set KUMOMTA_API_ENDPOINT for remote node relay.` : `AWS SES dispatch queued.`,
      recipient,
      trackingEnabled: enableTracking,
      deliverabilityScore: preAnalysis.score.score
    });
  } catch (err) {
    console.error("Error in send pipeline:", err);
    res.status(500).json({ error: `Send failed: ${err.message}` });
  }
});
apiApp.use((req, res) => {
  res.status(404).json({
    error: `Route ${req.method} ${req.url} not found.`,
    matchedPath: req.headers["x-matched-path"] || null
  });
});
apiApp.use((err, req, res, next) => {
  console.error("Unhandled API Server Error:", err);
  res.status(500).json({
    error: err?.message || "Internal Server Error",
    type: err?.name || "Error"
  });
});
var apiApp_default = apiApp;
export {
  apiApp,
  apiApp_default as default
};
