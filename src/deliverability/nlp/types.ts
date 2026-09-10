import { ContentAnalysis, SubjectAlternative, SubjectAnalysis } from '../types';

export interface SubjectOptimization {
  improvedSubject: string;
  alternatives: SubjectAlternative[];
  rationale: string;
  changesMade: string[];
}

export interface ContentOptimization {
  improvedText: string;
  improvedHtml?: string;
  changesMade: string[];
  rationale: string;
}

export interface NLPProvider {
  name: string;
  isAvailable(): boolean;
  getConfidence(): 'high' | 'medium' | 'fallback-rules';
  getDisplayName(): string;
  analyzeSubject(input: { subject: string }): Promise<SubjectAnalysis>;
  analyzeContent(input: { html: string; text: string }): Promise<ContentAnalysis>;
  optimizeSubject(input: { subject: string; originalAnalysis?: SubjectAnalysis }): Promise<SubjectOptimization>;
  optimizeContent(input: { text: string; html: string; originalAnalysis?: ContentAnalysis }): Promise<ContentOptimization>;
}
