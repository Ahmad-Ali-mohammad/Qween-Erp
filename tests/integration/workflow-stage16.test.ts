import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Stage 16 deep CRUD coverage (Sales + Purchasing)', () => {
  let token = '';
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('covers sales pages CRUD with real lifecycle actions', async () => {
    const customerCode = uniqueCode('CUS16S').toUpperCase();

    let customerId = 0;
    let contactId = 0;
    let quoteConvertedId = 0;
    let quoteDeletedId = 0;
    let invoicePaidId = 0;
    let invoiceCancelledId = 0;
    let invoiceReturnBaseId = 0;
    let receiptCompletedId = 0;
    let salesReturnId = 0;

    try {
      const customer = await request(app).post('/api/customers').set(auth()).send({
        code: customerCode,
        nameAr: 'Stage16 Sales Customer'
      });
      expect([200, 201]).toContain(customer.status);
      customerId = Number(customer.body.data.id);

      const customerContactCreate = await request(app).post(`/api/customers/${customerId}/contacts`).set(auth()).send({
        name: 'Sales Contact 16',
        email: 'sales16@erp.local',
        isPrimary: true
      });
      expect(customerContactCreate.status).toBe(201);
      contactId = Number(customerContactCreate.body.data.id);

      const customerContacts = await request(app).get(`/api/customers/${customerId}/contacts`).set(auth());
      expect(customerContacts.status).toBe(200);
      expect(Array.isArray(customerContacts.body.data)).toBe(true);

      const quotation = await request(app).post('/api/quotations').set(auth()).send({
        customerId,
        lines: [{ description: 'Quoted item', quantity: 2, unitPrice: 100, taxRate: 15 }]
      });
      expect(quotation.status).toBe(201);
      quoteConvertedId = Number(quotation.body.data.id);

      const quotationUpdate = await request(app).put(`/api/quotations/${quoteConvertedId}`).set(auth()).send({
        notes: 'updated quote',
        lines: [{ description: 'Quoted item updated', quantity: 2, unitPrice: 110, taxRate: 15 }]
      });
      expect(quotationUpdate.status).toBe(200);

      const quotationEmail = await request(app).post(`/api/quotations/${quoteConvertedId}/email`).set(auth()).send({
        email: 'customer16@erp.local'
      });
      expect([200, 202]).toContain(quotationEmail.status);

      const quotationConvert = await request(app)
        .post(`/api/quotations/${quoteConvertedId}/convert-to-invoice`)
        .set(auth())
        .send({});
      expect(quotationConvert.status).toBe(200);

      const quotationGet = await request(app).get(`/api/quotations/${quoteConvertedId}`).set(auth());
      expect(quotationGet.status).toBe(200);

      const quotationDraftDelete = await request(app).post('/api/quotations').set(auth()).send({
        customerId,
        lines: [{ description: 'Draft to delete', quantity: 1, unitPrice: 50, taxRate: 15 }]
      });
      expect(quotationDraftDelete.status).toBe(201);
      quoteDeletedId = Number(quotationDraftDelete.body.data.id);

      const quotationDelete = await request(app).delete(`/api/quotations/${quoteDeletedId}`).set(auth());
      expect(quotationDelete.status).toBe(200);

      const invoicePaidCreate = await request(app).post('/api/sales-invoices').set(auth()).send({
        customerId,
        date: new Date().toISOString(),
        lines: [{ description: 'Sales invoice paid', quantity: 2, unitPrice: 100, taxRate: 15 }]
      });
      expect(invoicePaidCreate.status).toBe(201);
      invoicePaidId = Number(invoicePaidCreate.body.data.id);

      const invoicePaidUpdate = await request(app).put(`/api/sales-invoices/${invoicePaidId}`).set(auth()).send({
        notes: 'invoice updated before issue',
        lines: [{ description: 'Sales invoice paid updated', quantity: 2, unitPrice: 100, taxRate: 15 }]
      });
      expect(invoicePaidUpdate.status).toBe(200);

      const invoicePaidIssue = await request(app).post(`/api/sales-invoices/${invoicePaidId}/issue`).set(auth()).send({});
      expect(invoicePaidIssue.status).toBe(200);
      const invoicePaidTotal = Number(invoicePaidIssue.body.data.total);

      const receiptCreate = await request(app).post('/api/payment-receipts').set(auth()).send({
        date: new Date().toISOString(),
        method: 'BANK_TRANSFER',
        amount: invoicePaidTotal,
        customerId,
        description: 'Receipt 16'
      });
      expect(receiptCreate.status).toBe(201);
      receiptCompletedId = Number(receiptCreate.body.data.id);

      const receiptAllocate = await request(app).post(`/api/payment-receipts/${receiptCompletedId}/allocate`).set(auth()).send({
        allocations: [{ invoiceId: invoicePaidId, amount: invoicePaidTotal }]
      });
      expect(receiptAllocate.status).toBe(200);

      const receiptComplete = await request(app).post(`/api/payment-receipts/${receiptCompletedId}/complete`).set(auth()).send({});
      expect(receiptComplete.status).toBe(200);

      const receiptGet = await request(app).get(`/api/payment-receipts/${receiptCompletedId}`).set(auth());
      expect(receiptGet.status).toBe(200);

      const invoicePayments = await request(app).get(`/api/sales-invoices/${invoicePaidId}/payments`).set(auth());
      expect(invoicePayments.status).toBe(200);

      const invoiceCancelledCreate = await request(app).post('/api/sales-invoices').set(auth()).send({
        customerId,
        date: new Date().toISOString(),
        lines: [{ description: 'Sales invoice cancel', quantity: 1, unitPrice: 50, taxRate: 15 }]
      });
      expect(invoiceCancelledCreate.status).toBe(201);
      invoiceCancelledId = Number(invoiceCancelledCreate.body.data.id);

      const invoiceCancelledIssue = await request(app).post(`/api/sales-invoices/${invoiceCancelledId}/issue`).set(auth()).send({});
      expect(invoiceCancelledIssue.status).toBe(200);

      const invoicePrint = await request(app).get(`/api/sales-invoices/${invoiceCancelledId}/print`).set(auth());
      expect(invoicePrint.status).toBe(200);

      const invoiceEmail = await request(app).post(`/api/sales-invoices/${invoiceCancelledId}/email`).set(auth()).send({
        email: 'billing16@erp.local'
      });
      expect(invoiceEmail.status).toBe(202);

      const invoiceCancel = await request(app).post(`/api/sales-invoices/${invoiceCancelledId}/cancel`).set(auth()).send({
        reason: 'stage16 cancel check'
      });
      expect(invoiceCancel.status).toBe(200);

      const invoiceReturnBaseCreate = await request(app).post('/api/sales-invoices').set(auth()).send({
        customerId,
        date: new Date().toISOString(),
        lines: [{ description: 'Sales invoice for return', quantity: 1, unitPrice: 80, taxRate: 15 }]
      });
      expect(invoiceReturnBaseCreate.status).toBe(201);
      invoiceReturnBaseId = Number(invoiceReturnBaseCreate.body.data.id);

      const invoiceReturnBaseIssue = await request(app)
        .post(`/api/sales-invoices/${invoiceReturnBaseId}/issue`)
        .set(auth())
        .send({});
      expect(invoiceReturnBaseIssue.status).toBe(200);

      const salesReturnCreate = await request(app).post('/api/sales-returns').set(auth()).send({
        invoiceId: invoiceReturnBaseId,
        lines: [{ description: 'Returned line', quantity: 1, unitPrice: 30, taxRate: 15 }],
        reason: 'customer return'
      });
      expect([200, 201]).toContain(salesReturnCreate.status);
      salesReturnId = Number(salesReturnCreate.body.data.id);

      const salesReturnApprove = await request(app).post(`/api/sales-returns/${salesReturnId}/approve`).set(auth()).send({});
      expect(salesReturnApprove.status).toBe(200);

      const salesReturnGet = await request(app).get(`/api/sales-returns/${salesReturnId}`).set(auth());
      expect(salesReturnGet.status).toBe(200);

      const salesReturnList = await request(app).get('/api/sales-returns').set(auth());
      expect(salesReturnList.status).toBe(200);

      const customerInvoices = await request(app).get(`/api/customers/${customerId}/invoices`).set(auth());
      expect(customerInvoices.status).toBe(200);

      const customerPayments = await request(app).get(`/api/customers/${customerId}/payments`).set(auth());
      expect(customerPayments.status).toBe(200);

      const customerStatement = await request(app).get(`/api/customers/${customerId}/statement`).set(auth());
      expect(customerStatement.status).toBe(200);
    } finally {
      if (salesReturnId) await prisma.salesReturn.deleteMany({ where: { id: salesReturnId } });
      if (receiptCompletedId) await prisma.payment.deleteMany({ where: { id: receiptCompletedId } });
      if (invoicePaidId || invoiceCancelledId || invoiceReturnBaseId) {
        await prisma.invoice.deleteMany({
          where: { id: { in: [invoicePaidId, invoiceCancelledId, invoiceReturnBaseId].filter((x) => x > 0) } }
        });
      }
      if (quoteConvertedId || quoteDeletedId) {
        await prisma.salesQuote.deleteMany({ where: { id: { in: [quoteConvertedId, quoteDeletedId].filter((x) => x > 0) } } });
      }
      if (contactId) await prisma.contact.deleteMany({ where: { id: contactId } });
      if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    }
  });

  it('covers purchasing pages CRUD with invoices, vouchers, orders and returns', async () => {
    const supplierCode = uniqueCode('SUP16P').toUpperCase();

    let supplierId = 0;
    let supplierContactId = 0;
    let purchaseOrderConvertedId = 0;
    let purchaseOrderDeletedId = 0;
    let purchaseInvoiceFromOrderId = 0;
    let purchaseInvoicePaidId = 0;
    let purchaseInvoiceCancelledId = 0;
    let purchaseInvoiceDeletedId = 0;
    let purchaseInvoiceReturnBaseId = 0;
    let voucherCompletedId = 0;
    let voucherCancelledId = 0;
    let voucherDeletedId = 0;
    let purchaseReturnId = 0;

    try {
      const supplier = await request(app).post('/api/suppliers').set(auth()).send({
        code: supplierCode,
        nameAr: 'Stage16 Purchase Supplier'
      });
      expect([200, 201]).toContain(supplier.status);
      supplierId = Number(supplier.body.data.id);

      const supplierContactCreate = await request(app).post(`/api/suppliers/${supplierId}/contacts`).set(auth()).send({
        name: 'Purchase Contact 16',
        email: 'purchase16@erp.local',
        isPrimary: true
      });
      expect(supplierContactCreate.status).toBe(201);
      supplierContactId = Number(supplierContactCreate.body.data.id);

      const supplierContacts = await request(app).get(`/api/suppliers/${supplierId}/contacts`).set(auth());
      expect(supplierContacts.status).toBe(200);
      expect(Array.isArray(supplierContacts.body.data)).toBe(true);

      const poConvertedCreate = await request(app).post('/api/purchase-orders').set(auth()).send({
        supplierId,
        date: new Date().toISOString(),
        lines: [{ description: 'PO line convert', quantity: 2, unitPrice: 40, taxRate: 15 }]
      });
      expect(poConvertedCreate.status).toBe(201);
      purchaseOrderConvertedId = Number(poConvertedCreate.body.data.id);

      const poGet = await request(app).get(`/api/purchase-orders/${purchaseOrderConvertedId}`).set(auth());
      expect(poGet.status).toBe(200);

      const poUpdate = await request(app).put(`/api/purchase-orders/${purchaseOrderConvertedId}`).set(auth()).send({
        notes: 'po updated',
        lines: [{ description: 'PO line convert updated', quantity: 2, unitPrice: 45, taxRate: 15 }]
      });
      expect(poUpdate.status).toBe(200);

      const poApprove = await request(app).post(`/api/purchase-orders/${purchaseOrderConvertedId}/approve`).set(auth()).send({});
      expect(poApprove.status).toBe(200);

      const poConvert = await request(app)
        .post(`/api/purchase-orders/${purchaseOrderConvertedId}/convert-to-invoice`)
        .set(auth())
        .send({});
      expect(poConvert.status).toBe(202);
      purchaseInvoiceFromOrderId = Number(poConvert.body.data.invoiceId);
      expect(purchaseInvoiceFromOrderId).toBeGreaterThan(0);

      const purchaseInvoiceFromOrderGet = await request(app).get(`/api/purchase-invoices/${purchaseInvoiceFromOrderId}`).set(auth());
      expect(purchaseInvoiceFromOrderGet.status).toBe(200);

      const purchaseInvoicePaidCreate = await request(app).post('/api/purchase-invoices').set(auth()).send({
        supplierId,
        date: new Date().toISOString(),
        lines: [{ description: 'Purchase invoice paid', quantity: 2, unitPrice: 70, taxRate: 15 }]
      });
      expect(purchaseInvoicePaidCreate.status).toBe(201);
      purchaseInvoicePaidId = Number(purchaseInvoicePaidCreate.body.data.id);

      const purchaseInvoicePaidUpdate = await request(app)
        .put(`/api/purchase-invoices/${purchaseInvoicePaidId}`)
        .set(auth())
        .send({
          notes: 'purchase invoice updated',
          lines: [{ description: 'Purchase invoice paid updated', quantity: 2, unitPrice: 70, taxRate: 15 }]
        });
      expect(purchaseInvoicePaidUpdate.status).toBe(200);

      const purchaseInvoicePaidApprove = await request(app)
        .post(`/api/purchase-invoices/${purchaseInvoicePaidId}/approve`)
        .set(auth())
        .send({});
      expect(purchaseInvoicePaidApprove.status).toBe(200);
      const purchaseInvoicePaidTotal = Number(purchaseInvoicePaidApprove.body.data.total);

      const purchaseInvoiceReceive = await request(app)
        .post(`/api/purchase-invoices/${purchaseInvoicePaidId}/receive`)
        .set(auth())
        .send({});
      expect([200, 202]).toContain(purchaseInvoiceReceive.status);

      const voucherCreate = await request(app).post('/api/payment-vouchers').set(auth()).send({
        date: new Date().toISOString(),
        method: 'BANK_TRANSFER',
        amount: purchaseInvoicePaidTotal,
        supplierId,
        description: 'Voucher 16 completed'
      });
      expect(voucherCreate.status).toBe(201);
      voucherCompletedId = Number(voucherCreate.body.data.id);

      const voucherAllocate = await request(app).post(`/api/payment-vouchers/${voucherCompletedId}/allocate`).set(auth()).send({
        allocations: [{ invoiceId: purchaseInvoicePaidId, amount: purchaseInvoicePaidTotal }]
      });
      expect(voucherAllocate.status).toBe(200);

      const voucherComplete = await request(app).post(`/api/payment-vouchers/${voucherCompletedId}/complete`).set(auth()).send({});
      expect(voucherComplete.status).toBe(200);

      const voucherGet = await request(app).get(`/api/payment-vouchers/${voucherCompletedId}`).set(auth());
      expect(voucherGet.status).toBe(200);

      const purchaseInvoiceReturnBaseCreate = await request(app).post('/api/purchase-invoices').set(auth()).send({
        supplierId,
        date: new Date().toISOString(),
        lines: [{ description: 'Purchase invoice return base', quantity: 1, unitPrice: 90, taxRate: 15 }]
      });
      expect(purchaseInvoiceReturnBaseCreate.status).toBe(201);
      purchaseInvoiceReturnBaseId = Number(purchaseInvoiceReturnBaseCreate.body.data.id);

      const purchaseInvoiceReturnBaseApprove = await request(app)
        .post(`/api/purchase-invoices/${purchaseInvoiceReturnBaseId}/approve`)
        .set(auth())
        .send({});
      expect(purchaseInvoiceReturnBaseApprove.status).toBe(200);

      const purchaseReturnCreate = await request(app).post('/api/purchase-returns').set(auth()).send({
        invoiceId: purchaseInvoiceReturnBaseId,
        lines: [{ description: 'Purchase return line', quantity: 1, unitPrice: 30, taxRate: 15 }],
        reason: 'return to supplier'
      });
      expect(purchaseReturnCreate.status).toBe(201);
      purchaseReturnId = Number(purchaseReturnCreate.body.data.id);

      const purchaseReturnApprove = await request(app).post(`/api/purchase-returns/${purchaseReturnId}/approve`).set(auth()).send({});
      expect(purchaseReturnApprove.status).toBe(200);

      const purchaseReturnGet = await request(app).get(`/api/purchase-returns/${purchaseReturnId}`).set(auth());
      expect(purchaseReturnGet.status).toBe(200);

      const purchaseReturnsList = await request(app).get('/api/purchase-returns').set(auth());
      expect(purchaseReturnsList.status).toBe(200);

      const poDeleteCreate = await request(app).post('/api/purchase-orders').set(auth()).send({
        supplierId,
        date: new Date().toISOString(),
        lines: [{ description: 'PO to delete', quantity: 1, unitPrice: 25, taxRate: 15 }]
      });
      expect(poDeleteCreate.status).toBe(201);
      purchaseOrderDeletedId = Number(poDeleteCreate.body.data.id);

      const poDelete = await request(app).delete(`/api/purchase-orders/${purchaseOrderDeletedId}`).set(auth());
      expect(poDelete.status).toBe(200);

      const purchaseInvoiceCancelCreate = await request(app).post('/api/purchase-invoices').set(auth()).send({
        supplierId,
        date: new Date().toISOString(),
        lines: [{ description: 'Purchase invoice cancel', quantity: 1, unitPrice: 40, taxRate: 15 }]
      });
      expect(purchaseInvoiceCancelCreate.status).toBe(201);
      purchaseInvoiceCancelledId = Number(purchaseInvoiceCancelCreate.body.data.id);

      const purchaseInvoiceCancelApprove = await request(app)
        .post(`/api/purchase-invoices/${purchaseInvoiceCancelledId}/approve`)
        .set(auth())
        .send({});
      expect(purchaseInvoiceCancelApprove.status).toBe(200);

      const purchaseInvoiceCancel = await request(app)
        .post(`/api/purchase-invoices/${purchaseInvoiceCancelledId}/cancel`)
        .set(auth())
        .send({ reason: 'stage16 purchase cancel check' });
      expect(purchaseInvoiceCancel.status).toBe(200);

      const purchaseInvoiceDeleteCreate = await request(app).post('/api/purchase-invoices').set(auth()).send({
        supplierId,
        date: new Date().toISOString(),
        lines: [{ description: 'Purchase invoice delete', quantity: 1, unitPrice: 20, taxRate: 15 }]
      });
      expect(purchaseInvoiceDeleteCreate.status).toBe(201);
      purchaseInvoiceDeletedId = Number(purchaseInvoiceDeleteCreate.body.data.id);

      const purchaseInvoiceDelete = await request(app).delete(`/api/purchase-invoices/${purchaseInvoiceDeletedId}`).set(auth());
      expect(purchaseInvoiceDelete.status).toBe(200);

      const voucherCancelCreate = await request(app).post('/api/payment-vouchers').set(auth()).send({
        date: new Date().toISOString(),
        method: 'BANK_TRANSFER',
        amount: 10,
        supplierId,
        description: 'Voucher 16 cancelled'
      });
      expect(voucherCancelCreate.status).toBe(201);
      voucherCancelledId = Number(voucherCancelCreate.body.data.id);

      const voucherCancel = await request(app).post(`/api/payment-vouchers/${voucherCancelledId}/cancel`).set(auth()).send({
        reason: 'cancel check'
      });
      expect(voucherCancel.status).toBe(200);

      const voucherDeleteCreate = await request(app).post('/api/payment-vouchers').set(auth()).send({
        date: new Date().toISOString(),
        method: 'BANK_TRANSFER',
        amount: 12,
        supplierId,
        description: 'Voucher 16 deleted'
      });
      expect(voucherDeleteCreate.status).toBe(201);
      voucherDeletedId = Number(voucherDeleteCreate.body.data.id);

      const voucherDelete = await request(app).delete(`/api/payment-vouchers/${voucherDeletedId}`).set(auth());
      expect(voucherDelete.status).toBe(200);

      const supplierInvoices = await request(app).get(`/api/suppliers/${supplierId}/invoices`).set(auth());
      expect(supplierInvoices.status).toBe(200);

      const supplierPayments = await request(app).get(`/api/suppliers/${supplierId}/payments`).set(auth());
      expect(supplierPayments.status).toBe(200);

      const supplierStatement = await request(app).get(`/api/suppliers/${supplierId}/statement`).set(auth());
      expect(supplierStatement.status).toBe(200);
    } finally {
      if (purchaseReturnId) await prisma.purchaseReturn.deleteMany({ where: { id: purchaseReturnId } });

      const paymentIds = [voucherCompletedId, voucherCancelledId, voucherDeletedId].filter((x) => x > 0);
      if (paymentIds.length) {
        await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
      }

      const invoiceIds = [
        purchaseInvoiceFromOrderId,
        purchaseInvoicePaidId,
        purchaseInvoiceCancelledId,
        purchaseInvoiceDeletedId,
        purchaseInvoiceReturnBaseId
      ].filter((x) => x > 0);
      if (invoiceIds.length) {
        await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
      }

      const poIds = [purchaseOrderConvertedId, purchaseOrderDeletedId].filter((x) => x > 0);
      if (poIds.length) {
        await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: { in: poIds } } });
        await prisma.purchaseOrder.deleteMany({ where: { id: { in: poIds } } });
      }

      if (supplierContactId) await prisma.contact.deleteMany({ where: { id: supplierContactId } });
      if (supplierId) await prisma.supplier.deleteMany({ where: { id: supplierId } });
    }
  });
});
