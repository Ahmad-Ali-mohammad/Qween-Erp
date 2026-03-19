import { useEffect, useState } from 'react';

const DEFAULT_REDIRECT_SECONDS = 5;

const primaryLinks = [
  { href: '/portal', labelAr: 'الانتقال إلى البوابة المركزية', labelEn: 'Open Control Center' },
  { href: '/systems/projects', labelAr: 'فتح نظام المشاريع', labelEn: 'Open Projects System' },
  { href: '/systems/accounting', labelAr: 'فتح نظام المحاسبة', labelEn: 'Open Accounting System' }
];

export default function App() {
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_REDIRECT_SECONDS);
  const locale = navigator.language.toLowerCase().startsWith('ar') ? 'ar' : 'en';
  const direction = locale === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
  }, [direction, locale]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(interval);
          window.location.assign('/portal');
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const copy =
    locale === 'ar'
      ? {
          eyebrow: 'Legacy Web',
          title: 'هذه الواجهة القديمة أصبحت طبقة انتقالية فقط',
          description:
            'تم نقل الاستخدام التشغيلي الرسمي إلى البوابة المركزية والأنظمة المستقلة. سيتم تحويلك تلقائياً إلى /portal.',
          timer: `إعادة التوجيه خلال ${secondsLeft} ثانية`,
          note: 'إذا لم يتم التحويل تلقائياً، استخدم أحد الروابط التالية.',
          badge: 'وضع انتقال مرحلي'
        }
      : {
          eyebrow: 'Legacy Web',
          title: 'This legacy web app is now a transition layer only',
          description:
            'Operational use has moved to the control center and independent system apps. You will be redirected to /portal automatically.',
          timer: `Redirecting in ${secondsLeft}s`,
          note: 'If automatic redirect does not happen, use one of the links below.',
          badge: 'Transition Mode'
        };

  return (
    <main className={`legacy-landing ${direction}`}>
      <section className="legacy-panel">
        <span className="legacy-badge">{copy.badge}</span>
        <p className="legacy-eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className="legacy-description">{copy.description}</p>
        <div className="legacy-timer">{copy.timer}</div>
        <p className="legacy-note">{copy.note}</p>

        <div className="legacy-actions">
          {primaryLinks.map((link) => (
            <a key={link.href} className="legacy-link" href={link.href}>
              {locale === 'ar' ? link.labelAr : link.labelEn}
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
