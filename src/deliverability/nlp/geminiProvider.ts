import { GoogleGenAI } from '@google/genai';
import { LocalNLPProvider } from './localProvider';
import { ContentOptimization, NLPProvider, SubjectOptimization } from './types';
import { ContentAnalysis, SubjectAnalysis } from '../types';

export class GeminiNLPProvider implements NLPProvider {
  name = 'gemini';
  private localFallback = new LocalNLPProvider();
  private client: GoogleGenAI | null = null;
  private lastUsedFallback = false;

  private getClient(): GoogleGenAI | null {
    if (!this.client && process.env.GEMINI_API_KEY) {
      try {
        this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      } catch (err) {
        console.error('Failed to initialize GoogleGenAI client:', err);
      }
    }
    return this.client;
  }

  isAvailable(): boolean {
    return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  }

  getConfidence(): 'high' | 'medium' | 'fallback-rules' {
    if (!this.isAvailable() || this.lastUsedFallback) {
      return 'fallback-rules';
    }
    return 'high';
  }

  getDisplayName(): string {
    if (!this.isAvailable()) {
      return 'Local Rules (Gemini API Key Not Set)';
    }
    return this.lastUsedFallback
      ? 'Local Rules Fallback (Deterministic Engine)'
      : 'Gemini AI Deliverability Engine';
  }

  private getModelName(): string {
    return process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  }

  private async callWithTimeout<T>(promise: Promise<T>, timeoutMs = 15000): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`AI call timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  async analyzeSubject(input: { subject: string }): Promise<SubjectAnalysis> {
    // Start with deterministic base analysis
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
            responseMimeType: 'application/json',
          },
        })
      );

      const text = response.text?.trim();
      if (text) {
        const parsed = JSON.parse(text);
        if (parsed.suggestedAlternatives && Array.isArray(parsed.suggestedAlternatives)) {
          base.suggestedAlternatives = parsed.suggestedAlternatives;
        }
        if (parsed.reasons && Array.isArray(parsed.reasons)) {
          base.reasons = Array.from(new Set([...base.reasons, ...parsed.reasons]));
        }
        if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
          base.suggestions = Array.from(new Set([...base.suggestions, ...parsed.suggestions]));
        }
        this.lastUsedFallback = false;
      }
    } catch (err: any) {
      this.lastUsedFallback = true;
      console.warn('Gemini analyzeSubject fallback to local rules:', err.message);
    }

    return base;
  }

  async analyzeContent(input: { html: string; text: string }): Promise<ContentAnalysis> {
    // Feature extraction is deterministic and robust via local analyzer
    return this.localFallback.analyzeContent(input);
  }

  async optimizeSubject(input: { subject: string; originalAnalysis?: SubjectAnalysis }): Promise<SubjectOptimization> {
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
            responseMimeType: 'application/json',
          },
        })
      );

      const text = response.text?.trim();
      if (text) {
        this.lastUsedFallback = false;
        return JSON.parse(text);
      }
    } catch (err: any) {
      this.lastUsedFallback = true;
      console.warn('Gemini optimizeSubject error, falling back:', err.message);
    }

    return this.localFallback.optimizeSubject(input);
  }

  async optimizeContent(input: {
    text: string;
    html: string;
    originalAnalysis?: ContentAnalysis;
  }): Promise<ContentOptimization> {
    // Content optimization relies on deterministic safe transformations
    return this.localFallback.optimizeContent(input);
  }
}
