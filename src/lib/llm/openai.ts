import OpenAI from 'openai';
import { ExtractionFields, OperativeSummary, LLMProvider } from '@/types';
import { buildNormalizePrompt, buildSummaryPrompt } from './prompts';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey?: string, model = 'gpt-4o-mini') {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
    this.model = model;
  }

  async normalize(field: string, rawText: string, fieldType: string): Promise<string> {
    const prompt = buildNormalizePrompt(fieldType, rawText);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'Sei un analista di perizie immobiliari. Rispondi solo con JSON valido.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });

    return response.choices[0]?.message?.content || rawText;
  }

  async generateSummary(fields: ExtractionFields, fullText: string): Promise<OperativeSummary> {
    const fieldsJson = JSON.stringify(fields, null, 2);
    const prompt = buildSummaryPrompt(fieldsJson, fullText);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'Sei un consulente esperto di aste immobiliari italiane. Genera riassunti operativi chiari e concisi.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content || '';
    const paragraphs = content.split('---').map((p) => p.trim()).filter(Boolean);

    return {
      summaryAsset: paragraphs[0] || 'Riassunto non generato.',
      summaryRisks: paragraphs[1] || 'Riassunto non generato.',
      summaryActions: paragraphs[2] || 'Riassunto non generato.',
    };
  }
}
