export const JournalStatus = ['DRAFT', 'PENDING', 'POSTED', 'VOID', 'REVERSED'] as const;
export const InvoiceStatus = ['DRAFT', 'ISSUED', 'PAID', 'PARTIAL', 'CANCELLED'] as const;
export const PaymentStatus = ['PENDING', 'COMPLETED', 'CANCELLED', 'BOUNCED'] as const;
export const FiscalYearStatus = ['OPEN', 'CLOSED', 'ADJUSTING'] as const;
export const PeriodStatus = ['OPEN', 'CLOSED'] as const;
export const AssetStatus = ['ACTIVE', 'MAINTENANCE', 'SOLD', 'SCRAPPED'] as const;
