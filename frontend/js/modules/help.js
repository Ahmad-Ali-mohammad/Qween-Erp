import { request, withToast } from '../core/api.js';
import { setTitle, setPageActions, table, formatDate } from '../core/ui.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
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

  const load = async () => {
    const suggestions = asArray((await request('/assistant/suggest')).data);

    view.innerHTML = `
      <div class="card">
        <h3>اقتراحات سريعة</h3>
        <ul>
          ${suggestions.map((s) => `<li>${s}</li>`).join('')}
        </ul>
      </div>

      <div class="card">
        <h3>اسأل المساعد</h3>
        <form id="assistant-form" class="grid-2">
          <div style="grid-column:1 / -1;"><label>السؤال</label><input id="assistant-query" required placeholder="اكتب سؤالك..." /></div>
          <div class="actions"><button class="btn btn-primary" type="submit">إرسال</button></div>
        </form>
        <div id="assistant-answer" class="muted" style="margin-top:12px;">لا يوجد رد بعد.</div>
      </div>
    `;

    document.getElementById('assistant-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const query = document.getElementById('assistant-query').value.trim();
      const response = (await request('/assistant/query', { method: 'POST', body: JSON.stringify({ query }) })).data || {};
      const answer = response.answer || 'لا يوجد رد.';
      const followup = asArray(response.suggestions);
      document.getElementById('assistant-answer').innerHTML = `
        <div><strong>الرد:</strong> ${answer}</div>
        ${followup.length ? `<div style="margin-top:8px;"><strong>اقتراحات:</strong><ul>${followup.map((x) => `<li>${x}</li>`).join('')}</ul></div>` : ''}
      `;
    });

    setPageActions({
      onSearch: () => document.getElementById('assistant-query')?.focus(),
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

