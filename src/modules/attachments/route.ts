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

router.post(
  '/',
  requirePermissions(PERMISSIONS.ATTACHMENTS_WRITE),
  validateBody(attachmentSchema),
  audit('attachments'),
  async (req: any, res, next) => {
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
  }
);

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

