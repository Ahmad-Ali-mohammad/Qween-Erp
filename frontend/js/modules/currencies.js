import { request, withToast } from '../core/api.js';
import { setTitle, table, formatDate, setPageActions, confirmAction, formatMoney } from '../core/ui.js';

function toIsoDateTime(value) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export async function renderCurrencies(mode = 'currencies') {
  if (mode === 'exchange-rates') return renderExchangeRates();
  if (mode === 'diff') return renderCurrencyDiff();
  return renderCurrencyList();
}

async function renderCurrencyList() {
  setTitle('العملات');
  const view = document.getElementById('view');

  const load = async () => {
    const rows = (await request('/currencies')).data || [];
    view.innerHTML = `
      <div class="card">
        <h3>إضافة عملة</h3>
        <form id="currency-form" class="grid-3">
          <div><label>الكود</label><input id="cur-code" required /></div>
          <div><label>الاسم</label><input id="cur-name" required /></div>
          <div><label>الرمز</label><input id="cur-symbol" /></div>
          <div><label><input id="cur-base" type="checkbox" /> عملة أساسية</label></div>
          <div><label><input id="cur-active" type="checkbox" checked /> نشطة</label></div>
          <div class="actions"><button class="btn btn-primary" type="submit">حفظ</button></div>
        </form>
      </div>

      <div class="card">
        ${table(
          ['الكود', 'الاسم', 'الرمز', 'أساسية', 'نشطة', 'إجراءات'],
          rows.map((r) => [
            r.code,
            r.nameAr,
            r.symbol || '-',
            r.isBase ? 'نعم' : 'لا',
            r.isActive ? 'نعم' : 'لا',
            `<button class="btn btn-danger btn-sm" data-delete="${r.code}">حذف</button>`
          ])
        )}
      </div>
    `;

    document.getElementById('currency-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        code: document.getElementById('cur-code').value.trim().toUpperCase(),
        nameAr: document.getElementById('cur-name').value.trim(),
        symbol: document.getElementById('cur-symbol').value.trim() || undefined,
        isBase: document.getElementById('cur-base').checked,
        isActive: document.getElementById('cur-active').checked
      };
      await withToast(() => request('/currencies', { method: 'POST', body: JSON.stringify(payload) }), 'تم حفظ العملة');
      await load();
    });

    view.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const code = String(btn.getAttribute('data-delete') || '').toUpperCase();
        if (!code) return;
        const confirmed = await confirmAction('تأكيد حذف العملة؟');
        if (!confirmed) return;
        await withToast(() => request(`/currencies/${encodeURIComponent(code)}`, { method: 'DELETE' }), 'تم حذف العملة');
        await load();
      });
    });

    setPageActions({ onSave: () => document.getElementById('currency-form')?.requestSubmit(), onRefresh: () => load() });
  };

  await load();
}

