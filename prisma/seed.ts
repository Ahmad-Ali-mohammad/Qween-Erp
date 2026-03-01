import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PERMISSIONS } from '../src/constants/permissions';

const prisma = new PrismaClient();

async function seedRolesAndAdmin() {
  const allPermissions = Object.values(PERMISSIONS).reduce<Record<string, boolean>>((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});

  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {
      nameAr: 'Ù…Ø¯ÙŠØ± Ø§Ù„Ù†Ø¸Ø§Ù…',
      permissions: allPermissions as unknown as object,
      isSystem: true
    },
    create: {
      name: 'admin',
      nameAr: 'Ù…Ø¯ÙŠØ± Ø§Ù„Ù†Ø¸Ø§Ù…',
      description: 'ØµÙ„Ø§Ø­ÙŠØ§Øª ÙƒØ§Ù…Ù„Ø©',
      permissions: allPermissions as unknown as object,
      isSystem: true
    }
  });

  const password = await bcrypt.hash('admin123', 12);

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      email: 'admin@erp.local',
      fullName: 'System Admin',
      password,
      roleId: adminRole.id,
      isActive: true
    },
    create: {
      username: 'admin',
      email: 'admin@erp.local',
      fullName: 'System Admin',
      password,
      roleId: adminRole.id,
      isActive: true
    }
  });
}

async function seedCompany() {
  await prisma.companyProfile.upsert({
    where: { id: 1 },
    update: {
      nameAr: 'Ø´Ø±ÙƒØ© ÙˆØ§Ø­Ø¯Ø©',
      nameEn: 'Single Company ERP',
      currency: 'SAR'
    },
    create: {
      id: 1,
      nameAr: 'Ø´Ø±ÙƒØ© ÙˆØ§Ø­Ø¯Ø©',
      nameEn: 'Single Company ERP',
      currency: 'SAR'
    }
  });

  await prisma.systemSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      allowNegativeStock: false,
      requireApproval: true,
      approvalThreshold: 10000,
      invoicePrefix: 'INV',
      quotePrefix: 'QT'
    }
  });
}

async function seedFiscalYear() {
  const year = new Date().getFullYear();

  const fy = await prisma.fiscalYear.upsert({
    where: { name: String(year) },
    update: {
      isCurrent: true
    },
    create: {
      name: String(year),
      startDate: new Date(`${year}-01-01T00:00:00.000Z`),
      endDate: new Date(`${year}-12-31T23:59:59.000Z`),
      status: 'OPEN',
      isCurrent: true
    }
  });

  const monthNames = [
    'ÙŠÙ†Ø§ÙŠØ±', 'ÙØ¨Ø±Ø§ÙŠØ±', 'Ù…Ø§Ø±Ø³', 'Ø£Ø¨Ø±ÙŠÙ„', 'Ù…Ø§ÙŠÙˆ', 'ÙŠÙˆÙ†ÙŠÙˆ',
    'ÙŠÙˆÙ„ÙŠÙˆ', 'Ø£ØºØ³Ø·Ø³', 'Ø³Ø¨ØªÙ…Ø¨Ø±', 'Ø£ÙƒØªÙˆØ¨Ø±', 'Ù†ÙˆÙÙ…Ø¨Ø±', 'Ø¯ÙŠØ³Ù…Ø¨Ø±'
  ];

  for (let i = 0; i < 12; i += 1) {
    const startDate = new Date(Date.UTC(year, i, 1));
    const endDate = new Date(Date.UTC(year, i + 1, 0, 23, 59, 59));

    await prisma.accountingPeriod.upsert({
      where: {
        fiscalYearId_number: {
          fiscalYearId: fy.id,
          number: i + 1
        }
      },
      update: {
        name: monthNames[i],
        startDate,
        endDate,
        status: 'OPEN',
        canPost: true
      },
      create: {
        fiscalYearId: fy.id,
        number: i + 1,
        name: monthNames[i],
        startDate,
        endDate,
        status: 'OPEN',
        canPost: true
      }
    });
  }
}

