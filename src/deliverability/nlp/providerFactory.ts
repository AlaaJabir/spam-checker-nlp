import { GeminiNLPProvider } from './geminiProvider';
import { LocalNLPProvider } from './localProvider';
import { OpenAINLPProvider } from './openAIProvider';
import { NLPProvider } from './types';

export function getNLPProvider(): NLPProvider {
  const providerType = (process.env.NLP_PROVIDER || 'gemini').toLowerCase().trim();

  if (providerType === 'local') {
    return new LocalNLPProvider();
  }

  if (providerType === 'openai') {
    const openAI = new OpenAINLPProvider();
    if (openAI.isAvailable()) {
      return openAI;
    }
    // Fallback if key missing
    console.warn('OPENAI_API_KEY missing, falling back to LocalNLPProvider');
    return new LocalNLPProvider();
  }

  // Default: Gemini (recommended free tier / standard quotas)
  const gemini = new GeminiNLPProvider();
  if (gemini.isAvailable()) {
    return gemini;
  }

  // If Gemini key is not configured, fall back to Local deterministic engine
  return new LocalNLPProvider();
}
