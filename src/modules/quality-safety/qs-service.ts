// Quality & Safety Service - uses existing models from site module
import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';
import * as siteService from '../site/service';

export async function getQualitySafetyDashboard() {
  const [
    totalDailyLogs,
    equipmentIssues,
    openIssues,
    highSeverity
  ] = await Promise.all([
    prisma.siteDailyLog.count(),
    prisma.siteEquipmentIssue.count(),
    prisma.siteEquipmentIssue.count({ where: { status: { in: ['OPEN', 'ESCALATED'] } } }),
    prisma.siteEquipmentIssue.count({ where: { severity: 'HIGH' } })
  ]);

  const bySeverity = await prisma.siteEquipmentIssue.groupBy({
    by: ['severity'],
    _count: { severity: true }
  });

  const byStatus = await prisma.siteEquipmentIssue.groupBy({
    by: ['status'],
    _count: { status: true }
  });

  return {
    summary: {
      totalDailyLogs,
      totalIssues: equipmentIssues,
      openIssues,
      highSeverityIssues: highSeverity
    },
    bySeverity: bySeverity.map((s: { severity: string; _count: { severity: number } }) => ({
      severity: s.severity,
      count: s._count.severity
    })),
    byStatus: byStatus.map((s: { status: string; _count: { status: number } }) => ({
      status: s.status,
      count: s._count.status
    })),
    generatedAt: new Date().toISOString()
  };
}

export async function listQualityInspections(query: any, scope?: any) {
  return siteService.listDailyLogs(query, scope);
}

export async function createQualityInspection(data: any) {
  return siteService.createDailyLog(data);
}

export async function listSafetyIncidents(query: any, scope?: any) {
  return siteService.listEquipmentIssues(query, scope);
}

export async function createSafetyIncident(data: any) {
  return siteService.createEquipmentIssue({
    ...data,
    severity: data.severity ?? 'MEDIUM'
  });
}

export async function resolveSafetyIncident(id: number, data: any) {
  return siteService.resolveEquipmentIssue(id, data);
}

export { siteService };
