import { request, withToast } from '../core/api.js';
import { formatDate, setPageActions, setTitle, statusBadge } from '../core/ui.js';

function setViewLoading(text) {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="card">${text}</div>`;
  return view;
}

export async function renderProfile(mode = 'profile') {
  if (mode === 'password') return renderPassword();
  if (mode === 'mfa') return renderMfa();
  if (mode === 'preferences') return renderPreferences();
  return renderProfileInfo();
}

async function renderProfileInfo() {
  setTitle('بيانات المستخدم');
  const view = setViewLoading('جاري تحميل بيانات المستخدم...');

  const load = async () => {
    const profile = (await request('/profile')).data || {};

    view.innerHTML = `
      <div class="card">
        <h3>معلومات الحساب</h3>
        <div class="grid-2">
          <div><label>اسم المستخدم</label><div class="mono">${profile.username || '-'}</div></div>
          <div><label>الدور</label><div>${profile.role?.name || '-'}</div></div>
          <div><label>آخر دخول</label><div>${formatDate(profile.lastLogin) || '-'}</div></div>
          <div><label>الحالة</label><div>${statusBadge(profile.isActive ? 'ACTIVE' : 'CLOSED')}</div></div>
        </div>
      </div>

      <div class="card">
        <h3>تحديث البيانات الشخصية</h3>
        <form id="profile-form" class="grid-2">
          <div><label>الاسم الكامل</label><input id="p-fullName" value="${profile.fullName || ''}" /></div>
          <div><label>البريد الإلكتروني</label><input id="p-email" type="email" value="${profile.email || ''}" /></div>
          <div><label>رقم الجوال</label><input id="p-phone" value="${profile.phone || ''}" /></div>
          <div><label>المسمى الوظيفي</label><input id="p-position" value="${profile.position || ''}" /></div>
          <div class="actions"><button class="btn btn-primary" type="submit">حفظ التعديلات</button></div>
        </form>
      </div>
    `;

    document.getElementById('profile-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        fullName: document.getElementById('p-fullName').value.trim() || undefined,
        email: document.getElementById('p-email').value.trim() || undefined,
        phone: document.getElementById('p-phone').value.trim() || undefined,
        position: document.getElementById('p-position').value.trim() || undefined
      };
      await withToast(() => request('/profile', { method: 'PUT', body: JSON.stringify(payload) }), 'تم تحديث بيانات المستخدم');
      await load();
    });

    setPageActions({
      onSave: () => document.getElementById('profile-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderPassword() {
  setTitle('تغيير كلمة المرور');
  const view = setViewLoading('جاري تحميل صفحة تغيير كلمة المرور...');

  const load = async () => {
    view.innerHTML = `
      <div class="card">
        <h3>تغيير كلمة المرور</h3>
        <form id="password-form" class="grid-2">
          <div><label>كلمة المرور الحالية</label><input id="pass-current" type="password" autocomplete="current-password" required /></div>
          <div><label>كلمة المرور الجديدة</label><input id="pass-new" type="password" autocomplete="new-password" minlength="6" required /></div>
          <div><label>تأكيد كلمة المرور الجديدة</label><input id="pass-confirm" type="password" autocomplete="new-password" minlength="6" required /></div>
          <div class="actions"><button class="btn btn-primary" type="submit">تحديث كلمة المرور</button></div>
        </form>
      </div>
    `;

    document.getElementById('password-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const currentPassword = document.getElementById('pass-current').value;
      const newPassword = document.getElementById('pass-new').value;
      const confirmPassword = document.getElementById('pass-confirm').value;
      if (newPassword !== confirmPassword) throw new Error('تأكيد كلمة المرور غير مطابق');

      await withToast(
        () => request('/profile/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
        'تم تغيير كلمة المرور بنجاح'
      );
      document.getElementById('password-form')?.reset();
    });

    setPageActions({
      onSave: () => document.getElementById('password-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderMfa() {
  setTitle('المصادقة الثنائية');
  const view = setViewLoading('جاري تحميل إعدادات المصادقة الثنائية...');

  const load = async () => {
    const mfa = (await request('/profile/mfa')).data || { isEnabled: false };

    view.innerHTML = `
      <div class="card">
        <h3>إعدادات المصادقة الثنائية</h3>
        <div class="grid-2">
          <div><label>الحالة</label><div>${mfa.isEnabled ? statusBadge('ACTIVE') : statusBadge('CLOSED')}</div></div>
          <div><label>الطريقة</label><div>${mfa.method || '-'}</div></div>
          <div><label>تاريخ التحقق</label><div>${formatDate(mfa.verifiedAt) || '-'}</div></div>
        </div>
        <div class="actions" style="margin-top:12px;">
          <button id="mfa-enable" class="btn btn-primary">تفعيل</button>
          <button id="mfa-disable" class="btn btn-danger">تعطيل</button>
        </div>
      </div>

      <div class="card">
        <h3>التحقق من رمز MFA</h3>
        <form id="mfa-verify-form" class="grid-2">
          <div><label>رمز التحقق</label><input id="mfa-token" required /></div>
          <div class="actions"><button class="btn btn-success" type="submit">تحقق</button></div>
        </form>
      </div>
    `;

    document.getElementById('mfa-enable')?.addEventListener('click', async () => {
      await withToast(() => request('/profile/mfa/enable', { method: 'POST' }), 'تم تفعيل المصادقة الثنائية');
      await load();
    });

    document.getElementById('mfa-disable')?.addEventListener('click', async () => {
      await withToast(() => request('/profile/mfa/disable', { method: 'POST' }), 'تم تعطيل المصادقة الثنائية');
      await load();
    });

    document.getElementById('mfa-verify-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const token = document.getElementById('mfa-token').value.trim();
      await withToast(() => request('/profile/mfa/verify', { method: 'POST', body: JSON.stringify({ token }) }), 'تم التحقق من الرمز');
      await load();
    });

    setPageActions({
      onRefresh: () => load()
    });
  };

  await load();
}

async function renderPreferences() {
  setTitle('تفضيلات النظام');
  const view = setViewLoading('جاري تحميل تفضيلات المستخدم...');

  const load = async () => {
    const prefs = (await request('/profile/preferences')).data || {};

    view.innerHTML = `
      <div class="card">
        <h3>تفضيلات الواجهة</h3>
        <form id="prefs-form" class="grid-2">
          <div>
            <label>اللغة</label>
            <select id="pr-lang">
              <option value="ar" ${prefs.language === 'ar' ? 'selected' : ''}>العربية</option>
              <option value="en" ${prefs.language === 'en' ? 'selected' : ''}>English</option>
            </select>
          </div>
          <div>
            <label>المنطقة الزمنية</label>
            <input id="pr-timezone" value="${prefs.timezone || 'Asia/Riyadh'}" />
          </div>
          <div>
            <label>تنسيق التاريخ</label>
            <select id="pr-dateFormat">
              <option value="YYYY-MM-DD" ${prefs.dateFormat === 'YYYY-MM-DD' ? 'selected' : ''}>YYYY-MM-DD</option>
              <option value="DD/MM/YYYY" ${prefs.dateFormat === 'DD/MM/YYYY' ? 'selected' : ''}>DD/MM/YYYY</option>
            </select>
          </div>
          <div>
            <label>إشعارات البريد</label>
            <select id="pr-emailNotify">
              <option value="true" ${prefs.emailNotifications ? 'selected' : ''}>مفعلة</option>
              <option value="false" ${!prefs.emailNotifications ? 'selected' : ''}>معطلة</option>
            </select>
          </div>
          <div class="actions"><button class="btn btn-primary" type="submit">حفظ التفضيلات</button></div>
        </form>
      </div>
    `;

    document.getElementById('prefs-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        language: document.getElementById('pr-lang').value,
        timezone: document.getElementById('pr-timezone').value.trim() || 'Asia/Riyadh',
        dateFormat: document.getElementById('pr-dateFormat').value,
        emailNotifications: document.getElementById('pr-emailNotify').value === 'true'
      };
      await withToast(() => request('/profile/preferences', { method: 'PUT', body: JSON.stringify(payload) }), 'تم حفظ التفضيلات');
      await load();
    });

    setPageActions({
      onSave: () => document.getElementById('prefs-form')?.requestSubmit(),
      onRefresh: () => load()
    });
  };

  await load();
}
