export const printingEntityTypes = [
  'project',
  'purchase_order',
  'invoice',
  'payroll_run',
  'payment',
  'journal_entry',
  'stock_movement',
  'stock_count',
  'maintenance_log'
] as const;

export type PrintingEntityType = (typeof printingEntityTypes)[number];

export type DefaultDocumentTemplate = {
  key: string;
  entityType: PrintingEntityType;
  nameAr: string;
  nameEn: string;
  content: string;
  sampleData: Record<string, unknown>;
};

export const defaultDocumentTemplates: DefaultDocumentTemplate[] = [
  {
    key: 'default.project.summary',
    entityType: 'project',
    nameAr: 'قالب افتراضي لملخص المشروع',
    nameEn: 'Default Project Summary',
    content: `
<section style="font-family: Arial, sans-serif; color: #0f172a;">
  <header style="display:flex; justify-content:space-between; border-bottom:2px solid #0f766e; padding-bottom:12px; margin-bottom:20px;">
    <div>
      <h1 style="margin:0;">{{company.nameAr}}</h1>
      <p style="margin:6px 0 0;">Project Summary</p>
    </div>
    <div style="text-align:right;">
      <strong>{{document.code}}</strong>
      <div>{{document.dateDisplay}}</div>
    </div>
  </header>
  <h2 style="margin-top:0;">{{document.name}}</h2>
  <p>Status: {{document.status}} | Branch: {{branch.nameAr}}</p>
  <p>Budget: {{summary.totalBudgetDisplay}} KWD | Actual Cost: {{summary.actualCostDisplay}} KWD | Variance: {{summary.varianceDisplay}} KWD</p>
  <table style="width:100%; border-collapse:collapse; margin-top:18px;">
    <thead>
      <tr style="background:#e2e8f0;">
        <th style="padding:8px; text-align:left;">Phase</th>
        <th style="padding:8px; text-align:left;">Status</th>
        <th style="padding:8px; text-align:left;">Budget</th>
        <th style="padding:8px; text-align:left;">Actual</th>
      </tr>
    </thead>
    <tbody>
      {{#each phases}}
      <tr>
        <td style="padding:8px; border-bottom:1px solid #e2e8f0;">{{name}}</td>
        <td style="padding:8px; border-bottom:1px solid #e2e8f0;">{{status}}</td>
        <td style="padding:8px; border-bottom:1px solid #e2e8f0;">{{budgetDisplay}}</td>
        <td style="padding:8px; border-bottom:1px solid #e2e8f0;">{{actualCostDisplay}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
</section>`.trim(),
    sampleData: {
      company: { nameAr: 'ERP Qween Contracting' },
      branch: { nameAr: 'Main Branch' },
      document: { code: 'PRJ-001', name: 'Airport Renovation', status: 'ACTIVE', dateDisplay: 'Mar 8, 2026' },
      summary: { totalBudgetDisplay: '125,000.000', actualCostDisplay: '78,500.500', varianceDisplay: '46,499.500' },
      phases: [
        { name: 'Civil Works', status: 'ACTIVE', budgetDisplay: '60,000.000', actualCostDisplay: '35,250.000' },
        { name: 'Finishing', status: 'PLANNED', budgetDisplay: '65,000.000', actualCostDisplay: '43,250.500' }
      ]
    }
  },
  {
    key: 'default.purchase_order.standard',
    entityType: 'purchase_order',
    nameAr: 'قالب افتراضي لأمر الشراء',
    nameEn: 'Default Purchase Order',
    content: `
<section style="font-family: Arial, sans-serif; color: #111827;">
  <header style="display:flex; justify-content:space-between; border-bottom:2px solid #0f172a; padding-bottom:12px; margin-bottom:20px;">
    <div>
      <h1 style="margin:0;">Purchase Order</h1>
      <p style="margin:6px 0 0;">{{company.nameAr}}</p>
    </div>
    <div style="text-align:right;">
      <strong>{{document.number}}</strong>
      <div>{{document.dateDisplay}}</div>
    </div>
  </header>
  <p>Supplier: {{supplier.name}}</p>
  <p>Project: {{project.name}}</p>
  <table style="width:100%; border-collapse:collapse; margin-top:18px;">
    <thead>
      <tr style="background:#ecfeff;">
        <th style="padding:8px; text-align:left;">Description</th>
        <th style="padding:8px; text-align:left;">Qty</th>
        <th style="padding:8px; text-align:left;">Unit Price</th>
        <th style="padding:8px; text-align:left;">Total</th>
      </tr>
    </thead>
    <tbody>
      {{#each lines}}
      <tr>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{description}}</td>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{quantityDisplay}}</td>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{unitPriceDisplay}}</td>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{totalDisplay}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <p style="margin-top:18px;"><strong>Total:</strong> {{document.totalDisplay}} KWD</p>
</section>`.trim(),
    sampleData: {
      company: { nameAr: 'ERP Qween Contracting' },
      document: { number: 'PO-202603-0001', dateDisplay: 'Mar 8, 2026', totalDisplay: '3,220.500' },
      supplier: { name: 'Al Noor Supplies' },
      project: { name: 'Airport Renovation' },
      lines: [
        { description: 'Steel bars', quantityDisplay: '20.000', unitPriceDisplay: '95.000', totalDisplay: '2,185.000' },
        { description: 'Safety gear', quantityDisplay: '15.000', unitPriceDisplay: '60.000', totalDisplay: '1,035.500' }
      ]
    }
  },
  {
    key: 'default.invoice.standard',
    entityType: 'invoice',
    nameAr: 'قالب افتراضي للفاتورة',
    nameEn: 'Default Invoice',
    content: `
<section style="font-family: Arial, sans-serif; color: #111827;">
  <header style="display:flex; justify-content:space-between; border-bottom:2px solid #1d4ed8; padding-bottom:12px; margin-bottom:20px;">
    <div>
      <h1 style="margin:0;">{{document.title}}</h1>
      <p style="margin:6px 0 0;">{{company.nameAr}}</p>
    </div>
    <div style="text-align:right;">
      <strong>{{document.number}}</strong>
      <div>{{document.dateDisplay}}</div>
    </div>
  </header>
  <p>Party: {{party.name}}</p>
  <p>Status: {{document.status}} | Project: {{project.name}}</p>
  <table style="width:100%; border-collapse:collapse; margin-top:18px;">
    <thead>
      <tr style="background:#dbeafe;">
        <th style="padding:8px; text-align:left;">Description</th>
        <th style="padding:8px; text-align:left;">Qty</th>
        <th style="padding:8px; text-align:left;">Unit Price</th>
        <th style="padding:8px; text-align:left;">Tax</th>
        <th style="padding:8px; text-align:left;">Total</th>
      </tr>
    </thead>
    <tbody>
      {{#each lines}}
      <tr>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{description}}</td>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{quantityDisplay}}</td>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{unitPriceDisplay}}</td>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{taxAmountDisplay}}</td>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{totalDisplay}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <p style="margin-top:18px;"><strong>Total:</strong> {{document.totalDisplay}} KWD</p>
</section>`.trim(),
    sampleData: {
      company: { nameAr: 'ERP Qween Contracting' },
      document: { title: 'Sales Invoice', number: 'INV-2026-0001', dateDisplay: 'Mar 8, 2026', status: 'ISSUED', totalDisplay: '5,290.750' },
      party: { name: 'Kuwait Build Co.' },
      project: { name: 'Airport Renovation' },
      lines: [
        { description: 'Consulting service', quantityDisplay: '1.000', unitPriceDisplay: '4,600.000', taxAmountDisplay: '690.750', totalDisplay: '5,290.750' }
      ]
    }
  },
  {
    key: 'default.payroll_run.standard',
    entityType: 'payroll_run',
    nameAr: 'قالب افتراضي لكشف الرواتب',
    nameEn: 'Default Payroll Run',
    content: `
<section style="font-family: Arial, sans-serif; color: #111827;">
  <header style="display:flex; justify-content:space-between; border-bottom:2px solid #7c3aed; padding-bottom:12px; margin-bottom:20px;">
    <div>
      <h1 style="margin:0;">Payroll Run</h1>
      <p style="margin:6px 0 0;">{{company.nameAr}}</p>
    </div>
    <div style="text-align:right;">
      <strong>{{document.code}}</strong>
      <div>{{document.periodLabel}}</div>
    </div>
  </header>
  <p>Branch: {{branch.nameAr}} | Status: {{document.status}}</p>
  <table style="width:100%; border-collapse:collapse; margin-top:18px;">
    <thead>
      <tr style="background:#ede9fe;">
        <th style="padding:8px; text-align:left;">Employee</th>
        <th style="padding:8px; text-align:left;">Basic</th>
        <th style="padding:8px; text-align:left;">Allowances</th>
        <th style="padding:8px; text-align:left;">Deductions</th>
        <th style="padding:8px; text-align:left;">Net</th>
      </tr>
    </thead>
    <tbody>
      {{#each lines}}
      <tr>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{employeeName}}</td>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{basicSalaryDisplay}}</td>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{allowancesDisplay}}</td>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{deductionsDisplay}}</td>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{netSalaryDisplay}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <p style="margin-top:18px;"><strong>Net Total:</strong> {{document.netTotalDisplay}} KWD</p>
</section>`.trim(),
    sampleData: {
      company: { nameAr: 'ERP Qween Contracting' },
      branch: { nameAr: 'Main Branch' },
      document: { code: 'PAY-2026-03', periodLabel: 'March 2026', status: 'POSTED', netTotalDisplay: '4,800.000' },
      lines: [
        { employeeName: 'Ahmad Salem', basicSalaryDisplay: '2,000.000', allowancesDisplay: '200.000', deductionsDisplay: '50.000', netSalaryDisplay: '2,150.000' },
        { employeeName: 'Sara Jaber', basicSalaryDisplay: '2,400.000', allowancesDisplay: '350.000', deductionsDisplay: '100.000', netSalaryDisplay: '2,650.000' }
      ]
    }
  },

  {
    key: 'default.payment.voucher',
    entityType: 'payment',
    nameAr: '???? ??????? ???? ???/???',
    nameEn: 'Default Payment Voucher',
    content: `
<section style="font-family: Arial, sans-serif; color: #0f172a;">
  <header style="display:flex; justify-content:space-between; border-bottom:2px solid #0ea5e9; padding-bottom:12px; margin-bottom:20px;">
    <div>
      <h1 style="margin:0;">{{document.typeLabel}}</h1>
      <p style="margin:6px 0 0;">{{company.nameAr}}</p>
    </div>
    <div style="text-align:right;">
      <strong>{{document.number}}</strong>
      <div>{{document.dateDisplay}}</div>
    </div>
  </header>
  <p>?????: {{party.name}}</p>
  <p>????? ??????: {{document.methodLabel}}</p>
  <p>??????: {{document.status}}</p>
  <p><strong>??????:</strong> {{document.amountDisplay}} {{document.currency}}</p>
  <div style="margin-top:16px;">
    <table style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="background:#e0f2fe;">
          <th style="padding:8px; text-align:left;">Invoice</th>
          <th style="padding:8px; text-align:left;">Allocated</th>
        </tr>
      </thead>
      <tbody>
        {{#each allocations}}
        <tr>
          <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{invoiceNumber}}</td>
          <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{amountDisplay}}</td>
        </tr>
        {{/each}}
      </tbody>
    </table>
  </div>
  <p style="margin-top:14px;">{{document.description}}</p>
</section>`.trim(),
    sampleData: {
      company: { nameAr: 'ERP Qween Contracting' },
      party: { name: 'Kuwait Build Co.' },
      document: {
        typeLabel: '??? ???',
        number: 'RCV-2026-0003',
        dateDisplay: 'Mar 10, 2026',
        methodLabel: '????',
        status: 'PENDING',
        amountDisplay: '2,450.000',
        currency: 'KWD',
        description: '??? ??? ????? ??????'
      },
      allocations: [{ invoiceNumber: 'INV-2026-0004', amountDisplay: '2,450.000' }]
    }
  },
  {
    key: 'default.journal_entry.standard',
    entityType: 'journal_entry',
    nameAr: '???? ??????? ?????? ???????',
    nameEn: 'Default Journal Entry',
    content: `
<section style="font-family: Arial, sans-serif; color: #111827;">
  <header style="display:flex; justify-content:space-between; border-bottom:2px solid #1d4ed8; padding-bottom:12px; margin-bottom:20px;">
    <div>
      <h1 style="margin:0;">??? ????</h1>
      <p style="margin:6px 0 0;">{{company.nameAr}}</p>
    </div>
    <div style="text-align:right;">
      <strong>{{document.entryNumber}}</strong>
      <div>{{document.dateDisplay}}</div>
    </div>
  </header>
  <p>?????: {{document.description}}</p>
  <p>??????: {{document.reference}}</p>
  <table style="width:100%; border-collapse:collapse; margin-top:18px;">
    <thead>
      <tr style="background:#dbeafe;">
        <th style="padding:8px; text-align:left;">??????</th>
        <th style="padding:8px; text-align:left;">????</th>
        <th style="padding:8px; text-align:left;">????</th>
      </tr>
    </thead>
    <tbody>
      {{#each lines}}
      <tr>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{accountLabel}}</td>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{debitDisplay}}</td>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{creditDisplay}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <p style="margin-top:18px;"><strong>???????? ??????:</strong> {{document.totalDebitDisplay}}</p>
  <p><strong>???????? ??????:</strong> {{document.totalCreditDisplay}}</p>
</section>`.trim(),
    sampleData: {
      company: { nameAr: 'ERP Qween Contracting' },
      document: {
        entryNumber: 'JE-2026-0012',
        dateDisplay: 'Mar 10, 2026',
        description: '??????? ???????',
        reference: 'EXP-2026-03',
        totalDebitDisplay: '1,250.000',
        totalCreditDisplay: '1,250.000'
      },
      lines: [
        { accountLabel: '6100 - Operating Expenses', debitDisplay: '1,250.000', creditDisplay: '0.000' },
        { accountLabel: '1010 - Cash', debitDisplay: '0.000', creditDisplay: '1,250.000' }
      ]
    }
  },
  {
    key: 'default.stock_movement.issue',
    entityType: 'stock_movement',
    nameAr: '???? ??????? ???? ???/??????',
    nameEn: 'Default Stock Movement',
    content: `
<section style="font-family: Arial, sans-serif; color: #0f172a;">
  <header style="display:flex; justify-content:space-between; border-bottom:2px solid #0f766e; padding-bottom:12px; margin-bottom:20px;">
    <div>
      <h1 style="margin:0;">{{document.typeLabel}}</h1>
      <p style="margin:6px 0 0;">{{company.nameAr}}</p>
    </div>
    <div style="text-align:right;">
      <strong>{{document.reference}}</strong>
      <div>{{document.dateDisplay}}</div>
    </div>
  </header>
  <p>??????: {{warehouse.name}}</p>
  <p>?????: {{item.name}}</p>
  <p>??????: {{document.quantityDisplay}}</p>
  <p>????? ??????: {{document.unitCostDisplay}}</p>
  <p>????????: {{document.totalCostDisplay}}</p>
  <p>???????: {{project.name}}</p>
  <p>?????????: {{document.notes}}</p>
</section>`.trim(),
    sampleData: {
      company: { nameAr: 'ERP Qween Contracting' },
      warehouse: { name: 'Main Warehouse' },
      item: { name: 'Steel bars' },
      project: { name: 'Airport Renovation' },
      document: {
        typeLabel: '??? ??? ????',
        reference: 'ISS-2026-014',
        dateDisplay: 'Mar 9, 2026',
        quantityDisplay: '20.000',
        unitCostDisplay: '95.000',
        totalCostDisplay: '1,900.000',
        notes: '??? ??????'
      }
    }
  },
  {
    key: 'default.stock_count.report',
    entityType: 'stock_count',
    nameAr: '???? ??????? ????? ??? ???????',
    nameEn: 'Default Stock Count',
    content: `
<section style="font-family: Arial, sans-serif; color: #0f172a;">
  <header style="display:flex; justify-content:space-between; border-bottom:2px solid #7c3aed; padding-bottom:12px; margin-bottom:20px;">
    <div>
      <h1 style="margin:0;">???? ???</h1>
      <p style="margin:6px 0 0;">{{company.nameAr}}</p>
    </div>
    <div style="text-align:right;">
      <strong>{{document.number}}</strong>
      <div>{{document.dateDisplay}}</div>
    </div>
  </header>
  <p>??????: {{warehouse.name}}</p>
  <p>??????: {{document.status}}</p>
  <table style="width:100%; border-collapse:collapse; margin-top:18px;">
    <thead>
      <tr style="background:#ede9fe;">
        <th style="padding:8px; text-align:left;">?????</th>
        <th style="padding:8px; text-align:left;">?????? ???????</th>
        <th style="padding:8px; text-align:left;">?????? ???????</th>
        <th style="padding:8px; text-align:left;">?????</th>
      </tr>
    </thead>
    <tbody>
      {{#each lines}}
      <tr>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{itemName}}</td>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{theoreticalQtyDisplay}}</td>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{actualQtyDisplay}}</td>
        <td style="padding:8px; border-bottom:1px solid #e5e7eb;">{{differenceQtyDisplay}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
</section>`.trim(),
    sampleData: {
      company: { nameAr: 'ERP Qween Contracting' },
      warehouse: { name: 'Main Warehouse' },
      document: { number: 'SC-2026-002', dateDisplay: 'Mar 9, 2026', status: 'DRAFT' },
      lines: [
        { itemName: 'Steel bars', theoreticalQtyDisplay: '50.000', actualQtyDisplay: '48.000', differenceQtyDisplay: '-2.000' },
        { itemName: 'Safety helmets', theoreticalQtyDisplay: '100.000', actualQtyDisplay: '100.000', differenceQtyDisplay: '0.000' }
      ]
    }
  },
  {
    key: 'default.maintenance_log.order',
    entityType: 'maintenance_log',
    nameAr: '???? ??????? ???? ?????',
    nameEn: 'Default Maintenance Order',
    content: `
<section style="font-family: Arial, sans-serif; color: #111827;">
  <header style="display:flex; justify-content:space-between; border-bottom:2px solid #f97316; padding-bottom:12px; margin-bottom:20px;">
    <div>
      <h1 style="margin:0;">??? ?????</h1>
      <p style="margin:6px 0 0;">{{company.nameAr}}</p>
    </div>
    <div style="text-align:right;">
      <strong>#{{document.id}}</strong>
      <div>{{document.serviceDateDisplay}}</div>
    </div>
  </header>
  <p>??????: {{asset.name}}</p>
  <p>??????: {{supplier.name}}</p>
  <p>???????: {{project.name}}</p>
  <p>??????: {{document.status}}</p>
  <p><strong>????? ???????:</strong> {{document.costDisplay}}</p>
  <p>{{document.description}}</p>
</section>`.trim(),
    sampleData: {
      company: { nameAr: 'ERP Qween Contracting' },
      asset: { name: 'Excavator CAT 320' },
      supplier: { name: 'Al Noor Maintenance' },
      project: { name: 'Airport Renovation' },
      document: {
        id: 54,
        serviceDateDisplay: 'Mar 7, 2026',
        status: 'OPEN',
        costDisplay: '850.000',
        description: '????? ????? ??????'
      }
    }
  }

];
