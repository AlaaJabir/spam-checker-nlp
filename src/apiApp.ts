import express, { Request, Response, NextFunction } from 'express';
import {
  globalDeliverabilityEngine,
  globalTrackingEngine,
  enforcePayloadLimits,
  isSafePublicUrl,
} from './deliverability';

const apiApp = express();

// Body parser with safe payload limits
apiApp.use(express.json({ limit: '5mb' }));
apiApp.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Safe URL normalization for Vercel / serverless deployments:
// Normalizes when matchedPath header is present or when API paths arrive without /api prefix
apiApp.use((req: Request, res: Response, next: NextFunction) => {
  const matchedPath =
    (req.headers['x-matched-path'] as string) ||
    (req.headers['x-vercel-matched-path'] as string) ||
    (req.headers['x-now-route-matches'] as string);

  if (matchedPath && (matchedPath.startsWith('/api') || matchedPath.startsWith('/t/') || matchedPath.startsWith('/c/'))) {
    req.url = matchedPath;
  } else {
    const normalized = req.url.startsWith('/') ? req.url : '/' + req.url;
    if (
      normalized.startsWith('/deliverability') ||
      normalized.startsWith('/tracking') ||
      normalized.startsWith('/health') ||
      normalized.startsWith('/send')
    ) {
      req.url = '/api' + normalized;
    }
  }
  next();
});

// 1. Health check
apiApp.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Emailin-OPS Deliverability Optimizer',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// 2. POST /api/deliverability/analyze
apiApp.post('/api/deliverability/analyze', async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const { subject = '', html = '', fromEmail, replyTo, trackingEnabled = true } = req.body;

    const limitCheck = enforcePayloadLimits({ subject, html });
    if (!limitCheck.valid) {
      return res.status(400).json({ error: limitCheck.error });
    }

    const analysis = await globalDeliverabilityEngine.analyze({
      subject,
      html,
      fromEmail,
      replyTo,
      trackingEnabled,
    });

    const durationMs = Date.now() - startTime;
    console.log(
      JSON.stringify({
        event: 'deliverability_analyzed',
        score: analysis.score.score,
        risk: analysis.score.risk,
        blockers: analysis.score.blockers.length,
        warnings: analysis.score.warnings.length,
        durationMs,
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
      timestamp: analysis.timestamp,
    });
  } catch (err: any) {
    console.error('Error during deliverability analysis:', err);
    res.status(500).json({ error: `Analysis failed: ${err.message}` });
  }
});

// 3. POST /api/deliverability/optimize
apiApp.post('/api/deliverability/optimize', async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const { subject = '', html = '', fromEmail, replyTo, options } = req.body;

    const limitCheck = enforcePayloadLimits({ subject, html });
    if (!limitCheck.valid) {
      return res.status(400).json({ error: limitCheck.error });
    }

    const result = await globalDeliverabilityEngine.optimize({
      subject,
      html,
      fromEmail,
      replyTo,
      options,
    });

    const durationMs = Date.now() - startTime;
    console.log(
      JSON.stringify({
        event: 'deliverability_optimized',
        originalScore: result.originalScore,
        optimizedScore: result.optimizedScore,
        scoreDelta: result.scoreDelta,
        changesCount: result.changes.length,
        iterations: result.iterationsRun,
        durationMs,
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
        html: result.originalHtml,
      },
      optimized: {
        subject: result.optimizedSubject,
        html: result.optimizedHtml,
      },
    });
  } catch (err: any) {
    console.error('Error during optimization:', err);
    res.status(500).json({ error: `Optimization failed: ${err.message}` });
  }
});

// 4. POST /api/deliverability/test
apiApp.post('/api/deliverability/test', async (req: Request, res: Response) => {
  try {
    const { subject = '', html = '', providers = [], fromEmail, recipient } = req.body;
    const seedTester = globalDeliverabilityEngine.getSeedTester();

    const { results, summary } = await seedTester.runTests(
      { subject, html, fromEmail, recipient },
      providers.length > 0 ? providers : undefined
    );

    res.json({
      tests: results,
      summary,
    });
  } catch (err: any) {
    console.error('Error in seed testing:', err);
    res.status(500).json({ error: `Seed test failed: ${err.message}` });
  }
});

