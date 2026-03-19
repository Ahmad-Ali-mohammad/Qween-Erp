import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { ERROR_CODES } from '../../constants/error-codes';
import { fail, ok } from '../../utils/response';
import { getFileStorageCapabilities } from '../../services/file-storage';
import * as service from './service';

const router = Router();

const attachmentSchema = z
  .object({
    entityType: z.string().trim().min(1).max(120),
    entityId: z.coerce.number().int().positive(),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().max(200).optional(),
    metadata: z.record(z.any()).optional(),
    contentBase64: z.string().min(8)
  })
  .strict();

const querySchema = z.object({
  entityType: z.string().trim().min(1).max(120).optional(),
  entityId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional()
});

const documentVersionQuerySchema = z.object({
  documentKey: z.string().trim().min(1).max(120).optional(),
  entityType: z.string().trim().min(1).max(120).optional(),
  entityId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional()
});

const documentVersionSchema = z
  .object({
    documentKey: z.string().trim().min(2).max(120),
    attachmentId: z.coerce.number().int().positive(),
    title: z.string().trim().max(200).optional(),
    status: z.string().trim().max(40).optional(),
    notes: z.string().trim().optional(),
    entityType: z.string().trim().max(120).optional(),
    entityId: z.coerce.number().int().positive().optional()
  })
  .strict();

const correspondenceQuerySchema = z.object({
  direction: z.string().trim().max(20).optional(),
  status: z.string().trim().max(40).optional(),
  entityType: z.string().trim().max(120).optional(),
  entityId: z.coerce.number().int().positive().optional(),
  documentKey: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional()
});

const correspondenceSchema = z
  .object({
    direction: z.string().trim().min(2).max(20),
    subject: z.string().trim().min(2).max(200),
    reference: z.string().trim().max(120).optional(),
    status: z.string().trim().max(40).optional(),
    entityType: z.string().trim().max(120).optional(),
    entityId: z.coerce.number().int().positive().optional(),
    documentKey: z.string().trim().max(120).optional(),
    attachmentId: z.coerce.number().int().positive().optional(),
    receivedAt: z.string().optional(),
    sentAt: z.string().optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const correspondenceUpdateSchema = z
  .object({
    subject: z.string().trim().min(2).max(200).optional(),
    reference: z.string().trim().max(120).optional(),
    status: z.string().trim().max(40).optional(),
    documentKey: z.string().trim().max(120).optional(),
    attachmentId: z.union([z.coerce.number().int().positive(), z.literal(null)]).optional(),
    receivedAt: z.union([z.string(), z.literal(null)]).optional(),
    sentAt: z.union([z.string(), z.literal(null)]).optional(),
    notes: z.union([z.string().trim(), z.literal(null)]).optional()
  })
  .strict();

router.use(authenticate);

router.get('/', requirePermissions(PERMISSIONS.ATTACHMENTS_READ), async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      fail(res, ERROR_CODES.VALIDATION_ERROR, 'Attachment query is invalid', 422, parsed.error.flatten());
      return;
    }

    ok(res, {
      storage: getFileStorageCapabilities(),
      rows: await service.listAttachments(parsed.data)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/versions', requirePermissions(PERMISSIONS.ATTACHMENTS_READ), async (req, res, next) => {
  try {
    const parsed = documentVersionQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      fail(res, ERROR_CODES.VALIDATION_ERROR, 'Document versions query is invalid', 422, parsed.error.flatten());
      return;
    }
    ok(res, await service.listDocumentVersions(parsed.data));
  } catch (error) {
    next(error);
  }
});

router.post('/versions', requirePermissions(PERMISSIONS.ATTACHMENTS_WRITE), validateBody(documentVersionSchema), audit('document_versions'), async (req: any, res, next) => {
  try {
    ok(res, await service.createDocumentVersion(req.body, req.user?.id), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/versions/:id', requirePermissions(PERMISSIONS.ATTACHMENTS_READ), async (req, res, next) => {
  try {
    ok(res, await service.getDocumentVersion(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.get('/correspondence', requirePermissions(PERMISSIONS.ATTACHMENTS_READ), async (req, res, next) => {
  try {
    const parsed = correspondenceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      fail(res, ERROR_CODES.VALIDATION_ERROR, 'Correspondence query is invalid', 422, parsed.error.flatten());
      return;
    }
    ok(res, await service.listCorrespondence(parsed.data));
  } catch (error) {
    next(error);
  }
});

router.post('/correspondence', requirePermissions(PERMISSIONS.ATTACHMENTS_WRITE), validateBody(correspondenceSchema), audit('correspondence_register'), async (req: any, res, next) => {
  try {
    ok(res, await service.createCorrespondence(req.body, req.user?.id), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/correspondence/:id', requirePermissions(PERMISSIONS.ATTACHMENTS_READ), async (req, res, next) => {
  try {
    ok(res, await service.getCorrespondence(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/correspondence/:id', requirePermissions(PERMISSIONS.ATTACHMENTS_WRITE), validateBody(correspondenceUpdateSchema), audit('correspondence_register'), async (req: any, res, next) => {
  try {
    ok(res, await service.updateCorrespondence(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermissions(PERMISSIONS.ATTACHMENTS_WRITE), validateBody(attachmentSchema), audit('attachments'), async (req: any, res, next) => {
  try {
    ok(
      res,
      {
        storage: getFileStorageCapabilities(),
        attachment: await service.createAttachment(req.body, req.user?.id)
      },
      undefined,
      201,
      {
        status: {
          code: 'ATTACHMENT_CREATED'
        }
      }
    );
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requirePermissions(PERMISSIONS.ATTACHMENTS_READ), async (req, res, next) => {
  try {
    ok(res, { attachment: await service.getAttachment(Number(req.params.id)) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/download', requirePermissions(PERMISSIONS.ATTACHMENTS_READ), async (req, res, next) => {
  try {
    const result = await service.getAttachmentDownload(Number(req.params.id));
    res.setHeader('Content-Type', result.attachment.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${result.attachment.fileName}"`);

    if (result.file.sizeBytes) {
      res.setHeader('Content-Length', String(result.file.sizeBytes));
    }

    if (result.file.kind === 'path') {
      res.sendFile(result.file.filePath);
      return;
    }

    res.send(result.file.buffer);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requirePermissions(PERMISSIONS.ATTACHMENTS_WRITE), audit('attachments'), async (req, res, next) => {
  try {
    ok(
      res,
      await service.deleteAttachment(Number(req.params.id)),
      undefined,
      200,
      {
        status: {
          code: 'ATTACHMENT_DELETED'
        }
      }
    );
  } catch (error) {
    next(error);
  }
});

export default router;
