import { request, withToast } from '../core/api.js';
import { setTitle, setPageActions, table, formatDate } from '../core/ui.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function currentTicketNumber() {
  return `SUP-${Date.now().toString().slice(-8)}`;
}

export async function renderHelp(mode = 'center') {
  if (mode === 'knowledge') return renderKnowledgeBase();
  if (mode === 'assistant') return renderAssistant();
  if (mode === 'support') return renderSupport(false);
  if (mode === 'tickets') return renderSupport(true);
  if (mode === 'onboarding') return renderOnboarding();
  return renderHelpCenter();
}

async function renderHelpCenter() {
  setTitle('مركز المساعدة');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل مركز المساعدة...</div>';

  const load = async () => {
    const articles = asArray((await request('/help-center/articles')).data);

    view.innerHTML = `
      <div class="card">
        <h3>مقالات المساعدة</h3>
        ${table(
          ['المعرف', 'العنوان', 'التصنيف', 'المحتوى'],
          articles.map((a) => [a.id, a.title || '-', a.category || '-', a.content || '-'])
        )}
      </div>

      <div class="card">
        <h3>اختصارات لوحة المفاتيح</h3>
        <ul>
          <li><span class="mono">Ctrl+N</span>: إضافة جديد</li>
          <li><span class="mono">Ctrl+S</span>: حفظ</li>
          <li><span class="mono">Ctrl+F</span>: بحث</li>
          <li><span class="mono">F5</span>: تحديث البيانات</li>
        </ul>
      </div>
    `;

    setPageActions({ onRefresh: () => load() });
  };

  await load();
}

