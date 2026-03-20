import OpenAI from 'openai';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { AuthUser } from '../../types/auth';

export interface AssistantHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantQueryInput {
  query: string;
  history?: AssistantHistoryMessage[];
  user?: AuthUser;
}

interface AssistantSnapshot {
  draftJournals: number;
  pendingInvoices: number;
  pendingPayments: number;
  lowStockItems: number;
  openProjectTasks: number;
  recentSalesInvoices: Array<{
    number: string;
    total: number;
    status: string;
  }>;
}

interface AssistantResult {
  answer: string;
  suggestions: string[];
  provider: 'openai' | 'local-fallback';
  model: string | null;
  enabled: boolean;
}

let cachedClient: OpenAI | null = null;

function getOpenAiClient(): OpenAI | null {
  if (!env.openAiApiKey) return null;
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: env.openAiApiKey });
  }
  return cachedClient;
}

export function sanitizeAssistantHistory(history: AssistantHistoryMessage[] = []): AssistantHistoryMessage[] {
  return history
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
    .map((item) => ({
      role: item.role,
      content: String(item.content ?? '').trim().slice(0, 1200)
    }))
    .filter((item) => item.content)
    .slice(-6);
}

export function buildAssistantSuggestionsFromSnapshot(
  snapshot: Pick<AssistantSnapshot, 'draftJournals' | 'pendingInvoices' | 'lowStockItems'>
): string[] {
  const suggestions = [
    snapshot.pendingInvoices > 0
      ? 'ما الفواتير المعلقة أو غير المسددة حالياً؟'
      : 'كيف أصدر فاتورة مبيعات جديدة من النظام؟',
    snapshot.draftJournals > 0
      ? 'ما القيود المسودة التي تحتاج مراجعة الآن؟'
      : 'كيف أنشئ قيداً يومياً سريعاً؟',
    snapshot.lowStockItems > 0
      ? 'هل توجد أصناف منخفضة المخزون وتحتاج إعادة طلب؟'
      : 'كيف أراجع مستوى المخزون الحالي؟',
    'ما أفضل تقرير أفتحه الآن لمراجعة أداء الشركة؟'
  ];

  return suggestions.slice(0, 4);
}

function buildSnapshotSummary(snapshot: AssistantSnapshot, user?: AuthUser): string {
  const recentInvoicesText = snapshot.recentSalesInvoices.length
    ? snapshot.recentSalesInvoices
        .map((invoice) => `${invoice.number} بقيمة ${invoice.total.toFixed(2)} وحالة ${invoice.status}`)
        .join(' | ')
    : 'لا توجد فواتير مبيعات حديثة.';

  return [
    `المستخدم الحالي: ${user?.username ?? 'unknown'}`,
    `قيود مسودة: ${snapshot.draftJournals}`,
    `فواتير معلقة: ${snapshot.pendingInvoices}`,
    `مدفوعات معلقة: ${snapshot.pendingPayments}`,
    `أصناف منخفضة المخزون: ${snapshot.lowStockItems}`,
    `مهام مشاريع مفتوحة: ${snapshot.openProjectTasks}`,
    `آخر فواتير مبيعات: ${recentInvoicesText}`
  ].join('\n');
}

function buildFallbackAnswer(query: string, snapshot: AssistantSnapshot): string {
  return [
    `تم تجهيز واجهة المساعد داخل النظام، لكن الربط الخارجي لم يكتمل بعد لأن متغير البيئة OPENAI_API_KEY غير مضبوط أو تعذر الوصول إلى الخدمة.`,
    `سؤالك كان: "${query}".`,
    `ملخص سريع من النظام الآن:`,
    `- قيود مسودة: ${snapshot.draftJournals}`,
    `- فواتير معلقة: ${snapshot.pendingInvoices}`,
    `- مدفوعات معلقة: ${snapshot.pendingPayments}`,
    `- أصناف منخفضة المخزون: ${snapshot.lowStockItems}`,
    `بعد ضبط المفتاح سيستطيع المساعد الإجابة تحليلياً داخل النظام نفسه وباللغة العربية.`
  ].join('\n');
}

