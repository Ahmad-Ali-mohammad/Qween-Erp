import { request } from '../core/api.js';
import { store } from '../core/store.js';
import { setPageActions, setTitle, toast } from '../core/ui.js';

export async function renderLogin() {
  setTitle('تسجيل الدخول');
  setPageActions({});

  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="card auth-card" style="max-width:540px; margin: 0 auto;">
      <div class="section-title">
        <h3>تسجيل الدخول</h3>
        <span class="muted">ERP شركة واحدة</span>
      </div>
      <p class="muted">بيانات تجريبية: <span class="mono">admin</span> / <span class="mono">admin123</span></p>
      <form id="login-form" class="grid cols-1" autocomplete="on">
        <div>
          <label>اسم المستخدم أو البريد الإلكتروني</label>
          <input id="username" required />
        </div>
        <div>
          <label>كلمة المرور</label>
          <input id="password" type="password" required />
        </div>
        <label><input id="remember" type="checkbox" checked /> تذكرني</label>
        <div class="actions">
          <button class="btn btn-primary" type="submit">تسجيل الدخول</button>
          <a href="#" class="muted">نسيت كلمة المرور؟</a>
        </div>
      </form>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;

      const result = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      store.setAuth({
        token: result.data.token,
        refreshToken: result.data.refreshToken,
        user: result.data.user,
        remember: document.getElementById('remember').checked
      });

      toast('تم تسجيل الدخول بنجاح', 'success');
      location.hash = '#/dashboard';
    } catch (error) {
      toast(error.message || 'تعذر تسجيل الدخول', 'error');
    }
  });
}

