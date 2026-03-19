import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { EventEmitter } from 'events';
import { prisma } from '../../config/database';

export type AccountingEventName =
  | 'inventory.movement.recorded'
  | 'inventory.movement.updated'
  | 'inventory.movement.deleted'
  | 'project.expense.recorded'
  | 'project.expense.updated'
  | 'project.expense.deleted'
  | 'equipment.allocation.closed'
  | 'equipment.maintenance.completed'
  | 'subcontract.certificate.approved'
  | 'subcontract.payment.recorded'
  | 'site.daily_log.recorded'
  | 'site.material_request.fulfilled'
  | 'site.progress.recorded'
  | 'site.equipment_issue.reported'
  | 'procurement.purchase_request.converted'
  | 'period.month_closed'
  | 'tax.declaration.posted';

export type AccountingEventRecord = {
  id: string;
  name: AccountingEventName;
  createdAt: string;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  payload: Record<string, unknown>;
  error?: string;
};

const accountingEvents = new EventEmitter();
const eventLog: AccountingEventRecord[] = [];

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function pushEvent(event: AccountingEventRecord) {
  eventLog.unshift(event);
  if (eventLog.length > 200) eventLog.pop();
}

export function emitAccountingEvent(name: AccountingEventName, payload: Record<string, unknown>) {
  const event: AccountingEventRecord = {
    id: randomUUID(),
    name,
    createdAt: new Date().toISOString(),
    status: 'PENDING',
    payload
  };

  pushEvent(event);
  accountingEvents.emit(name, event);
  return event;
}

export function onAccountingEvent(name: AccountingEventName, handler: (event: AccountingEventRecord) => Promise<void> | void) {
  accountingEvents.on(name, async (event: AccountingEventRecord) => {
    try {
      await handler(event);
      event.status = 'PROCESSED';
    } catch (error) {
      event.status = 'FAILED';
      event.error = error instanceof Error ? error.message : 'حدث خطأ غير معروف';
    }
  });
}

export function listAccountingEvents(limit = 50) {
  return eventLog.slice(0, Math.max(1, Math.min(limit, 200)));
}

let listenersRegistered = false;

function registerDefaultListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  const persistAudit = async (event: AccountingEventRecord) => {
    await prisma.auditLog.create({
      data: {
        table: 'accounting_events',
        recordId: typeof event.payload.recordId === 'number' ? event.payload.recordId : null,
        action: 'AUTO_POST_ENQUEUED',
        newValue: toJsonValue(event)
      }
    });
  };

  onAccountingEvent('inventory.movement.recorded', persistAudit);
  onAccountingEvent('inventory.movement.updated', persistAudit);
  onAccountingEvent('inventory.movement.deleted', persistAudit);
  onAccountingEvent('project.expense.recorded', persistAudit);
  onAccountingEvent('project.expense.updated', persistAudit);
  onAccountingEvent('project.expense.deleted', persistAudit);
  onAccountingEvent('equipment.allocation.closed', persistAudit);
  onAccountingEvent('equipment.maintenance.completed', persistAudit);
  onAccountingEvent('subcontract.certificate.approved', persistAudit);
  onAccountingEvent('subcontract.payment.recorded', persistAudit);
  onAccountingEvent('site.daily_log.recorded', persistAudit);
  onAccountingEvent('site.material_request.fulfilled', persistAudit);
  onAccountingEvent('site.progress.recorded', persistAudit);
  onAccountingEvent('site.equipment_issue.reported', persistAudit);
  onAccountingEvent('procurement.purchase_request.converted', persistAudit);
  onAccountingEvent('period.month_closed', persistAudit);
}

registerDefaultListeners();