async function buildAssistantSnapshot(): Promise<AssistantSnapshot> {
  const [draftJournals, pendingInvoices, pendingPayments, items, openProjectTasks, recentSalesInvoices] = await Promise.all([
    prisma.journalEntry.count({ where: { status: 'DRAFT' } }),
    prisma.invoice.count({ where: { status: { in: ['DRAFT', 'ISSUED', 'PARTIAL'] } } }),
    prisma.payment.count({ where: { status: 'PENDING' } }),
    prisma.item.findMany({ where: { isActive: true }, select: { onHandQty: true, reorderPoint: true } }),
    prisma.projectTask.count({ where: { status: { in: ['TODO', 'IN_PROGRESS'] } } }),
    prisma.invoice.findMany({
      where: { type: 'SALES' },
      select: { number: true, total: true, status: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 3
    })
  ]);

  const lowStockItems = items.filter((item) => Number(item.onHandQty) <= Number(item.reorderPoint)).length;

  return {
    draftJournals,
    pendingInvoices,
    pendingPayments,
    lowStockItems,
    openProjectTasks,
    recentSalesInvoices: recentSalesInvoices.map((invoice) => ({
      number: invoice.number,
      total: Number(invoice.total),
      status: invoice.status
    }))
  };
}

function extractAssistantText(response: any): string {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of response?.output ?? []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        chunks.push(content.text.trim());
      }
    }
  }

  return chunks.filter(Boolean).join('\n\n').trim();
}

export async function queryAssistant(input: AssistantQueryInput): Promise<AssistantResult> {
  const query = String(input.query ?? '').trim();
  const history = sanitizeAssistantHistory(input.history);
  const snapshot = await buildAssistantSnapshot();
  const suggestions = buildAssistantSuggestionsFromSnapshot(snapshot);
  const client = getOpenAiClient();

  if (!query) {
    return {
      answer: 'اكتب سؤالك أولاً حتى أستطيع مساعدتك داخل النظام.',
      suggestions,
      provider: client ? 'openai' : 'local-fallback',
      model: client ? env.openAiModel : null,
      enabled: Boolean(client)
    };
  }

  if (!client) {
    return {
      answer: buildFallbackAnswer(query, snapshot),
      suggestions,
      provider: 'local-fallback',
      model: null,
      enabled: false
    };
  }

  const instructions = [
    'أنت مساعد عربي داخل نظام ERP Qween.',
    'أجب بالعربية الواضحة وبأسلوب عملي مختصر.',
    'لا تدّع تنفيذ أي إجراء داخل النظام ما لم يذكر السياق أنه تم فعلاً.',
    'إذا طلب المستخدم إجراء عملية، اشرح له الشاشة أو الخطوات المناسبة داخل النظام.',
    'اعتمد على لقطة النظام المرفقة فقط في الأرقام الحالية، ولا تختلق أرقاماً إضافية.',
    'إذا لم يكن السؤال متعلقاً ببيانات اللقطة الحالية، قدم إرشاداً تشغيلياً عاماً مناسباً للنظام.'
  ].join('\n');

  const modelInput = [
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: `هذه لقطة نظام حديثة:\n${buildSnapshotSummary(snapshot, input.user)}`
        }
      ]
    },
    ...history.map((message) => ({
      role: message.role,
      content: [{ type: 'input_text', text: message.content }]
    })),
    {
      role: 'user',
      content: [{ type: 'input_text', text: query }]
    }
  ] as any;

  try {
    const response = await client.responses.create({
      model: env.openAiModel,
      instructions,
      input: modelInput,
      max_output_tokens: env.assistantMaxOutputTokens,
      store: false,
      text: {
        format: {
          type: 'text'
        }
      }
    });

    const answer = extractAssistantText(response) || 'لم أتمكن من توليد رد واضح، حاول إعادة صياغة السؤال.';

    return {
      answer,
      suggestions,
      provider: 'openai',
      model: env.openAiModel,
      enabled: true
    };
  } catch {
    return {
      answer: buildFallbackAnswer(query, snapshot),
      suggestions,
      provider: 'local-fallback',
      model: env.openAiModel,
      enabled: false
    };
  }
}

export async function getAssistantSuggestions(user?: AuthUser): Promise<string[]> {
  const snapshot = await buildAssistantSnapshot();
  const suggestions = buildAssistantSuggestionsFromSnapshot(snapshot);

  if (!env.openAiApiKey) {
    return [...suggestions, `المساعد متاح بصيغة تجريبية للمستخدم ${user?.username ?? 'الحالي'} حتى يتم ضبط المفتاح.`].slice(0, 4);
  }

  return suggestions;
}
