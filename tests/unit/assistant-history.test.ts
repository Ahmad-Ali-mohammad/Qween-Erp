import { buildAssistantSuggestionsFromSnapshot, sanitizeAssistantHistory } from '../../src/modules/assistant/service';

describe('assistant helpers', () => {
  it('sanitizes assistant history and keeps only recent valid turns', () => {
    const result = sanitizeAssistantHistory([
      { role: 'user', content: 'مرحبا' },
      { role: 'assistant', content: 'أهلاً' },
      { role: 'user', content: '   ' },
      { role: 'assistant', content: 'تفاصيل'.repeat(500) }
    ]);

    expect(result).toHaveLength(3);
    expect(result[2].content.length).toBeLessThanOrEqual(1200);
  });

  it('builds contextual suggestions from a system snapshot', () => {
    const suggestions = buildAssistantSuggestionsFromSnapshot({
      draftJournals: 2,
      pendingInvoices: 4,
      lowStockItems: 1
    });

    expect(suggestions).toHaveLength(4);
    expect(suggestions[0]).toContain('الفواتير');
    expect(suggestions[1]).toContain('القيود');
  });
});
