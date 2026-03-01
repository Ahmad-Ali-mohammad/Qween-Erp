export const ar = {
  app: {
    systemName: 'ERP SYSTEM',
    companyType: 'شركة واحدة',
    navAriaLabel: 'التنقل الرئيسي',
    logout: 'تسجيل الخروج',
    menu: 'القائمة',
    defaultTitle: 'لوحة التحكم',
    guestUser: 'زائر',
    confirmTitle: 'تأكيد',
    confirmMessage: 'هل أنت متأكد؟',
    cancel: 'إلغاء',
    ok: 'تأكيد'
  },
  nav: {
    quickActions: 'المدخل السريع',
    dashboard: 'لوحة التحكم',
    accounting: 'المحاسبة',
    sales: 'المبيعات',
    purchasing: 'المشتريات',
    inventory: 'المخزون',
    fixedAssets: 'الأصول الثابتة',
    banking: 'البنوك والخزينة',
    budgets: 'الموازنات',
    tax: 'الضرائب',
    currencies: 'العملات',
    reports: 'التقارير',
    administration: 'الإدارة',
    help: 'المساعدة والدعم',
    profile: 'الملف الشخصي'
  },
  common: {
    saveSuccess: 'تم الحفظ بنجاح',
    requestFailed: 'حدث خطأ أثناء التنفيذ',
    confirmAction: 'تأكيد الإجراء',
    currency: 'ريال',
    draft: 'مسودة',
    pending: 'معلق',
    posted: 'مرحل',
    issued: 'صادرة',
    paid: 'مدفوعة',
    partial: 'مدفوعة جزئياً',
    completed: 'مكتملة',
    cancelled: 'ملغاة',
    closed: 'مغلقة',
    open: 'مفتوحة',
    active: 'نشط',
    void: 'ملغى',
    reversed: 'معكوس'
  },
  shells: {
    moduleInProgress: 'هذه الوحدة قيد التنفيذ وسيتم تفعيلها تدريجياً حسب الخطة.',
    listTitle: 'قائمة السجلات',
    formTitle: 'نموذج الإدخال',
    detailsTitle: 'التفاصيل',
    plannedFlows: 'التدفقات المخططة',
    noData: 'لا توجد بيانات حالياً'
  }
};

export function t(path, fallback = '') {
  if (!path) return fallback;
  const parts = String(path).split('.');
  let current = ar;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return fallback || path;
    }
    current = current[part];
  }
  return typeof current === 'string' ? current : fallback || path;
}
