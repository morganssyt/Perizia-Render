import { ExtractionFields, OperativeSummary, LLMProvider } from '@/types';

/**
 * Abstract LLM provider interface.
 * Implementations: OpenAI, Anthropic, local models.
 */
export type { LLMProvider };

/**
 * No-op provider for when no API key is configured.
 * Returns raw text without normalization.
 */
export class PassthroughProvider implements LLMProvider {
  async normalize(_field: string, rawText: string): Promise<string> {
    return rawText;
  }

  async generateSummary(_fields: ExtractionFields, _fullText: string): Promise<OperativeSummary> {
    return {
      summaryAsset: 'Riassunto non disponibile: nessun provider LLM configurato.',
      summaryRisks: 'Configurare OPENAI_API_KEY nel file .env per generare i riassunti.',
      summaryActions: '',
    };
  }
}