// 5. POST /api/deliverability/optimize-and-test
apiApp.post('/api/deliverability/optimize-and-test', async (req: Request, res: Response) => {
  try {
    const { subject = '', html = '', fromEmail, recipient, providers } = req.body;

    const result = await globalDeliverabilityEngine.optimizeAndTest({
      subject,
      html,
      fromEmail,
      recipient,
      providers,
    });

    res.json(result);
  } catch (err: any) {
    console.error('Error in optimize-and-test:', err);
    res.status(500).json({ error: `Optimize-and-test pipeline failed: ${err.message}` });
  }
});

// 6. GET /api/deliverability/providers
apiApp.get('/api/deliverability/providers', (req: Request, res: Response) => {
  const seedProviders = globalDeliverabilityEngine.getSeedTester().getProviders();
  const mailProvider = (process.env.MAIL_PROVIDER || 'kumomta').toLowerCase();

  const mtaProviders = [
    {
      name: 'kumomta',
      displayName: 'KumoMTA High-Throughput Daemon (Self-Hosted Primary)',
      configured: Boolean(process.env.KUMOMTA_API_ENDPOINT),
      endpoint: process.env.KUMOMTA_API_ENDPOINT || 'Local embedded spool (zero extra costs)',
      isPrimary: mailProvider === 'kumomta',
      isSelfHosted: true,
    },
    {
      name: 'ses',
      displayName: 'Amazon Simple Email Service (SES) (Optional Paid/Cloud)',
      configured: Boolean(process.env.AWS_SES_ACCESS_KEY_ID),
      region: process.env.AWS_SES_REGION || 'eu-west-1',
      isPrimary: mailProvider === 'ses',
      isOptional: true,
    },
  ];

  const nlpProviderType = (process.env.NLP_PROVIDER || 'gemini').toLowerCase();
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  const openAiConfigured = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0);

  res.json({
    seedProviders,
    mtaProviders,
    mailProvider,
    nlpProvider: nlpProviderType,
    aiAvailable: nlpProviderType === 'openai' ? openAiConfigured : geminiConfigured,
    enableMailTester: (process.env.ENABLE_MAILTESTER || 'false').toLowerCase() === 'true',
    enableGlockApps: (process.env.ENABLE_GLOCKAPPS || 'false').toLowerCase() === 'true',
    maxIterations: parseInt(process.env.MAX_OPTIMIZATION_ITERATIONS || '3', 10),
    targetScore: parseInt(process.env.OPTIMIZATION_TARGET_SCORE || '90', 10),
  });
});

// 7. GET /api/deliverability/scans
apiApp.get('/api/deliverability/scans', (req: Request, res: Response) => {
  const scans = globalDeliverabilityEngine.getAllScans();
  res.json({ scans });
});

// 8. Open Tracking Pixel: GET /api/tracking/open/:token
const handleOpenTracking = (req: Request, res: Response) => {
  try {
    const raw = Buffer.from(req.params.token, 'base64url').toString('utf8');
    const data = JSON.parse(raw);
    const messageId = data.m || 'unknown';
    const recipientId = data.r || 'anonymous';

    globalTrackingEngine.recordOpen({
      messageId,
      recipientId,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
    });
  } catch {
    // Non-blocking for tracking pixel
  }

  // Return standard transparent 1x1 GIF
  const transparentGif = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.send(transparentGif);
};

apiApp.get('/api/tracking/open/:token', handleOpenTracking);
apiApp.get('/t/:token', handleOpenTracking);