async function renderKnowledgeBase() {
  setTitle('قاعدة المعرفة');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل قاعدة المعرفة...</div>';
  const state = { q: '' };

  const load = async () => {
    const endpoint = state.q ? `/knowledge-base/search?q=${encodeURIComponent(state.q)}` : '/knowledge-base';
    const rows = asArray((await request(endpoint)).data);

    view.innerHTML = `
      <div class="card">
        <h3>البحث في قاعدة المعرفة</h3>
        <form id="kb-search-form" class="search-row">
          <input id="kb-q" value="${state.q}" placeholder="اكتب كلمة البحث..." />
          <button class="btn btn-primary" type="submit">بحث</button>
          <button class="btn btn-secondary" type="button" id="kb-clear">مسح</button>
        </form>
      </div>

      <div class="card">
        <h3>نتائج قاعدة المعرفة</h3>
        ${table(
          ['المعرف', 'العنوان', 'التصنيف', 'المحتوى'],
          rows.map((a) => [a.id, a.title || '-', a.category || '-', a.content || '-'])
        )}
      </div>
    `;

    document.getElementById('kb-search-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      state.q = document.getElementById('kb-q').value.trim();
      await load();
    });

    document.getElementById('kb-clear')?.addEventListener('click', async () => {
      state.q = '';
      await load();
    });

    setPageActions({
      onSearch: () => document.getElementById('kb-q')?.focus(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderAssistant() {
  setTitle('المساعد الذكي');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل المساعد الذكي...</div>';

  const state = {
    history: [],
    suggestions: [],
    pending: false
  };

  const load = async () => {
    state.suggestions = asArray((await request('/assistant/suggest')).data);

    view.innerHTML = `
      <div class="card">
        <h3>اقتراحات سريعة</h3>
        <div id="assistant-suggestions" class="actions" style="flex-wrap:wrap;gap:8px;"></div>
      </div>

      <div class="card">
        <h3>اسأل المساعد</h3>
        <form id="assistant-form" class="grid-2">
          <div style="grid-column:1 / -1;"><label>السؤال</label><input id="assistant-query" required placeholder="اكتب سؤالك..." /></div>
          <div class="actions"><button id="assistant-submit" class="btn btn-primary" type="submit">إرسال</button></div>
        </form>
        <div id="assistant-answer" style="margin-top:12px;"></div>
      </div>
    `;

    const suggestionsEl = document.getElementById('assistant-suggestions');
    const answerEl = document.getElementById('assistant-answer');
    const inputEl = document.getElementById('assistant-query');
    const submitEl = document.getElementById('assistant-submit');

    const renderSuggestions = () => {
      suggestionsEl.innerHTML = state.suggestions.length
        ? state.suggestions
            .map(
              (suggestion, index) => `
                <button type="button" class="btn btn-secondary btn-sm" data-assistant-index="${index}">
                  ${escapeHtml(suggestion)}
                </button>
              `
            )
            .join('')
        : '<span class="muted">لا توجد اقتراحات حالياً.</span>';

      suggestionsEl.querySelectorAll('[data-assistant-index]').forEach((button) => {
        button.addEventListener('click', () => {
          const suggestion = state.suggestions[Number(button.getAttribute('data-assistant-index') || -1)] || '';
          inputEl.value = suggestion;
          inputEl.focus();
        });
      });
    };

    const renderConversation = () => {
      if (!state.history.length) {
        answerEl.innerHTML = '<div class="muted">ابدأ بسؤال عن الفواتير، القيود، التقارير، أو المخزون.</div>';
        return;
      }

      answerEl.innerHTML = state.history
        .map(
          (message) => `
            <div class="card" style="margin-top:10px;border-inline-start:4px solid ${message.role === 'user' ? '#0f6d5d' : '#c89b3c'};">
              <strong>${message.role === 'user' ? 'أنت' : 'المساعد'}</strong>
              <div style="margin-top:8px;white-space:pre-wrap;line-height:1.8;">${escapeHtml(message.content)}</div>
              ${
                message.meta
                  ? `<div class="muted" style="margin-top:8px;">المزوّد: ${escapeHtml(message.meta.provider || '-')} | النموذج: ${escapeHtml(message.meta.model || '-')}</div>`
                  : ''
              }
            </div>
          `
        )
        .join('');
    };

    const setPending = (value) => {
      state.pending = value;
      submitEl.disabled = value;
      submitEl.textContent = value ? 'جاري التحليل...' : 'إرسال';
    };

    renderSuggestions();
    renderConversation();

    document.getElementById('assistant-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const query = inputEl.value.trim();
      if (!query || state.pending) return;

      const historyForRequest = state.history.map((message) => ({ role: message.role, content: message.content })).slice(-6);
      state.history.push({ role: 'user', content: query });
      inputEl.value = '';
      renderConversation();
      setPending(true);

      try {
        const response = (await request('/assistant/query', {
          method: 'POST',
          body: JSON.stringify({ query, history: historyForRequest })
        })).data || {};

        state.history.push({
          role: 'assistant',
          content: response.answer || 'لا يوجد رد.',
          meta: { provider: response.provider, model: response.model, enabled: response.enabled }
        });
        state.suggestions = asArray(response.suggestions);
        renderSuggestions();
        renderConversation();
      } finally {
        setPending(false);
      }
    });

    setPageActions({
      onSearch: () => inputEl?.focus(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderSupport(isTicketsPage) {
  setTitle(isTicketsPage ? 'تذاكر الدعم' : 'الدعم الفني');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل تذاكر الدعم...</div>';

  const load = async () => {
    const rows = asArray((await request('/support-tickets')).data);

    view.innerHTML = `
      <div class="card">
        <h3>إنشاء تذكرة دعم</h3>
        <form id="ticket-form" class="grid-2">
          <div><label>رقم التذكرة</label><input id="ticket-number" value="${currentTicketNumber()}" required /></div>
          <div><label>الأولوية</label>
            <select id="ticket-priority">
              <option value="LOW">منخفضة</option>
              <option value="MEDIUM" selected>متوسطة</option>
              <option value="HIGH">مرتفعة</option>
              <option value="URGENT">عاجلة</option>
            </select>
          </div>
          <div style="grid-column:1 / -1;"><label>الموضوع</label><input id="ticket-subject" required /></div>
          <div style="grid-column:1 / -1;"><label>الوصف</label><textarea id="ticket-desc" rows="3"></textarea></div>
          <div class="actions"><button class="btn btn-primary" type="submit">إرسال التذكرة</button></div>
        </form>
      </div>

      <div class="card">
        <h3>قائمة التذاكر</h3>
        ${table(
          ['رقم التذكرة', 'الموضوع', 'الأولوية', 'الحالة', 'تاريخ الإنشاء'],
          rows.map((t) => [t.number || '-', t.subject || '-', t.priority || '-', t.status || '-', formatDate(t.createdAt)])
        )}
      </div>
    `;

    document.getElementById('ticket-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        number: document.getElementById('ticket-number').value.trim(),
        subject: document.getElementById('ticket-subject').value.trim(),
        description: document.getElementById('ticket-desc').value.trim() || undefined,
        priority: document.getElementById('ticket-priority').value,
        status: 'OPEN'
      };
      await withToast(() => request('/support-tickets', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء تذكرة الدعم');
      await load();
    });

    setPageActions({
      onSave: () => document.getElementById('ticket-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderOnboarding() {
  setTitle('معالج الإعداد الأولي');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل خطوات الإعداد...</div>';

  const load = async () => {
    const data = (await request('/setup-wizard/steps')).data || {};
    const steps = asArray(data.steps);
    const completed = new Set(asArray(data.completed));

    view.innerHTML = `
      <div class="card">
        <h3>خطوات الإعداد</h3>
        <ul class="panel-list">
          ${steps
            .map(
              (step) => `
            <li>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
                <span>${step}</span>
                ${
                  completed.has(step)
                    ? '<span class="badge success">مكتمل</span>'
                    : `<button class="btn btn-sm btn-primary" data-step="${step}">إكمال</button>`
                }
              </div>
            </li>
          `
            )
            .join('')}
        </ul>
      </div>

      <div class="card">
        <h3>إنهاء المعالج</h3>
        <p class="muted">بعد إكمال جميع الخطوات، يمكنك إنهاء الإعداد وتثبيت الحالة كـ مكتمل.</p>
        <button id="wizard-complete" class="btn btn-success">إنهاء الإعداد</button>
      </div>
    `;

    view.querySelectorAll('[data-step]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const step = btn.getAttribute('data-step');
        await withToast(() => request(`/setup-wizard/step/${step}`, { method: 'POST' }), `تم إكمال خطوة ${step}`);
        await load();
      });
    });

    document.getElementById('wizard-complete')?.addEventListener('click', async () => {
      await withToast(() => request('/setup-wizard/complete', { method: 'POST' }), 'تم إنهاء معالج الإعداد');
      await load();
    });

    setPageActions({ onRefresh: () => load() });
  };

  await load();
}

