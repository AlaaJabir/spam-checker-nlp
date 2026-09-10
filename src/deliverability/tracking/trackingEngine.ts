import * as cheerio from 'cheerio';

export interface TrackingEvent {
  id: string;
  type: 'open' | 'click';
  recipientId: string;
  messageId: string;
  campaignId?: string;
  targetUrl?: string;
  userAgent?: string;
  ipAddress?: string;
  timestamp: string;
}

export interface TrackingMetrics {
  totalOpens: number;
  uniqueOpens: number;
  totalClicks: number;
  uniqueClicks: number;
  openRate: number; // percentage
  clickToOpenRate: number; // percentage
}

export class TrackingEngine {
  // In-memory deduplicated stores (keyed for O(1) deduplication)
  private events: TrackingEvent[] = [];
  private uniqueOpensSet = new Set<string>(); // key: `${recipientId}:${messageId}`
  private uniqueClicksSet = new Set<string>(); // key: `${recipientId}:${messageId}:${targetUrl}`

  /**
   * Injects the standard 1x1 transparent open tracking pixel into the email HTML.
   * Ensures deduplicated recording endpoint is referenced.
   */
  injectOpenTracking(html: string, context: { messageId: string; recipientId: string; appUrl?: string }): string {
    const appUrl = (context.appUrl || process.env.APP_URL || '').replace(/\/$/, '');
    const token = Buffer.from(JSON.stringify({ m: context.messageId, r: context.recipientId })).toString('base64url');
    const pixelUrl = `${appUrl}/api/tracking/open/${token}`;

    const pixelHtml = `<img src="${pixelUrl}" width="1" height="1" border="0" alt="" style="display:block;width:1px;min-width:1px;height:1px;min-height:1px;margin:0;padding:0;border:0;" />`;

    const $ = cheerio.load(html, { xml: false });
    if ($('body').length > 0) {
      $('body').append(pixelHtml);
    } else {
      $.root().append(pixelHtml);
    }
    return $.html();
  }

  /**
   * Transforms external <a> links into tracked click links while preserving original query params.
   * Skips unsubscribe and anchors.
   */
  wrapClickTracking(html: string, context: { messageId: string; recipientId: string; appUrl?: string }): string {
    const appUrl = (context.appUrl || process.env.APP_URL || '').replace(/\/$/, '');
    const $ = cheerio.load(html, { xml: false });

    $('a').each((_, a) => {
      const originalHref = ($(a).attr('href') || '').trim();

      // Skip anchors, mailto, tel, unsubscribe placeholders
      if (
        !originalHref ||
        originalHref.startsWith('#') ||
        originalHref.startsWith('mailto:') ||
        originalHref.startsWith('tel:') ||
        originalHref.includes('{{') ||
        originalHref.includes('unsubscribe')
      ) {
        return;
      }

      // Encode destination
      const token = Buffer.from(
        JSON.stringify({
          m: context.messageId,
          r: context.recipientId,
          u: originalHref,
        })
      ).toString('base64url');

      const trackingHref = `${appUrl}/api/tracking/click/${token}`;
      $(a).attr('href', trackingHref);
    });

    return $.html();
  }

  /**
   * Records an open event with strict uniqueness deduplication.
   */
  recordOpen(params: {
    messageId: string;
    recipientId: string;
    campaignId?: string;
    userAgent?: string;
    ipAddress?: string;
  }): { isUnique: boolean; event: TrackingEvent } {
    const timestamp = new Date().toISOString();
    const uniqueKey = `${params.recipientId}:${params.messageId}`;
    const isUnique = !this.uniqueOpensSet.has(uniqueKey);

    if (isUnique) {
      this.uniqueOpensSet.add(uniqueKey);
    }

    const event: TrackingEvent = {
      id: `evt-op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'open',
      recipientId: params.recipientId,
      messageId: params.messageId,
      campaignId: params.campaignId,
      userAgent: params.userAgent,
      ipAddress: params.ipAddress,
      timestamp,
    };

    this.events.push(event);
    return { isUnique, event };
  }

  /**
   * Records a click event with strict recipient + link deduplication.
   */
  recordClick(params: {
    messageId: string;
    recipientId: string;
    targetUrl: string;
    campaignId?: string;
    userAgent?: string;
    ipAddress?: string;
  }): { isUnique: boolean; event: TrackingEvent } {
    const timestamp = new Date().toISOString();
    const uniqueKey = `${params.recipientId}:${params.messageId}:${params.targetUrl}`;
    const isUnique = !this.uniqueClicksSet.has(uniqueKey);

    if (isUnique) {
      this.uniqueClicksSet.add(uniqueKey);
    }

    const event: TrackingEvent = {
      id: `evt-cl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'click',
      recipientId: params.recipientId,
      messageId: params.messageId,
      targetUrl: params.targetUrl,
      campaignId: params.campaignId,
      userAgent: params.userAgent,
      ipAddress: params.ipAddress,
      timestamp,
    };

    this.events.push(event);
    return { isUnique, event };
  }

  getMetrics(filter?: { campaignId?: string; messageId?: string }): TrackingMetrics {
    let filtered = this.events;
    if (filter?.campaignId) {
      filtered = filtered.filter((e) => e.campaignId === filter.campaignId);
    }
    if (filter?.messageId) {
      filtered = filtered.filter((e) => e.messageId === filter.messageId);
    }

    const openEvents = filtered.filter((e) => e.type === 'open');
    const clickEvents = filtered.filter((e) => e.type === 'click');

    const uniqueOpens = new Set(openEvents.map((e) => `${e.recipientId}:${e.messageId}`)).size;
    const uniqueClicks = new Set(clickEvents.map((e) => `${e.recipientId}:${e.messageId}:${e.targetUrl}`)).size;

    const totalOpens = openEvents.length;
    const totalClicks = clickEvents.length;

    const openRate = totalOpens > 0 ? Math.round((uniqueOpens / Math.max(1, uniqueOpens)) * 100) : 0;
    const clickToOpenRate = uniqueOpens > 0 ? Math.round((uniqueClicks / uniqueOpens) * 100) : 0;

    return {
      totalOpens,
      uniqueOpens,
      totalClicks,
      uniqueClicks,
      openRate,
      clickToOpenRate,
    };
  }

  getRecentEvents(limit: number = 20): TrackingEvent[] {
    return this.events.slice(-limit).reverse();
  }
}

export const globalTrackingEngine = new TrackingEngine();