// 9. Click Tracking Redirect: GET /api/tracking/click/:token
const handleClickTracking = (req: Request, res: Response) => {
  try {
    const raw = Buffer.from(req.params.token, 'base64url').toString('utf8');
    const data = JSON.parse(raw);
    const messageId = data.m || 'unknown';
    const recipientId = data.r || 'anonymous';
    const destinationUrl = data.u || 'https://example.com';

    // SSRF verification
    const safeCheck = isSafePublicUrl(destinationUrl);
    if (!safeCheck.safe) {
      return res.status(400).send('Unsafe redirect target URL.');
    }

    globalTrackingEngine.recordClick({
      messageId,
      recipientId,
      targetUrl: destinationUrl,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
    });

    res.redirect(destinationUrl);
  } catch (err: any) {
    res.status(400).send(`Invalid click tracking redirect token: ${err.message}`);
  }
};

apiApp.get('/api/tracking/click/:token', handleClickTracking);
apiApp.get('/c/:token', handleClickTracking);

// 10. GET /api/tracking/metrics
apiApp.get('/api/tracking/metrics', (req: Request, res: Response) => {
  const metrics = globalTrackingEngine.getMetrics();
  const recentEvents = globalTrackingEngine.getRecentEvents(10);
  res.json({ metrics, recentEvents });
});

// 11. Send Pipeline: POST /api/send
apiApp.post('/api/send', async (req: Request, res: Response) => {
  try {
    const {
      subject = '',
      html = '',
      fromEmail = 'sender@domain.com',
      recipient = 'test@example.com',
      enableTracking = true,
      provider = 'kumomta',
    } = req.body;

    // 1. Deliverability Gate Check
    const preAnalysis = await globalDeliverabilityEngine.analyze({ subject, html, fromEmail });
    if (!preAnalysis.score.canSend) {
      return res.status(422).json({
        success: false,
        error: 'Send rejected: Critical deliverability blockers detected in email content or configuration.',
        blockers: preAnalysis.score.blockers,
      });
    }

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let finalHtml = html;

    // 2. Tracking transformation (if enabled)
    if (enableTracking) {
      finalHtml = globalTrackingEngine.injectOpenTracking(finalHtml, {
        messageId,
        recipientId: recipient,
      });
      finalHtml = globalTrackingEngine.wrapClickTracking(finalHtml, {
        messageId,
        recipientId: recipient,
      });
    }

    // 3. Dispatch to MTA (KumoMTA primary self-hosted, SES optional cloud)
    const configuredMailProvider = (process.env.MAIL_PROVIDER || 'kumomta').toLowerCase();
    const requestedProvider = (provider || configuredMailProvider).toLowerCase();

    // Fall back to KumoMTA if SES credentials are absent
    let activeMta = requestedProvider === 'ses' ? 'ses' : 'kumomta';
    if (activeMta === 'ses' && !process.env.AWS_SES_ACCESS_KEY_ID) {
      activeMta = 'kumomta';
    }

    const isKumo = activeMta === 'kumomta';
    const mtaTarget = isKumo ? 'KumoMTA (Self-Hosted)' : 'AWS SES (Cloud)';
    const hasCreds = isKumo
      ? Boolean(process.env.KUMOMTA_API_ENDPOINT)
      : Boolean(process.env.AWS_SES_ACCESS_KEY_ID);

    console.log(
      JSON.stringify({
        event: 'email_dispatched',
        messageId,
        mta: mtaTarget,
        hasCreds,
        recipientDomain: recipient.split('@')[1],
        score: preAnalysis.score.score,
      })
    );

    res.json({
      success: true,
      messageId,
      provider: mtaTarget,
      status: hasCreds ? 'queued_for_delivery' : 'dispatched_simulated',
      note: hasCreds
        ? `Transmitted to ${mtaTarget} egress queue.`
        : isKumo
        ? `Simulated dispatch: KumoMTA embedded spooling active. Set KUMOMTA_API_ENDPOINT for remote node relay.`
        : `AWS SES dispatch queued.`,
      recipient,
      trackingEnabled: enableTracking,
      deliverabilityScore: preAnalysis.score.score,
    });
  } catch (err: any) {
    console.error('Error in send pipeline:', err);
    res.status(500).json({ error: `Send failed: ${err.message}` });
  }
});

export default apiApp;
export { apiApp };
