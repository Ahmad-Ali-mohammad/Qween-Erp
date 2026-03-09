import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { ok } from '../../utils/response';
import { printingEntityTypes } from './defaults';
import { enqueuePrintJob, getPrintingQueueCapabilities, getPrintingQueueJobStatus } from './queue';
import * as service from './service';

const router = Router();

const templateEntitySchema = z.enum(printingEntityTypes);
const exportFormatSchema = z.enum(['pdf', 'xlsx']);

const documentTemplateSchema = z
  .object({
    key: z.string().trim().min(3).max(120),
    entityType: templateEntitySchema,
    nameAr: z.string().trim().min(1).max(200),
    nameEn: z.string().trim().max(200).optional(),
    branchId: z.coerce.number().int().positive().optional(),
    format: z.string().trim().max(30).optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
    version: z.coerce.number().int().positive().optional(),
    content: z.string().min(20),
    sampleData: z.record(z.any()).optional()
  })
  .strict();

const renderDocumentSchema = z
  .object({
    templateId: z.coerce.number().int().positive().optional(),
    templateKey: z.string().trim().min(3).max(120).optional()
  })
  .strict();

const exportDocumentSchema = renderDocumentSchema.extend({
  format: exportFormatSchema
});

const renderPreviewSchema = z
  .object({
    entityType: templateEntitySchema,
    content: z.string().min(20),
    sampleData: z.record(z.any()).optional()
  })
  .strict();

const exportPreviewSchema = renderPreviewSchema.extend({
  format: exportFormatSchema
});

router.use(authenticate);

router.get('/templates/defaults', requirePermissions(PERMISSIONS.PRINTING_READ), (_req, res) => {
  ok(res, {
    entityTypes: printingEntityTypes,
    defaults: service.listDefaultTemplateCatalog(),
    queue: getPrintingQueueCapabilities()
  });
});

router.post('/templates/bootstrap-defaults', requirePermissions(PERMISSIONS.PRINTING_WRITE), audit('document_templates'), async (req: any, res, next) => {
  try {
    ok(res, await service.bootstrapDefaultTemplates(req.user?.id));
  } catch (error) {
    next(error);
  }
});

router.get('/templates', requirePermissions(PERMISSIONS.PRINTING_READ), async (req, res, next) => {
  try {
    ok(
      res,
      await service.listDocumentTemplates({
        entityType: typeof req.query.entityType === 'string' ? req.query.entityType : undefined,
        branchId: req.query.branchId ? Number(req.query.branchId) : undefined
      })
    );
  } catch (error) {
    next(error);
  }
});

