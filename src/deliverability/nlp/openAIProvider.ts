import { LocalNLPProvider } from './localProvider';
import { ContentOptimization, NLPProvider, SubjectOptimization } from './types';
import { ContentAnalysis, SubjectAnalysis } from '../types';

/**
 * Optional legacy OpenAI adapter.
 * Uses native fetch to call OpenAI API if OPENAI_API_KEY is configured.
 * Automatically falls back to LocalNLPProvider if key is missing or request fails.
 */
export class OpenAINLPProvider implements NLPProvider {
  name = 'openai';
  private localFallback = new LocalNLPProvider();
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  getConfidence(): 'high' | 'medium' | 'fallback-rules' {
    return this.isAvailable() ? 'high' : 'fallback-rules';
  }

  getDisplayName(): string {
    return 'OpenAI GPT-4o-mini (Legacy Adapter)';
  }

  async analyzeSubject(input: { subject: string }): Promise<SubjectAnalysis> {
    const base = await this.localFallback.analyzeSubject(input);
    if (!this.isAvailable()) return base;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an email deliverability engineer. Output JSON with { "reasons": string[], "suggestions": string[] } analyzing the subject line for spam triggers. Do NOT claim guaranteed inbox placement.',
            },
            {
              role: 'user',
              content: `Analyze this subject: "${input.subject}"`,
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 300,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (parsed.reasons && Array.isArray(parsed.reasons)) {
            base.reasons = Array.from(new Set([...base.reasons, ...parsed.reasons]));
          }
          if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
            base.suggestions = Array.from(new Set([...base.suggestions, ...parsed.suggestions]));
          }
        }
      } else {
        console.warn(`OpenAI API returned status ${response.status}, falling back to local rules.`);
      }
    } catch (err: any) {
      console.warn('OpenAI analyzeSubject error, falling back:', err.message);
    }

    return base;
  }

  async analyzeContent(input: { html: string; text: string }): Promise<ContentAnalysis> {
    return this.localFallback.analyzeContent(input);
  }

  async optimizeSubject(input: {
    subject: string;
    originalAnalysis?: SubjectAnalysis;
  }): Promise<SubjectOptimization> {
    if (!this.isAvailable()) {
      return this.localFallback.optimizeSubject(input);
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
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
}`,
            },
            {
              role: 'user',
              content: `Subject: "${input.subject}"`,
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 500,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          return JSON.parse(content);
        }
      }
    } catch (err: any) {
      console.warn('OpenAI optimizeSubject error, falling back:', err.message);
    }

    return this.localFallback.optimizeSubject(input);
  }

  async optimizeContent(input: {
    text: string;
    html: string;
    originalAnalysis?: ContentAnalysis;
  }): Promise<ContentOptimization> {
    return this.localFallback.optimizeContent(input);
  }
}
