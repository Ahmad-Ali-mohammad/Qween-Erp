import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';
import { emitAccountingEvent } from './events';

export type TaxDeclarationInput = {
  periodStart: string;
  periodEnd: string;
  type: 'VAT' | 'WHT';
  totalSales: number;
  totalPurchases: number;
  outputTax: number;
  inputTax: number;
  notes?: string;
};

export type PostTaxDeclarationInput = {
  journalDate?: string;
  reference?: string;
  description?: string;
};

function parseDateOrThrow(value: string, fieldName: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw Errors.validation(`${fieldName} غير صالح`);
  }
  return date;
}

export async function postTaxDeclaration(
  declarationId: number,
  userId: number,
  input: PostTaxDeclarationInput
) {
  const declaration = await prisma.taxDeclaration.findUnique({
    where: { id: declarationId }
  });

  if (!declaration) {
    throw Errors.notFound('الإقرار الضريبي غير موجود');
  }

  if (declaration.status !== 'DRAFT') {
    throw Errors.business('لا يمكن ترحيل إقرار غير مسودة');
  }

  const netPayable = Number(declaration.outputTax) - Number(declaration.inputTax);
  const taxType = declaration.type;

  // Validate netPayable is not zero to avoid unbalanced journal
  if (Math.abs(netPayable) < 0.001) {
    throw Errors.business('لا يمكن ترحيل إقرار بمبلغ صفر');
  }

  const journalDate = input.journalDate
    ? parseDateOrThrow(input.journalDate, 'journalDate')
    : new Date();

  const description = input.description || `إقرار ضريبي ${taxType} - ${declaration.periodStart.toLocaleDateString()} إلى ${declaration.periodEnd.toLocaleDateString()}`;

  const result = await prisma.$transaction(async (tx) => {
    const journalEntry = await tx.journalEntry.create({
      data: {
        entryNumber: `TAX-${declaration.id}`,
        date: journalDate,
        description,
        reference: input.reference || `TAX-${declaration.id}`,
        source: 'MANUAL',
        status: 'POSTED',
        totalDebit: Math.abs(netPayable),
        totalCredit: Math.abs(netPayable),
        createdById: userId,
        postedById: userId,
        postedAt: new Date()
      }
    });

    // Use exact account code match instead of startsWith to avoid matching wrong accounts
    const taxPayableAccount = await tx.account.findFirst({
      where: { code: taxType === 'VAT' ? '2101' : '2102' }
    });

    const taxExpenseAccount = await tx.account.findFirst({
      where: { code: taxType === 'VAT' ? '6101' : '6102' }
    });

    if (!taxPayableAccount || !taxExpenseAccount) {
      throw Errors.business('حسابات الضريبة غير مكونة');
    }

    await tx.journalLine.createMany({
      data: [
        {
          entryId: journalEntry.id,
          lineNumber: 1,
          accountId: netPayable > 0 ? taxPayableAccount.id : taxExpenseAccount.id,
          description: `ضريبة ${taxType === 'VAT' ? 'القيمة المضافة' : 'الاستقطاع'} المستحقة`,
          debit: netPayable > 0 ? Math.abs(netPayable) : 0,
          credit: netPayable < 0 ? Math.abs(netPayable) : 0
        },
        {
          entryId: journalEntry.id,
          lineNumber: 2,
          accountId: netPayable > 0 ? taxExpenseAccount.id : taxPayableAccount.id,
          description: `ضريبة ${taxType === 'VAT' ? 'القيمة المضافة' : 'الاستقطاع'} المدخلة`,
          debit: netPayable < 0 ? Math.abs(netPayable) : 0,
          credit: netPayable > 0 ? Math.abs(netPayable) : 0
        }
      ]
    });

    const updatedDeclaration = await tx.taxDeclaration.update({
      where: { id: declarationId },
      data: {
        status: 'FILED',
        filedDate: new Date(),
        netPayable: Math.abs(netPayable)
      }
    });

    await tx.auditLog.create({
      data: {
        userId,
        table: 'tax_declarations',
        recordId: declarationId,
        action: 'POSTED',
        newValue: {
          declarationId,
          journalEntryId: journalEntry.id,
          netPayable,
          taxType
        }
      }
    });

    return {
      declaration: updatedDeclaration,
      journalEntryId: journalEntry.id,
      netPayable
    };
  });

  emitAccountingEvent('tax.declaration.posted', {
    recordId: declarationId,
    userId,
    journalEntryId: result.journalEntryId,
    netPayable: result.netPayable,
    taxType: declaration.type
  });

  return {
    success: true,
    message: 'تم ترحيل الإقرار الضريبي بنجاح',
    data: result
  };
}

export async function calculateTaxDeclaration(periodStart: string, periodEnd: string, type: 'VAT' | 'WHT') {
  const start = parseDateOrThrow(periodStart, 'periodStart');
  const end = parseDateOrThrow(periodEnd, 'periodEnd');

  const invoices = await prisma.invoice.findMany({
    where: {
      date: { gte: start, lte: end },
      status: { not: 'CANCELLED' }
    },
    select: {
      type: true,
      taxableAmount: true,
      vatAmount: true,
      withholdingTax: true
    }
  });

  const salesInvoices = invoices.filter((inv) => inv.type === 'SALES');
  const purchaseInvoices = invoices.filter((inv) => inv.type === 'PURCHASE');

  const totalSales = salesInvoices.reduce((sum, inv) => sum + Number(inv.taxableAmount), 0);
  const totalPurchases = purchaseInvoices.reduce((sum, inv) => sum + Number(inv.taxableAmount), 0);

  let outputTax = 0;
  let inputTax = 0;

  if (type === 'VAT') {
    outputTax = salesInvoices.reduce((sum, inv) => sum + Number(inv.vatAmount), 0);
    inputTax = purchaseInvoices.reduce((sum, inv) => sum + Number(inv.vatAmount), 0);
  } else {
    outputTax = salesInvoices.reduce((sum, inv) => sum + Number(inv.withholdingTax), 0);
    inputTax = purchaseInvoices.reduce((sum, inv) => sum + Number(inv.withholdingTax), 0);
  }

  const netPayable = outputTax - inputTax;

  return {
    periodStart,
    periodEnd,
    type,
    totalSales,
    totalPurchases,
    outputTax,
    inputTax,
    netPayable: Math.abs(netPayable),
    payableToAuthority: netPayable > 0
  };
}