router.post('/templates', requirePermissions(PERMISSIONS.PRINTING_WRITE), validateBody(documentTemplateSchema), audit('document_templates'), async (req: any, res, next) => {
  try {
    ok(res, await service.createDocumentTemplate(req.body, req.user?.id), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/templates/:id', requirePermissions(PERMISSIONS.PRINTING_READ), async (req, res, next) => {
  try {
    ok(res, await service.getDocumentTemplate(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/templates/:id', requirePermissions(PERMISSIONS.PRINTING_WRITE), validateBody(documentTemplateSchema.partial()), audit('document_templates'), async (req, res, next) => {
  try {
    ok(res, await service.updateDocumentTemplate(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/templates/:id', requirePermissions(PERMISSIONS.PRINTING_WRITE), audit('document_templates'), async (req, res, next) => {
  try {
    ok(res, await service.deleteDocumentTemplate(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.get('/jobs', requirePermissions(PERMISSIONS.PRINTING_READ), async (req: any, res, next) => {
  try {
    ok(res, {
      queue: getPrintingQueueCapabilities(),
      rows: await service.listPrintJobs({
        entityType: typeof req.query.entityType === 'string' ? req.query.entityType : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        requestedBy: req.query.mine === 'true' ? req.user?.id : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined
      })
    });
  } catch (error) {
    next(error);
  }
});

router.get('/jobs/:id', requirePermissions(PERMISSIONS.PRINTING_READ), async (req, res, next) => {
  try {
    ok(res, {
      queue: getPrintingQueueCapabilities(),
      job: await service.getPrintJob(Number(req.params.id))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/jobs/:id/queue-status', requirePermissions(PERMISSIONS.PRINTING_READ), async (req, res, next) => {
  try {
    const job = await service.getPrintJob(Number(req.params.id));
    ok(res, {
      queue: getPrintingQueueCapabilities(),
      queueJob: await getPrintingQueueJobStatus(`print:${job.id}`)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/jobs/:id/download', requirePermissions(PERMISSIONS.PRINTING_READ), async (req, res, next) => {
  try {
    const job = await service.getPrintJob(Number(req.params.id));

    if (!job.attachmentId) {
      ok(
        res,
        { available: false, job },
        undefined,
        409,
        {
          status: {
            code: 'PRINT_JOB_NOT_READY'
          }
        }
      );
      return;
    }

    const file = await service.getPrintAttachmentDownload(job.attachmentId);
    res.setHeader('Content-Type', file.attachment.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.attachment.fileName}"`);

    if (file.file.sizeBytes) {
      res.setHeader('Content-Length', String(file.file.sizeBytes));
    }

    if (file.file.kind === 'path') {
      res.sendFile(file.file.filePath);
      return;
    }

    res.send(file.file.buffer);
  } catch (error) {
    next(error);
  }
});

router.post('/render/preview', requirePermissions(PERMISSIONS.PRINTING_READ), validateBody(renderPreviewSchema), async (req, res, next) => {
  try {
    ok(res, await service.renderDocumentPreview(req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/render/:entityType/:recordId', requirePermissions(PERMISSIONS.PRINTING_READ), validateBody(renderDocumentSchema), async (req, res, next) => {
  try {
    ok(
      res,
      await service.renderStoredDocument({
        entityType: req.params.entityType,
        recordId: Number(req.params.recordId),
        templateId: req.body.templateId,
        templateKey: req.body.templateKey
      })
    );
  } catch (error) {
    next(error);
  }
});

router.post('/jobs/preview', requirePermissions(PERMISSIONS.PRINTING_READ), validateBody(exportPreviewSchema), async (req: any, res, next) => {
  try {
    const queue = getPrintingQueueCapabilities();
    const job = await service.createPreviewPrintJob(req.body, req.user?.id, queue.available ? 'QUEUED' : 'INLINE');
    const queueJob = queue.available ? await enqueuePrintJob(job.id) : null;

    if (queueJob) {
      ok(
        res,
        {
          queue,
          queueJob,
          job: await service.getPrintJob(job.id)
        },
        undefined,
        202,
        {
          status: {
            code: 'PRINT_JOB_QUEUED'
          }
        }
      );
      return;
    }

    ok(
      res,
      {
        queue: {
          ...queue,
          fallbackUsed: queue.enabled
        },
        job: await service.processPrintJob(job.id)
      },
      undefined,
      201,
      {
        status: {
          code: queue.enabled ? 'PRINT_JOB_COMPLETED_INLINE_FALLBACK' : 'PRINT_JOB_COMPLETED_INLINE'
        }
      }
    );
  } catch (error) {
    next(error);
  }
});

router.post('/jobs/:entityType/:recordId', requirePermissions(PERMISSIONS.PRINTING_READ), validateBody(exportDocumentSchema), async (req: any, res, next) => {
  try {
    const queue = getPrintingQueueCapabilities();
    const job = await service.createStoredPrintJob(
      {
        entityType: req.params.entityType,
        recordId: Number(req.params.recordId),
        templateId: req.body.templateId,
        templateKey: req.body.templateKey,
        format: req.body.format
      },
      req.user?.id,
      queue.available ? 'QUEUED' : 'INLINE'
    );

    const queueJob = queue.available ? await enqueuePrintJob(job.id) : null;

    if (queueJob) {
      ok(
        res,
        {
          queue,
          queueJob,
          job: await service.getPrintJob(job.id)
        },
        undefined,
        202,
        {
          status: {
            code: 'PRINT_JOB_QUEUED'
          }
        }
      );
      return;
    }

    ok(
      res,
      {
        queue: {
          ...queue,
          fallbackUsed: queue.enabled
        },
        job: await service.processPrintJob(job.id)
      },
      undefined,
      201,
      {
        status: {
          code: queue.enabled ? 'PRINT_JOB_COMPLETED_INLINE_FALLBACK' : 'PRINT_JOB_COMPLETED_INLINE'
        }
      }
    );
  } catch (error) {
    next(error);
  }
});

router.post('/export/preview', requirePermissions(PERMISSIONS.PRINTING_READ), validateBody(exportPreviewSchema), async (req, res, next) => {
  try {
    const file = await service.exportDocumentPreview(req.body);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(file.buffer);
  } catch (error) {
    next(error);
  }
});

router.post('/export/:entityType/:recordId', requirePermissions(PERMISSIONS.PRINTING_READ), validateBody(exportDocumentSchema), async (req, res, next) => {
  try {
    const file = await service.exportStoredDocument({
      entityType: req.params.entityType,
      recordId: Number(req.params.recordId),
      templateId: req.body.templateId,
      templateKey: req.body.templateKey,
      format: req.body.format
    });

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(file.buffer);
  } catch (error) {
    next(error);
  }
});

export default router;
