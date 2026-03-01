import { request, withToast, extractRows, extractData, toQuery } from '../core/api.js';
import { setTitle, table, formatDate, confirmAction, setPageActions } from '../core/ui.js';

const permissionKeys = [
  'users.read', 'users.write',
  'roles.read', 'roles.write',
  'settings.read', 'settings.write',
  'fiscal.read', 'fiscal.write',
  'accounts.read', 'accounts.write',
  'journal.read', 'journal.create', 'journal.post', 'journal.reverse', 'journal.delete',
  'parties.read', 'parties.write',
  'invoice.read', 'invoice.write', 'invoice.issue', 'invoice.cancel',
  'payment.read', 'payment.write', 'payment.complete', 'payment.cancel',
  'assets.read', 'assets.write',
  'budget.read', 'budget.write',
  'tax.read', 'tax.write',
  'reports.read',
  'audit.read'
];

export async function renderSettings(mode = 'company') {
  if (mode === 'users-roles') return renderUsersRoles();
  if (mode === 'company') return renderCompanySettings();
  if (mode === 'system') return renderSystemSettings();
  if (mode === 'backups') return renderBackups();
  if (mode === 'notifications') return renderNotifications();
  if (mode === 'tasks') return renderTasks();
  if (mode === 'security') return renderSecuritySettings();
  if (mode === 'internal-controls') return renderInternalControls();
  if (mode === 'integrations') return renderIntegrations();
  return renderCompanySettings();
}

