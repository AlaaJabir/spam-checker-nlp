export interface SampleEmail {
  id: string;
  name: string;
  badge: string;
  badgeColor: string;
  subject: string;
  fromEmail: string;
  html: string;
}

export const SAMPLE_EMAILS: SampleEmail[] = [
  {
    id: 'high-risk',
    name: 'High Risk (Spammy & Broken HTML)',
    badge: 'High Risk Demo',
    badgeColor: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    fromEmail: 'deals@unverified-domain-xyz.com',
    subject: 'URGENT!!! BUY NOW AND CLAIM YOUR 100% FREE RISK FREE PROFIT $$$',
    html: `<!DOCTYPE html>
<html>
<head>
  <title>Special Offer</title>
</head>
<body>
  <!-- This is an unnecessary tracking comment that inflates size -->
  <div style="display:none;font-size:0;color:#fff;">secret hidden cloaked keyword text for spam engines</div>
  <div style="position:absolute;left:-9999px;">invisible cloaking text</div>
  <p>Hello valued subscriber\u200B\u200C!</p>
  <div style="padding: 20px; font-family: Arial;">
    <h1>ACT NOW! EXCLUSIVE LAST CHANCE OFFER!</h1>
    <p>Guaranteed 100% risk free returns. Double your money in 24 hours!</p>
    <img src="http://example.com/huge-unoptimized-banner.jpg" width="800">
    <p>
      Click here right now: <a href="http://insecure-http-tracker.com/click?id=999">Claim Your Prize Here</a>
    </p>
    <p>
      Verify your account: <a href="http://phishing-spoof.com/login">https://paypal.com/security-verification</a>
    </p>
  </div>
</body>
</html>`,
  },
  {
    id: 'marketing-needs-opt',
    name: 'Marketing Newsletter (Needs Hygiene)',
    badge: 'Moderate Issues',
    badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    fromEmail: 'updates@emailin-ops.dev',
    subject: 'Don’t miss out on our Q3 product roadmap release!',
    html: `<div style="background-color: #f8fafc; padding: 30px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 24px;">
    <img src="https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=600&auto=format&fit=crop" style="width: 100%; border-radius: 6px;">
    <h2 style="color: #0f172a; font-size: 20px; margin-top: 16px;">Accelerate Your Infrastructure with KumoMTA</h2>
    <p style="color: #475569; font-size: 14px; line-height: 1.6;">
      We're excited to announce our next-generation email deliverability tools. Check out our real-time throughput dashboards and ISP feedback loops.
    </p>
    <div style="margin-top: 20px;">
      <a href="https://example.com/roadmap" style="background: #2563eb; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
        View Roadmap
      </a>
    </div>
  </div>
</div>`,
  },
  {
    id: 'clean-transactional',
    name: 'Clean Transactional (High Deliverability)',
    badge: 'Optimal Quality',
    badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    fromEmail: 'security@emailin-ops.dev',
    subject: 'Security Alert: New sign-in detected on your account',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Alert</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f1f5f9; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 32px;">
          <tr>
            <td>
              <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">New Sign-In from Chrome on Linux</h2>
              <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 22px;">
                We detected a recent session login for your Emailin-OPS operator workspace on September 9, 2026.
              </p>
              <div style="background-color: #f8fafc; border-left: 3px solid #2563eb; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; color: #334155;">
                <strong>IP Address:</strong> 198.51.100.42<br>
                <strong>Approximate Location:</strong> Frankfurt, Germany
              </div>
              <p style="margin: 0 0 24px 0; color: #475569; font-size: 14px; line-height: 22px;">
                If this was you, no action is needed. If you did not authorize this session, please review your active sessions immediately.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="background-color: #0f172a; border-radius: 6px;">
                    <a href="https://example.com/account/security" style="display: inline-block; padding: 10px 20px; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600;">
                      Review Security Activity
                    </a>
                  </td>
                </tr>
              </table>
              <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
                <p style="margin: 0 0 4px 0;">Emailin-OPS Cloud Security Operations</p>
                <p style="margin: 0;">100 Innovation Parkway, Suite 400, San Francisco, CA 94105</p>
                <p style="margin: 8px 0 0 0;">
                  <a href="{{unsubscribe_url}}" style="color: #64748b; text-decoration: underline;">Unsubscribe</a> | 
                  <a href="https://example.com/privacy" style="color: #64748b; text-decoration: underline;">Privacy Policy</a>
                </p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
];