async function renderExchangeRates() {
  setTitle('أسعار الصرف');
  const view = document.getElementById('view');

  const load = async () => {
    const [ratesRes, currenciesRes] = await Promise.all([request('/exchange-rates'), request('/currencies')]);
    const rows = ratesRes.data || [];
    const currencies = currenciesRes.data || [];

    view.innerHTML = `
      <div class="card">
        <h3>إضافة سعر صرف</h3>
        <form id="rate-form" class="grid-3">
          <div>
            <label>العملة</label>
            <select id="rate-code" required>
              <option value="">اختر</option>
              ${currencies.map((c) => `<option value="${c.code}">${c.code} - ${c.nameAr}</option>`).join('')}
            </select>
          </div>
          <div><label>التاريخ</label><input id="rate-date" type="date" value="${new Date().toISOString().slice(0, 10)}" required /></div>
          <div><label>السعر</label><input id="rate-value" type="number" step="0.000001" min="0" value="1" required /></div>
          <div><label>المصدر</label><input id="rate-source" value="manual" /></div>
          <div class="actions"><button class="btn btn-primary" type="submit">حفظ</button></div>
        </form>
      </div>

      <div class="card">
        ${table(
          ['العملة', 'التاريخ', 'السعر', 'المصدر', 'إجراءات'],
          rows.map((r) => [
            r.currencyCode,
            formatDate(r.rateDate),
            Number(r.rate || 0).toFixed(6),
            r.source || '-',
            `<button class="btn btn-danger btn-sm" data-delete="${r.id}">حذف</button>`
          ])
        )}
      </div>
    `;

    document.getElementById('rate-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        currencyCode: document.getElementById('rate-code').value,
        rateDate: toIsoDateTime(document.getElementById('rate-date').value),
        rate: Number(document.getElementById('rate-value').value || 0),
        source: document.getElementById('rate-source').value || undefined
      };
      await withToast(() => request('/exchange-rates', { method: 'POST', body: JSON.stringify(payload) }), 'تم حفظ سعر الصرف');
      await load();
    });

    view.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-delete'));
        const confirmed = await confirmAction('تأكيد حذف السعر؟');
        if (!confirmed) return;
        await withToast(() => request(`/exchange-rates/${id}`, { method: 'DELETE' }), 'تم حذف السعر');
        await load();
      });
    });

    setPageActions({ onSave: () => document.getElementById('rate-form')?.requestSubmit(), onRefresh: () => load() });
  };

  await load();
}

async function renderCurrencyDiff() {
  setTitle('فروق العملة');
  const view = document.getElementById('view');

  const load = async () => {
    const reportRes = await request('/currency-diff');
    const payload = reportRes.data || {};
    const rows = payload.rows || [];
    const summary = payload.summary || {};
    const settings = payload.settings || {};

    view.innerHTML = `
      <div class="card">
        <h3>إعدادات فرق العملة</h3>
        <form id="diff-form" class="grid-3">
          <div><label>العملة الأساسية</label><input id="diff-base" value="${settings.baseCurrency || 'SAR'}" /></div>
          <div><label>هامش السماح %</label><input id="diff-tolerance" type="number" min="0" step="0.01" value="${settings.tolerancePercent ?? 0}" /></div>
          <div><label><input id="diff-autopost" type="checkbox" ${settings.autoPost ? 'checked' : ''} /> ترحيل تلقائي</label></div>
          <div class="actions"><button class="btn btn-primary" type="submit">حفظ الإعدادات</button></div>
        </form>
      </div>

      <div class="kpi-grid">
        <div class="kpi"><div>عدد العملات</div><div class="val">${summary.currencies || 0}</div></div>
        <div class="kpi"><div>إجمالي الفرق المطلق</div><div class="val">${formatMoney(summary.totalAbsDiff || 0)}</div></div>
      </div>

      <div class="card">
        ${table(
          ['العملة', 'السعر الحالي', 'السعر السابق', 'الفرق', 'الفرق %', 'تاريخ السعر'],
          rows.map((r) => [
            r.currencyCode,
            Number(r.currentRate || 0).toFixed(6),
            Number(r.previousRate || 0).toFixed(6),
            Number(r.difference || 0).toFixed(6),
            `${Number(r.differencePercent || 0).toFixed(2)}%`,
            formatDate(r.rateDate)
          ])
        )}
      </div>
    `;

    document.getElementById('diff-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        baseCurrency: document.getElementById('diff-base').value.trim() || 'SAR',
        tolerancePercent: Number(document.getElementById('diff-tolerance').value || 0),
        autoPost: document.getElementById('diff-autopost').checked
      };
      await withToast(() => request('/currency-diff', { method: 'PUT', body: JSON.stringify(payload) }), 'تم حفظ إعدادات فرق العملة');
      await load();
    });

    setPageActions({ onSave: () => document.getElementById('diff-form')?.requestSubmit(), onRefresh: () => load() });
  };

  await load();
}
