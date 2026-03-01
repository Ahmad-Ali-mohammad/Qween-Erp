import { request } from '../core/api.js';
import { setTitle, formatMoney, formatDate, statusBadge, setPageActions } from '../core/ui.js';

let dashboardTimer = null;
let hashListenerBound = false;

function stopAutoRefresh() {
  if (dashboardTimer) {
    clearInterval(dashboardTimer);
    dashboardTimer = null;
  }
}

function setAutoRefresh(render) {
  stopAutoRefresh();
  dashboardTimer = setInterval(() => {
    render().catch(() => {
      // silent background refresh
    });
  }, 5 * 60 * 1000);
}

export async function renderDashboard() {
  setTitle('لوحة التحكم');
  setPageActions({ onRefresh: () => renderDashboard() });
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل بيانات لوحة التحكم...</div>';

  const load = async () => {
    const [kpis, journals, invoices, periods] = await Promise.all([
      request('/reports/kpis'),
      request('/journals?page=1&limit=5'),
      request('/invoices?page=1&limit=5'),
      request('/periods')
    ]);

    const openPeriod = periods.data.find((p) => p.status === 'OPEN');
    const dueInvoices = invoices.data.filter((i) => Number(i.outstanding) > 0).slice(0, 5);

    view.innerHTML = `
      <div class="card">
        <div class="section-title">
          <h3>مرحباً ${kpis?.meta?.userName || ''}</h3>
          <span class="muted">تاريخ اليوم: ${formatDate(new Date())}</span>
        </div>
        <div class="kpi-grid">
          <div class="kpi" data-nav="#/banks"><div>رصيد البنوك</div><div class="val">${formatMoney(0)}</div></div>
          <div class="kpi" data-nav="#/sales-invoices"><div>فواتير مستحقة</div><div class="val">${kpis.data.pendingInvoices}</div></div>
          <div class="kpi" data-nav="#/journals"><div>قيود مسودة</div><div class="val">${kpis.data.draftEntries}</div></div>
          <div class="kpi" data-nav="#/assets"><div>أصول نشطة</div><div class="val">${kpis.data.activeAssets}</div></div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="section-title"><h3>آخر القيود</h3><a href="#/journals" class="muted">عرض الكل</a></div>
          <ul class="panel-list">
            ${journals.data.map((j) => `<li><strong>${j.entryNumber}</strong> - ${j.description || '-'}<br/><span class="muted">${formatDate(j.date)}</span> ${statusBadge(j.status)}</li>`).join('') || '<li>لا توجد قيود حديثة</li>'}
          </ul>
        </div>

        <div class="card">
          <div class="section-title"><h3>الفواتير المستحقة</h3><a href="#/sales-invoices" class="muted">عرض الكل</a></div>
          <ul class="panel-list">
            ${dueInvoices.map((inv) => `<li><strong>${inv.number}</strong> - ${formatMoney(inv.outstanding)}<br/><span class="muted">${formatDate(inv.date)}</span> ${statusBadge(inv.status)}</li>`).join('') || '<li>لا توجد فواتير مستحقة</li>'}
          </ul>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <h3>تنبيهات سريعة</h3>
          <ul class="panel-list">
            <li>${openPeriod ? `الفترة ${openPeriod.name} مفتوحة للترحيل` : 'لا توجد فترة محاسبية مفتوحة حالياً'}</li>
            <li>${kpis.data.activeAssets > 0 ? 'تأكد من تشغيل الإهلاك الشهري للأصول الثابتة' : 'لا توجد أصول نشطة حالياً'}</li>
          </ul>
        </div>
        <div class="card">
          <h3>اختصارات لوحة المفاتيح</h3>
          <ul class="panel-list">
            <li>استخدم <span class="mono">Ctrl+N</span> لإضافة سجل جديد في الشاشات التي تدعم ذلك.</li>
            <li>استخدم <span class="mono">Ctrl+S</span> للحفظ السريع.</li>
            <li>استخدم <span class="mono">Ctrl+F</span> للبحث داخل الشاشة.</li>
          </ul>
        </div>
      </div>
    `;

    view.querySelectorAll('[data-nav]').forEach((el) => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        location.hash = el.getAttribute('data-nav');
      });
    });
  };

  await load();
  setAutoRefresh(load);

  if (!hashListenerBound) {
    hashListenerBound = true;
    window.addEventListener('hashchange', () => {
      if (!location.hash.startsWith('#/dashboard')) stopAutoRefresh();
    });
  }
}