async function renderUsersRoles() {
  setTitle('المستخدمين والصلاحيات');
  const view = document.getElementById('view');

  const load = async () => {
    const [usersRes, rolesRes] = await Promise.all([request('/users'), request('/roles')]);
    const users = usersRes.data || [];
    const roles = rolesRes.data || [];

    view.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <h3>إضافة مستخدم جديد</h3>
          <form id="user-form" class="grid-2">
            <div><label>اسم المستخدم</label><input id="u-username" autocomplete="username" required /></div>
            <div><label>البريد الإلكتروني</label><input id="u-email" type="email" autocomplete="email" required /></div>
            <div><label>الاسم الكامل</label><input id="u-fullName" autocomplete="name" required /></div>
            <div><label>كلمة المرور</label><input id="u-password" type="password" autocomplete="new-password" required /></div>
            <div><label>الدور</label>
              <select id="u-role" required>
                <option value="">اختر الدور</option>
                ${roles.map((r) => `<option value="${r.id}">${r.nameAr}</option>`).join('')}
              </select>
            </div>
            <div><label>رقم الجوال</label><input id="u-phone" /></div>
            <div><label>المسمى الوظيفي</label><input id="u-position" /></div>
            <div class="actions"><button class="btn btn-primary" type="submit">حفظ المستخدم</button></div>
          </form>
        </div>

        <div class="card">
          <h3>إضافة دور جديد</h3>
          <form id="role-form" class="grid-2">
            <div><label>اسم الدور (EN)</label><input id="r-name" required /></div>
            <div><label>اسم الدور (AR)</label><input id="r-nameAr" required /></div>
            <div style="grid-column:1 / -1;"><label>الوصف</label><input id="r-desc" /></div>
            <div style="grid-column:1 / -1;"><label>الصلاحيات</label>
              <div id="r-perms" class="grid-4">
                ${permissionKeys.map((p) => `<label><input type="checkbox" data-perm="${p}" /> ${p}</label>`).join('')}
              </div>
            </div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ الدور</button></div>
          </form>
        </div>
      </div>

      <div class="card">
        <h3>قائمة المستخدمين</h3>
        ${table(
          ['الاسم', 'البريد الإلكتروني', 'الدور', 'آخر دخول', 'الحالة', 'الإجراءات'],
          users.map((u) => [
            u.fullName,
            u.email,
            u.role?.nameAr || '-',
            u.lastLogin ? formatDate(u.lastLogin) : '-',
            u.isActive === false ? 'غير نشط' : 'نشط',
            `<button class="btn btn-danger btn-sm" data-user-delete="${u.id}">حذف</button>`
          ])
        )}
      </div>

      <div class="card">
        <h3>قائمة الأدوار</h3>
        ${table(
          ['الاسم (EN)', 'الاسم (AR)', 'عدد الصلاحيات', 'نوع الدور', 'الإجراءات'],
          roles.map((r) => [
            r.name,
            r.nameAr,
            Object.values(r.permissions || {}).filter(Boolean).length,
            r.isSystem ? 'نظام' : 'مخصص',
            `<button class="btn btn-danger btn-sm" data-role-delete="${r.id}" ${r.isSystem ? 'disabled' : ''}>حذف</button>`
          ])
        )}
      </div>
    `;

    document.getElementById('user-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        username: document.getElementById('u-username').value,
        email: document.getElementById('u-email').value,
        fullName: document.getElementById('u-fullName').value,
        password: document.getElementById('u-password').value,
        roleId: Number(document.getElementById('u-role').value),
        phone: document.getElementById('u-phone').value || undefined,
        position: document.getElementById('u-position').value || undefined
      };
      await withToast(() => request('/users', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء المستخدم بنجاح');
      await load();
    });

    document.getElementById('role-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const permissions = {};
      document.querySelectorAll('#r-perms [data-perm]').forEach((checkbox) => {
        permissions[checkbox.getAttribute('data-perm')] = checkbox.checked;
      });

      const payload = {
        name: document.getElementById('r-name').value,
        nameAr: document.getElementById('r-nameAr').value,
        description: document.getElementById('r-desc').value || undefined,
        permissions
      };

      await withToast(() => request('/roles', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء الدور بنجاح');
      await load();
    });

    view.querySelectorAll('[data-user-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-user-delete'));
        const confirmed = await confirmAction('هل تريد حذف هذا المستخدم؟');
        if (!confirmed) return;
        await withToast(() => request(`/users/${id}`, { method: 'DELETE' }), 'تم حذف المستخدم');
        await load();
      });
    });

    view.querySelectorAll('[data-role-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (btn.hasAttribute('disabled')) return;
        const id = Number(btn.getAttribute('data-role-delete'));
        const confirmed = await confirmAction('هل تريد حذف هذا الدور؟');
        if (!confirmed) return;
        await withToast(() => request(`/roles/${id}`, { method: 'DELETE' }), 'تم حذف الدور');
        await load();
      });
    });

    setPageActions({ onRefresh: () => load() });
  };

  await load();
}

async function renderCompanySettings() {
  setTitle('إعدادات الشركة');
  const view = document.getElementById('view');

  const load = async () => {
    const companyRes = await request('/settings/company');
    const company = companyRes.data || {};

    view.innerHTML = `
      <div class="card">
        <h3>بيانات الشركة الأساسية</h3>
        <form id="company-form" class="grid-2">
            <div><label>الاسم العربي</label><input id="c-nameAr" value="${company.nameAr || ''}" /></div>
            <div><label>الاسم الإنجليزي</label><input id="c-nameEn" value="${company.nameEn || ''}" /></div>
            <div><label>السجل التجاري</label><input id="c-cr" value="${company.commercialRegistration || ''}" /></div>
            <div><label>الرقم الضريبي</label><input id="c-tax" value="${company.taxNumber || ''}" /></div>
            <div><label>رقم ضريبة القيمة المضافة</label><input id="c-vat" value="${company.vatNumber || ''}" /></div>
            <div><label>العملة الأساسية</label><input id="c-currency" value="${company.currency || 'SAR'}" /></div>
            <div><label>المدينة</label><input id="c-city" value="${company.city || ''}" /></div>
            <div><label>الهاتف</label><input id="c-phone" value="${company.phone || ''}" /></div>
            <div><label>البريد الإلكتروني</label><input id="c-email" value="${company.email || ''}" /></div>
            <div><label>بداية السنة المالية (الشهر)</label><input id="c-start-month" type="number" min="1" max="12" value="${company.fiscalYearStartMonth || 1}" /></div>
            <div style="grid-column:1 / -1;"><label>العنوان</label><input id="c-address" value="${company.address || ''}" /></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ إعدادات الشركة</button></div>
        </form>
      </div>
    `;

    document.getElementById('company-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        nameAr: document.getElementById('c-nameAr').value || undefined,
        nameEn: document.getElementById('c-nameEn').value || undefined,
        commercialRegistration: document.getElementById('c-cr').value || undefined,
        taxNumber: document.getElementById('c-tax').value || undefined,
        vatNumber: document.getElementById('c-vat').value || undefined,
        currency: document.getElementById('c-currency').value || undefined,
        city: document.getElementById('c-city').value || undefined,
        phone: document.getElementById('c-phone').value || undefined,
        email: document.getElementById('c-email').value || undefined,
        address: document.getElementById('c-address').value || undefined,
        fiscalYearStartMonth: Number(document.getElementById('c-start-month').value || 1)
      };
      await withToast(() => request('/settings/company', { method: 'PUT', body: JSON.stringify(payload) }), 'تم حفظ إعدادات الشركة');
      await load();
    });

    setPageActions({
      onSave: () => document.getElementById('company-form').requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderSystemSettings() {
  setTitle('إعدادات النظام');
  const view = document.getElementById('view');

  const load = async () => {
    const systemRes = await request('/settings/system');
    const system = systemRes.data || {};

    view.innerHTML = `
      <div class="card">
        <h3>إعدادات التشغيل العامة</h3>
        <form id="system-form" class="grid-2">
          <div><label>بادئة رقم فاتورة المبيعات</label><input id="s-invoice" value="${system.invoicePrefix || 'INV'}" /></div>
          <div><label>بادئة رقم عرض السعر</label><input id="s-quote" value="${system.quotePrefix || 'QT'}" /></div>
          <div><label>حد الاعتماد (مبلغ)</label><input id="s-threshold" type="number" min="0" step="0.01" value="${system.approvalThreshold || 0}" /></div>
          <div><label><input id="s-approve" type="checkbox" ${system.requireApproval ? 'checked' : ''} /> تفعيل شرط الاعتماد</label></div>
          <div><label><input id="s-negative" type="checkbox" ${system.allowNegativeStock ? 'checked' : ''} /> السماح بالمخزون السالب</label></div>
          <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ إعدادات النظام</button></div>
        </form>
      </div>

      <div class="card">
        <h3>بيانات تجريبية للوحة التحكم (3 سنوات)</h3>
        <p class="muted">تستخدم هذه الأدوات لملء قاعدة البيانات ببيانات اختبار شاملة أو تنظيفها. سيتم الاحتفاظ بالمستخدمين والأدوار وإعدادات النظام الأساسية.</p>
        <div class="actions" style="margin-bottom:10px;">
          <button id="demo-import-default" class="btn btn-success" type="button">استيراد النسخة التجريبية الافتراضية</button>
          <button id="demo-download-file" class="btn btn-secondary" type="button">تنزيل ملف البيانات التجريبية</button>
        </div>
        <div class="grid-2" style="margin-bottom:10px;">
          <div>
            <label>استيراد من ملف JSON</label>
            <input id="demo-file-input" type="file" accept=".json,application/json" />
          </div>
          <div style="display:flex;align-items:end;">
            <button id="demo-import-file" class="btn btn-info" type="button">استيراد من الملف</button>
          </div>
        </div>
        <div class="actions">
          <button id="demo-purge-all" class="btn btn-danger" type="button">حذف جميع البيانات التشغيلية</button>
        </div>
        <div id="demo-op-result" class="muted" style="margin-top:12px;"></div>
      </div>
    `;

    document.getElementById('system-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        invoicePrefix: document.getElementById('s-invoice').value,
        quotePrefix: document.getElementById('s-quote').value,
        approvalThreshold: Number(document.getElementById('s-threshold').value || 0),
        requireApproval: document.getElementById('s-approve').checked,
        allowNegativeStock: document.getElementById('s-negative').checked
      };
      await withToast(() => request('/settings/system', { method: 'PUT', body: JSON.stringify(payload) }), 'تم حفظ إعدادات النظام');
      await load();
    });

    const setDemoResult = (html) => {
      const el = document.getElementById('demo-op-result');
      if (el) el.innerHTML = html;
    };

    const summarizeImport = (summary) => `
      <div class="success">
        <strong>تم تنفيذ العملية بنجاح.</strong>
      </div>
      <div class="grid-3" style="margin-top:8px;">
        <div class="kpi"><div>السنوات</div><div class="val">${summary.years ?? 0}</div></div>
        <div class="kpi"><div>الفترات</div><div class="val">${summary.periods ?? 0}</div></div>
        <div class="kpi"><div>العملاء</div><div class="val">${summary.customers ?? 0}</div></div>
        <div class="kpi"><div>الموردين</div><div class="val">${summary.suppliers ?? 0}</div></div>
        <div class="kpi"><div>الأصناف</div><div class="val">${summary.items ?? 0}</div></div>
        <div class="kpi"><div>الأصول</div><div class="val">${summary.assets ?? 0}</div></div>
        <div class="kpi"><div>الفواتير</div><div class="val">${summary.invoices ?? 0}</div></div>
        <div class="kpi"><div>المدفوعات</div><div class="val">${summary.payments ?? 0}</div></div>
        <div class="kpi"><div>القيود</div><div class="val">${summary.journals ?? 0}</div></div>
      </div>
    `;

    document.getElementById('demo-import-default')?.addEventListener('click', async () => {
      setDemoResult('جاري الاستيراد...');
      const result = await withToast(
        () => request('/settings/demo-data/import-default', { method: 'POST', body: JSON.stringify({ purgeFirst: true }) }),
        'تم استيراد البيانات التجريبية'
      );
      setDemoResult(summarizeImport(result.data || {}));
    });

    document.getElementById('demo-download-file')?.addEventListener('click', async () => {
      const res = await withToast(() => request('/settings/demo-data/file'), 'تم تجهيز الملف');
      const data = res?.data?.data || {};
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'demo-data-3y.json';
      link.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('demo-import-file')?.addEventListener('click', async () => {
      setDemoResult('جاري قراءة الملف والاستيراد...');
      const result = await withToast(async () => {
        const input = document.getElementById('demo-file-input');
        const file = input?.files?.[0];
        if (!file) throw new Error('اختر ملف JSON أولاً');

        const text = await file.text();
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error('الملف ليس بصيغة JSON صحيحة');
        }

        return request('/settings/demo-data/import', { method: 'POST', body: JSON.stringify({ purgeFirst: true, data: parsed }) });
      }, 'تم استيراد البيانات من الملف');
      setDemoResult(summarizeImport(result.data || {}));
    });

    document.getElementById('demo-purge-all')?.addEventListener('click', async () => {
      const sure = await confirmAction('سيتم حذف جميع البيانات التشغيلية الحالية. هل تريد المتابعة؟');
      if (!sure) return;
      const phrase = window.prompt('للتأكيد النهائي اكتب العبارة التالية بالضبط: DELETE ALL') || '';

      setDemoResult('جاري حذف البيانات التشغيلية...');
      await withToast(
        () => request('/settings/demo-data/purge', { method: 'POST', body: JSON.stringify({ confirm: phrase }) }),
        'تم حذف البيانات التشغيلية'
      );
      setDemoResult('<div class="success"><strong>تم حذف البيانات التشغيلية بنجاح.</strong></div>');
    });

    setPageActions({
      onSave: () => document.getElementById('system-form').requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderSecuritySettings() {
  setTitle('إعدادات الأمان والمصادقة');
  const view = document.getElementById('view');

  const load = async () => {
    const row = (await request('/security/policies')).data || {};
    view.innerHTML = `
      <div class="card">
        <h3>سياسات الأمان</h3>
        <form id="security-form" class="grid-3">
          <div><label>الحد الأدنى لكلمة المرور</label><input id="sec-min" type="number" min="6" value="${row.passwordMinLength ?? 8}" /></div>
          <div><label>انتهاء كلمة المرور (يوم)</label><input id="sec-expiry" type="number" min="0" value="${row.passwordExpiryDays ?? 90}" /></div>
          <div><label>عدد محاولات القفل</label><input id="sec-lock-attempts" type="number" min="1" value="${row.lockoutAttempts ?? 5}" /></div>
          <div><label>مدة القفل (دقيقة)</label><input id="sec-lock-minutes" type="number" min="1" value="${row.lockoutMinutes ?? 30}" /></div>
          <div><label>مهلة الجلسة (دقيقة)</label><input id="sec-timeout" type="number" min="5" value="${row.sessionTimeoutMinutes ?? 30}" /></div>
          <div><label>الاحتفاظ بسجل التدقيق (يوم)</label><input id="sec-audit-days" type="number" min="1" value="${row.auditRetentionDays ?? 180}" /></div>
          <div><label><input id="sec-complex" type="checkbox" ${row.passwordRequireComplex ? 'checked' : ''} /> تعقيد كلمة المرور</label></div>
          <div><label><input id="sec-single" type="checkbox" ${row.singleSessionOnly ? 'checked' : ''} /> جلسة واحدة للمستخدم</label></div>
          <div><label><input id="sec-audit-read" type="checkbox" ${row.auditReadActions ? 'checked' : ''} /> تتبع عمليات القراءة</label></div>
          <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ السياسات</button></div>
        </form>
      </div>
    `;

    document.getElementById('security-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        passwordMinLength: Number(document.getElementById('sec-min').value || 8),
        passwordRequireComplex: document.getElementById('sec-complex').checked,
        passwordExpiryDays: Number(document.getElementById('sec-expiry').value || 90),
        lockoutAttempts: Number(document.getElementById('sec-lock-attempts').value || 5),
        lockoutMinutes: Number(document.getElementById('sec-lock-minutes').value || 30),
        sessionTimeoutMinutes: Number(document.getElementById('sec-timeout').value || 30),
        singleSessionOnly: document.getElementById('sec-single').checked,
        auditReadActions: document.getElementById('sec-audit-read').checked,
        auditRetentionDays: Number(document.getElementById('sec-audit-days').value || 180)
      };
      await withToast(() => request('/security/policies', { method: 'PUT', body: JSON.stringify(payload) }), 'تم حفظ سياسات الأمان');
      await load();
    });

    setPageActions({ onSave: () => document.getElementById('security-form')?.requestSubmit(), onRefresh: () => load() });
  };

  await load();
}

async function renderInternalControls() {
  setTitle('الرقابة الداخلية');
  const view = document.getElementById('view');

  const load = async () => {
    const row = (await request('/internal-controls')).data || {};
    const settings = row.settings || {};

    view.innerHTML = `
      <div class="card">
        <h3>ضبط الرقابة الداخلية</h3>
        <form id="controls-form" class="grid-3">
          <div><label><input id="ic-enabled" type="checkbox" ${row.isEnabled ? 'checked' : ''} /> تفعيل</label></div>
          <div><label>الحالة</label><input id="ic-status" value="${row.status || 'ACTIVE'}" /></div>
          <div><label>تكرار المراجعة (أيام)</label><input id="ic-review-days" type="number" min="1" value="${settings.reviewFrequencyDays ?? 30}" /></div>
          <div><label><input id="ic-dual-approve" type="checkbox" ${settings.dualApproval ? 'checked' : ''} /> موافقة مزدوجة للعمليات الحساسة</label></div>
          <div><label><input id="ic-attach-required" type="checkbox" ${settings.attachmentsRequired ? 'checked' : ''} /> إلزام المرفقات</label></div>
          <div class="actions"><button class="btn btn-primary" type="submit">حفظ</button></div>
        </form>
      </div>
    `;

    document.getElementById('controls-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        isEnabled: document.getElementById('ic-enabled').checked,
        status: document.getElementById('ic-status').value.trim() || 'ACTIVE',
        settings: {
          reviewFrequencyDays: Number(document.getElementById('ic-review-days').value || 30),
          dualApproval: document.getElementById('ic-dual-approve').checked,
          attachmentsRequired: document.getElementById('ic-attach-required').checked
        }
      };
      await withToast(() => request('/internal-controls', { method: 'PUT', body: JSON.stringify(payload) }), 'تم حفظ إعدادات الرقابة الداخلية');
      await load();
    });

    setPageActions({ onSave: () => document.getElementById('controls-form')?.requestSubmit(), onRefresh: () => load() });
  };

  await load();
}

async function renderIntegrations() {
  setTitle('التكاملات');
  const view = document.getElementById('view');

  const load = async () => {
    const rows = (await request('/integration-settings')).data || [];
    view.innerHTML = `
      <div class="card">
        <h3>إضافة/تحديث تكامل</h3>
        <form id="integration-form" class="grid-3">
          <div><label>المفتاح</label><input id="int-key" required placeholder="zatca" /></div>
          <div><label>المزود</label><input id="int-provider" value="SYSTEM" /></div>
          <div><label>الحالة</label><input id="int-status" value="ACTIVE" /></div>
          <div><label><input id="int-enabled" type="checkbox" checked /> مفعل</label></div>
          <div style="grid-column:1 / -1;"><label>الإعدادات (JSON)</label><textarea id="int-settings" rows="6" placeholder='{"endpoint":"https://..."}'></textarea></div>
          <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ</button></div>
        </form>
      </div>

      <div class="card">
        ${table(
          ['المفتاح', 'المزود', 'مفعل', 'الحالة', 'آخر تحديث'],
          rows.map((r) => [r.key, r.provider || '-', r.isEnabled ? 'نعم' : 'لا', r.status || '-', formatDate(r.updatedAt)])
        )}
      </div>
    `;

    document.getElementById('integration-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      await withToast(async () => {
        let settings = {};
        const raw = document.getElementById('int-settings').value.trim();
        if (raw) {
          try {
            settings = JSON.parse(raw);
          } catch {
            throw new Error('صيغة JSON غير صحيحة');
          }
        }

        const payload = {
          key: document.getElementById('int-key').value.trim(),
          provider: document.getElementById('int-provider').value.trim() || 'SYSTEM',
          isEnabled: document.getElementById('int-enabled').checked,
          status: document.getElementById('int-status').value.trim() || 'ACTIVE',
          settings
        };

        return request('/integration-settings', { method: 'POST', body: JSON.stringify(payload) });
      }, 'تم حفظ التكامل');
      await load();
    });

    setPageActions({ onSave: () => document.getElementById('integration-form')?.requestSubmit(), onRefresh: () => load() });
  };

  await load();
}

async function renderBackups() {
  setTitle('النسخ الاحتياطي والاستعادة');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل النسخ الاحتياطية...</div>';

  const load = async () => {
    const [jobsRes, schedulesRes] = await Promise.all([
      request(`/backups${toQuery({ page: 1, limit: 100 })}`),
      request(`/backups/schedules${toQuery({ page: 1, limit: 100 })}`)
    ]);

    const jobs = extractRows(jobsRes);
    const schedules = extractRows(schedulesRes);
    const completedCount = jobs.filter((j) => j.status === 'COMPLETED').length;
    const queuedCount = jobs.filter((j) => ['QUEUED', 'RUNNING'].includes(j.status)).length;

    view.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <h3>تشغيل نسخة احتياطية جديدة</h3>
          <form id="backup-form" class="grid-2">
            <div><label>نوع العملية</label>
              <select id="bk-action">
                <option value="BACKUP">نسخ احتياطي</option>
                <option value="VERIFY">تحقق</option>
              </select>
            </div>
            <div><label>الحالة الابتدائية</label>
              <select id="bk-status">
                <option value="QUEUED">في الانتظار</option>
                <option value="RUNNING">قيد التنفيذ</option>
              </select>
            </div>
            <div><label>اسم الملف (اختياري)</label><input id="bk-file" placeholder="backup-2026-03-01.zip" /></div>
            <div><label>مجدولة</label>
              <select id="bk-scheduled">
                <option value="false" selected>لا</option>
                <option value="true">نعم</option>
              </select>
            </div>
            <div style="grid-column:1 / -1;"><label>Cron (اختياري)</label><input id="bk-cron" placeholder="0 2 * * *" /></div>
            <div style="grid-column:1 / -1;"><label>ملاحظات</label><input id="bk-notes" /></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">إنشاء مهمة</button></div>
          </form>
        </div>
        <div class="card">
          <h3>ملخص النسخ الاحتياطي</h3>
          <div class="stats-grid">
            <div class="stat"><div class="stat-label">إجمالي المهام</div><div class="stat-value">${jobs.length}</div></div>
            <div class="stat"><div class="stat-label">مجدولة</div><div class="stat-value">${schedules.length}</div></div>
            <div class="stat"><div class="stat-label">منجزة</div><div class="stat-value">${completedCount}</div></div>
            <div class="stat"><div class="stat-label">معلقة</div><div class="stat-value">${queuedCount}</div></div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>سجل العمليات</h3>
        ${table(
          ['المعرف', 'العملية', 'الحالة', 'الملف', 'مجدولة', 'وقت الطلب', 'وقت الإكمال', 'الإجراءات'],
          jobs.map((row) => [
            row.id,
            row.action || '-',
            row.status || '-',
            row.fileName || '-',
            row.isScheduled ? 'نعم' : 'لا',
            formatDate(row.requestedAt),
            formatDate(row.completedAt),
            `<div class="actions">
              <button class="btn btn-info btn-sm" data-action="restore" data-id="${row.id}">استعادة</button>
              <button class="btn btn-warning btn-sm" data-action="schedule" data-id="${row.id}" data-next="${row.isScheduled ? 'false' : 'true'}">${row.isScheduled ? 'إلغاء الجدولة' : 'جدولة'}</button>
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${row.id}">حذف</button>
            </div>`
          ])
        )}
      </div>
    `;

    document.getElementById('backup-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const isScheduled = document.getElementById('bk-scheduled').value === 'true';
      const payload = {
        action: document.getElementById('bk-action').value,
        status: document.getElementById('bk-status').value,
        fileName: document.getElementById('bk-file').value.trim() || undefined,
        isScheduled,
        scheduleExpr: isScheduled ? document.getElementById('bk-cron').value.trim() || undefined : undefined,
        notes: document.getElementById('bk-notes').value.trim() || undefined,
        requestedAt: new Date().toISOString()
      };
      await withToast(() => request('/backups', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء مهمة النسخ الاحتياطي');
      await load();
    });

    view.querySelectorAll('[data-action="restore"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('سيتم إنشاء مهمة استعادة من هذه النسخة. هل تريد المتابعة؟');
        if (!confirmed) return;
        await withToast(() => request(`/backups/${id}/restore`, { method: 'POST' }), 'تم إرسال طلب الاستعادة');
        await load();
      });
    });

    view.querySelectorAll('[data-action="schedule"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const row = jobs.find((j) => j.id === id);
        if (!row) return;
        const next = btn.getAttribute('data-next') === 'true';
        const payload = next
          ? { isScheduled: true, scheduleExpr: row.scheduleExpr || '0 2 * * *' }
          : { isScheduled: false };
        await withToast(() => request(`/backups/${id}`, { method: 'PUT', body: JSON.stringify(payload) }), 'تم تحديث الجدولة');
        await load();
      });
    });

    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('هل تريد حذف مهمة النسخ الاحتياطي هذه؟');
        if (!confirmed) return;
        await withToast(() => request(`/backups/${id}`, { method: 'DELETE' }), 'تم حذف المهمة');
        await load();
      });
    });

    setPageActions({
      onSave: () => document.getElementById('backup-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderNotifications() {
  setTitle('مركز الإشعارات');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل الإشعارات...</div>';
  const state = { unreadOnly: false };

  const load = async () => {
    const [rowsRes, countRes] = await Promise.all([request(`/notifications${toQuery({ page: 1, limit: 200 })}`), request('/notifications/count')]);
    const rows = extractRows(rowsRes);
    const unread = Number(extractData(countRes)?.unread || 0);
    const filtered = state.unreadOnly ? rows.filter((r) => !r.isRead) : rows;

    view.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <h3>إرسال إشعار جديد</h3>
          <form id="notification-form" class="grid-2">
            <div><label>العنوان</label><input id="nt-title" required /></div>
            <div><label>النوع</label>
              <select id="nt-type">
                <option value="INFO">معلومة</option>
                <option value="WARNING">تنبيه</option>
                <option value="SUCCESS">نجاح</option>
                <option value="ERROR">خطأ</option>
              </select>
            </div>
            <div><label>معرف المستخدم (اختياري)</label><input id="nt-user" type="number" min="1" placeholder="فارغ = للجميع" /></div>
            <div style="grid-column:1 / -1;"><label>نص الإشعار</label><textarea id="nt-message" rows="2" required></textarea></div>
            <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">إرسال</button></div>
          </form>
        </div>
        <div class="card">
          <h3>ملخص</h3>
          <div class="stats-grid">
            <div class="stat"><div class="stat-label">إجمالي الإشعارات</div><div class="stat-value">${rows.length}</div></div>
            <div class="stat"><div class="stat-label">غير المقروء</div><div class="stat-value">${unread}</div></div>
          </div>
          <div class="actions" style="margin-top:12px;">
            <button id="nt-filter" class="btn btn-secondary">${state.unreadOnly ? 'عرض الكل' : 'عرض غير المقروء فقط'}</button>
            <button id="nt-read-all" class="btn btn-success">تحديد الكل كمقروء</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>قائمة الإشعارات</h3>
        ${table(
          ['المعرف', 'العنوان', 'الرسالة', 'النوع', 'المستخدم', 'مقروء', 'التاريخ', 'الإجراءات'],
          filtered.map((row) => [
            row.id,
            row.title || '-',
            row.message || '-',
            row.type || '-',
            row.userId || 'الكل',
            row.isRead ? 'نعم' : 'لا',
            formatDate(row.createdAt),
            `<div class="actions">
              ${row.isRead ? '' : `<button class="btn btn-info btn-sm" data-action="read" data-id="${row.id}">تحديد كمقروء</button>`}
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${row.id}">حذف</button>
            </div>`
          ])
        )}
      </div>
    `;

    document.getElementById('notification-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const userIdRaw = document.getElementById('nt-user').value;
      const payload = {
        title: document.getElementById('nt-title').value.trim(),
        message: document.getElementById('nt-message').value.trim(),
        type: document.getElementById('nt-type').value,
        isRead: false,
        userId: userIdRaw ? Number(userIdRaw) : undefined
      };
      await withToast(() => request('/notifications', { method: 'POST', body: JSON.stringify(payload) }), 'تم إرسال الإشعار');
      await load();
    });

    document.getElementById('nt-filter')?.addEventListener('click', async () => {
      state.unreadOnly = !state.unreadOnly;
      await load();
    });

    document.getElementById('nt-read-all')?.addEventListener('click', async () => {
      await withToast(() => request('/notifications/read-all', { method: 'POST' }), 'تم تحديد جميع الإشعارات كمقروءة');
      await load();
    });

    view.querySelectorAll('[data-action="read"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        await withToast(() => request(`/notifications/${id}/read`, { method: 'POST' }), 'تم تحديث حالة الإشعار');
        await load();
      });
    });

    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('هل تريد حذف هذا الإشعار؟');
        if (!confirmed) return;
        await withToast(() => request(`/notifications/${id}`, { method: 'DELETE' }), 'تم حذف الإشعار');
        await load();
      });
    });

    setPageActions({
      onSave: () => document.getElementById('notification-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderTasks() {
  setTitle('لوحة المهام');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل المهام...</div>';

  const load = async () => {
    const [tasksRes, usersRes] = await Promise.all([request(`/tasks${toQuery({ page: 1, limit: 200 })}`), request('/users')]);
    const tasks = extractRows(tasksRes);
    const users = extractRows(usersRes);

    view.innerHTML = `
      <div class="card">
        <h3>إضافة مهمة</h3>
        <form id="task-form" class="grid-3">
          <div><label>عنوان المهمة</label><input id="tk-title" required /></div>
          <div><label>المسؤول</label>
            <select id="tk-user">
              <option value="">غير معيّن</option>
              ${users.map((u) => `<option value="${u.id}">${u.fullName || u.username}</option>`).join('')}
            </select>
          </div>
          <div><label>تاريخ الاستحقاق</label><input id="tk-due" type="date" /></div>
          <div><label>الأولوية</label>
            <select id="tk-priority">
              <option value="LOW">منخفضة</option>
              <option value="MEDIUM" selected>متوسطة</option>
              <option value="HIGH">مرتفعة</option>
              <option value="URGENT">عاجلة</option>
            </select>
          </div>
          <div><label>الحالة</label>
            <select id="tk-status">
              <option value="OPEN" selected>مفتوحة</option>
              <option value="IN_PROGRESS">قيد التنفيذ</option>
              <option value="DONE">مكتملة</option>
              <option value="CANCELLED">ملغاة</option>
            </select>
          </div>
          <div style="grid-column:1 / -1;"><label>الوصف</label><textarea id="tk-desc" rows="2"></textarea></div>
          <div class="actions" style="grid-column:1 / -1;"><button class="btn btn-primary" type="submit">حفظ المهمة</button></div>
        </form>
      </div>

      <div class="card">
        <h3>قائمة المهام</h3>
        ${table(
          ['المعرف', 'العنوان', 'الوصف', 'المسؤول', 'الاستحقاق', 'الأولوية', 'الحالة', 'الإجراءات'],
          tasks.map((row) => [
            row.id,
            row.title || '-',
            row.description || '-',
            `
            <select data-assign="${row.id}">
              <option value="">غير معيّن</option>
              ${users
                .map(
                  (u) =>
                    `<option value="${u.id}" ${Number(row.userId || 0) === Number(u.id) ? 'selected' : ''}>${u.fullName || u.username}</option>`
                )
                .join('')}
            </select>
            `,
            formatDate(row.dueDate),
            row.priority || '-',
            `
            <select data-status="${row.id}">
              ${['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']
                .map((st) => `<option value="${st}" ${st === row.status ? 'selected' : ''}>${st}</option>`)
                .join('')}
            </select>
            `,
            `<div class="actions">
              <button class="btn btn-info btn-sm" data-action="assign" data-id="${row.id}">تعيين</button>
              <button class="btn btn-warning btn-sm" data-action="status" data-id="${row.id}">تحديث الحالة</button>
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${row.id}">حذف</button>
            </div>`
          ])
        )}
      </div>
    `;

    document.getElementById('task-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const userIdRaw = document.getElementById('tk-user').value;
      const payload = {
        title: document.getElementById('tk-title').value.trim(),
        description: document.getElementById('tk-desc').value.trim() || undefined,
        dueDate: document.getElementById('tk-due').value || undefined,
        priority: document.getElementById('tk-priority').value,
        status: document.getElementById('tk-status').value,
        userId: userIdRaw ? Number(userIdRaw) : undefined
      };
      await withToast(() => request('/tasks', { method: 'POST', body: JSON.stringify(payload) }), 'تم إنشاء المهمة');
      await load();
    });

    view.querySelectorAll('[data-action="assign"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const userSelect = view.querySelector(`[data-assign="${id}"]`);
        const userId = userSelect?.value ? Number(userSelect.value) : null;
        await withToast(() => request(`/tasks/${id}/assign`, { method: 'POST', body: JSON.stringify({ userId }) }), 'تم تحديث المسؤول');
        await load();
      });
    });

    view.querySelectorAll('[data-action="status"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const statusSelect = view.querySelector(`[data-status="${id}"]`);
        const status = statusSelect?.value || 'OPEN';
        await withToast(() => request(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }), 'تم تحديث حالة المهمة');
        await load();
      });
    });

    view.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const confirmed = await confirmAction('هل تريد حذف هذه المهمة؟');
        if (!confirmed) return;
        await withToast(() => request(`/tasks/${id}`, { method: 'DELETE' }), 'تم حذف المهمة');
        await load();
      });
    });

    setPageActions({
      onSave: () => document.getElementById('task-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}