async function seedAccounts() {
  const accounts = [
    { code: '1000', nameAr: 'Ø§Ù„Ø£ØµÙˆÙ„', type: 'ASSET', level: 1, allowPosting: false, normalBalance: 'Debit' },
    { code: '1100', nameAr: 'Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚', type: 'ASSET', level: 2, allowPosting: true, normalBalance: 'Debit', parentCode: '1000' },
    { code: '1200', nameAr: 'Ø§Ù„Ø¨Ù†Ùƒ', type: 'ASSET', level: 2, allowPosting: true, normalBalance: 'Debit', parentCode: '1000' },
    { code: '1300', nameAr: 'Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡', type: 'ASSET', level: 2, allowPosting: true, normalBalance: 'Debit', parentCode: '1000' },

    { code: '2000', nameAr: 'Ø§Ù„Ø®ØµÙˆÙ…', type: 'LIABILITY', level: 1, allowPosting: false, normalBalance: 'Credit' },
    { code: '2100', nameAr: 'Ø§Ù„Ù…ÙˆØ±Ø¯ÙˆÙ†', type: 'LIABILITY', level: 2, allowPosting: true, normalBalance: 'Credit', parentCode: '2000' },
    { code: '2200', nameAr: 'Ø¶Ø±ÙŠØ¨Ø© Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ù…Ø¶Ø§ÙØ© Ø§Ù„Ù…Ø³ØªØ­Ù‚Ø©', type: 'LIABILITY', level: 2, allowPosting: true, normalBalance: 'Credit', parentCode: '2000' },

    { code: '3000', nameAr: 'Ø­Ù‚ÙˆÙ‚ Ø§Ù„Ù…Ù„ÙƒÙŠØ©', type: 'EQUITY', level: 1, allowPosting: false, normalBalance: 'Credit' },
    { code: '3100', nameAr: 'Ø±Ø£Ø³ Ø§Ù„Ù…Ø§Ù„', type: 'EQUITY', level: 2, allowPosting: true, normalBalance: 'Credit', parentCode: '3000' },

    { code: '4000', nameAr: 'Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª', type: 'REVENUE', level: 1, allowPosting: false, normalBalance: 'Credit' },
    { code: '4100', nameAr: 'Ø¥ÙŠØ±Ø§Ø¯ Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª', type: 'REVENUE', level: 2, allowPosting: true, normalBalance: 'Credit', parentCode: '4000' },

    { code: '5000', nameAr: 'Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª', type: 'EXPENSE', level: 1, allowPosting: false, normalBalance: 'Debit' },
    { code: '5100', nameAr: 'Ù…ØµØ±ÙˆÙØ§Øª ØªØ´ØºÙŠÙ„ÙŠØ©', type: 'EXPENSE', level: 2, allowPosting: true, normalBalance: 'Debit', parentCode: '5000' }
  ];

  const idByCode = new Map<string, number>();

  for (const acc of accounts.filter((a) => !a.parentCode)) {
    const saved = await prisma.account.upsert({
      where: { code: acc.code },
      update: {
        nameAr: acc.nameAr,
        type: acc.type as any,
        level: acc.level,
        allowPosting: acc.allowPosting,
        normalBalance: acc.normalBalance,
        isControl: !acc.allowPosting
      },
      create: {
        code: acc.code,
        nameAr: acc.nameAr,
        type: acc.type as any,
        level: acc.level,
        allowPosting: acc.allowPosting,
        normalBalance: acc.normalBalance,
        isControl: !acc.allowPosting
      }
    });

    idByCode.set(saved.code, saved.id);
  }

  for (const acc of accounts.filter((a) => a.parentCode)) {
    const parentId = idByCode.get(acc.parentCode!);
    if (!parentId) continue;

    const saved = await prisma.account.upsert({
      where: { code: acc.code },
      update: {
        nameAr: acc.nameAr,
        type: acc.type as any,
        level: acc.level,
        parentId,
        allowPosting: acc.allowPosting,
        normalBalance: acc.normalBalance,
        isControl: !acc.allowPosting
      },
      create: {
        code: acc.code,
        nameAr: acc.nameAr,
        type: acc.type as any,
        level: acc.level,
        parentId,
        allowPosting: acc.allowPosting,
        normalBalance: acc.normalBalance,
        isControl: !acc.allowPosting
      }
    });

    idByCode.set(saved.code, saved.id);
  }

  const bankGl = idByCode.get('1200') ?? null;

  await prisma.bankAccount.upsert({
    where: { accountNumber: '000100200300' },
    update: {
      name: 'Ø§Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¨Ù†ÙƒÙŠ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ',
      bankName: 'Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ù…Ø­Ù„ÙŠ',
      glAccountId: bankGl,
      currentBalance: 0
    },
    create: {
      name: 'Ø§Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¨Ù†ÙƒÙŠ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ',
      accountNumber: '000100200300',
      bankName: 'Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ù…Ø­Ù„ÙŠ',
      glAccountId: bankGl,
      currentBalance: 0
    }
  });

  await prisma.assetCategory.upsert({
    where: { code: 'AST-GEN' },
    update: {
      nameAr: 'Ø£ØµÙˆÙ„ Ø¹Ø§Ù…Ø©',
      usefulLifeMonths: 60
    },
    create: {
      code: 'AST-GEN',
      nameAr: 'Ø£ØµÙˆÙ„ Ø¹Ø§Ù…Ø©',
      usefulLifeMonths: 60,
      salvagePercent: 0
    }
  });

  await prisma.taxCode.upsert({
    where: { code: 'VAT15' },
    update: {
      nameAr: 'Ø¶Ø±ÙŠØ¨Ø© Ù‚ÙŠÙ…Ø© Ù…Ø¶Ø§ÙØ© 15%',
      type: 'VAT',
      rate: 15
    },
    create: {
      code: 'VAT15',
      nameAr: 'Ø¶Ø±ÙŠØ¨Ø© Ù‚ÙŠÙ…Ø© Ù…Ø¶Ø§ÙØ© 15%',
      type: 'VAT',
      rate: 15,
      isRecoverable: true
    }
  });
}

async function main() {
  await seedRolesAndAdmin();
  await seedCompany();
  await seedFiscalYear();
  await seedAccounts();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('Seed completed');
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

