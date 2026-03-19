const DEFAULT_REDIRECT_SECONDS = 5;

const links = [
  { href: '/portal', labelAr: 'الانتقال إلى البوابة المركزية', labelEn: 'Open Control Center' },
  { href: '/systems/projects', labelAr: 'فتح نظام المشاريع', labelEn: 'Open Projects System' },
  { href: '/systems/accounting', labelAr: 'فتح نظام المحاسبة', labelEn: 'Open Accounting System' }
];

const translations = {
  ar: {
    badge: 'وضع انتقال مرحلي',
    eyebrow: 'Legacy Frontend',
    title: 'الواجهة القديمة أصبحت طبقة انتقالية فقط',
    description:
      'تم نقل الاستخدام التشغيلي الرسمي إلى البوابة المركزية والأنظمة المستقلة. سيتم تحويلك تلقائياً إلى /portal.',
    note: 'إذا لم يتم التحويل تلقائياً، استخدم أحد الروابط التالية.',
    timer: (secondsLeft) => `إعادة التوجيه خلال ${secondsLeft} ثانية`
  },
  en: {
    badge: 'Transition Mode',
    eyebrow: 'Legacy Frontend',
    title: 'The legacy frontend is now a transition layer only',
    description:
      'Operational use has moved to the control center and independent system apps. You will be redirected to /portal automatically.',
    note: 'If automatic redirect does not happen, use one of the links below.',
    timer: (secondsLeft) => `Redirecting in ${secondsLeft}s`
  }
};

function detectLocale() {
  return navigator.language.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

function applyLocale(locale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
}

function renderLinks(locale) {
  const actions = document.getElementById('legacy-actions');
  if (!actions) return;

  actions.innerHTML = links
    .map(
      (link) =>
        `<a class="link" href="${link.href}">${locale === 'ar' ? link.labelAr : link.labelEn}</a>`
    )
    .join('');
}

function renderStaticCopy(locale, secondsLeft) {
  const copy = translations[locale];

  document.getElementById('legacy-badge').textContent = copy.badge;
  document.getElementById('legacy-eyebrow').textContent = copy.eyebrow;
  document.getElementById('legacy-title').textContent = copy.title;
  document.getElementById('legacy-description').textContent = copy.description;
  document.getElementById('legacy-note').textContent = copy.note;
  document.getElementById('legacy-timer').textContent = copy.timer(secondsLeft);
}

function init() {
  const locale = detectLocale();
  applyLocale(locale);
  renderLinks(locale);

  let secondsLeft = DEFAULT_REDIRECT_SECONDS;
  renderStaticCopy(locale, secondsLeft);

  const interval = window.setInterval(() => {
    secondsLeft -= 1;
    renderStaticCopy(locale, Math.max(secondsLeft, 0));

    if (secondsLeft <= 0) {
      window.clearInterval(interval);
      window.location.assign('/portal');
    }
  }, 1000);
}

init();
