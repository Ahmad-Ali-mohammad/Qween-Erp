import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { Errors } from '../utils/response';

type SaveStoredFileOptions = {
  contentType?: string;
  metadata?: Record<string, string>;
};

export type StoredFileDownload =
  | {
      kind: 'path';
      filePath: string;
      sizeBytes?: number;
    }
  | {
      kind: 'buffer';
      buffer: Buffer;
      sizeBytes?: number;
    };

let s3Client: S3Client | null = null;

export function sanitizeStorageSegment(value: string): string {
  const normalized = String(value ?? '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');

  return normalized || 'file';
}

function normalizeStorageKey(storageKey: string): string {
  return String(storageKey ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

function resolveLocalStorageRoot(): string {
  return path.resolve(process.cwd(), env.fileStoragePath);
}

async function ensureLocalStorageRoot(): Promise<string> {
  const root = resolveLocalStorageRoot();
  await fs.mkdir(root, { recursive: true });
  return root;
}

function resolveLocalFilePath(storageKey: string): string {
  const normalized = normalizeStorageKey(storageKey);
  return path.join(resolveLocalStorageRoot(), ...normalized.split('/'));
}

function getS3Client(): S3Client {
  if (env.fileStorageDriver !== 's3') {
    throw Errors.business('S3 storage is not enabled');
  }

  if (!env.fileStorageS3Bucket) {
    throw Errors.business('S3 bucket is not configured');
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: env.fileStorageS3Region || 'us-east-1',
      endpoint: env.fileStorageS3Endpoint || undefined,
      forcePathStyle: env.fileStorageS3ForcePathStyle,
      credentials:
        env.fileStorageS3AccessKeyId && env.fileStorageS3SecretAccessKey
          ? {
              accessKeyId: env.fileStorageS3AccessKeyId,
              secretAccessKey: env.fileStorageS3SecretAccessKey
            }
          : undefined
    });
  }

  return s3Client;
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);

  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);

  if (typeof (body as { transformToByteArray?: unknown }).transformToByteArray === 'function') {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }

  if (body instanceof Readable || (typeof body === 'object' && body !== null && 'on' in body)) {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      (body as Readable)
        .on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        .on('end', () => resolve(Buffer.concat(chunks)))
        .on('error', reject);
    });
  }

  throw Errors.internal('Unable to read file from storage provider');
}

export function buildNamespacedStorageKey(namespace: string[], fileName: string): string {
  const parts = namespace.map((entry) => sanitizeStorageSegment(entry)).filter(Boolean);
  const safeFileName = sanitizeStorageSegment(fileName);
  return path.posix.join(...parts, `${randomUUID()}-${safeFileName}`);
}

export function resolveStoredFile(storageKey: string): string {
  if (env.fileStorageDriver !== 'local') {
    throw Errors.business('Direct file-path resolution is available only for local storage');
  }

  return resolveLocalFilePath(storageKey);
}

export async function saveStoredFile(storageKey: string, buffer: Buffer, options: SaveStoredFileOptions = {}): Promise<void> {
  const normalizedKey = normalizeStorageKey(storageKey);

  if (env.fileStorageDriver === 'local') {
    await ensureLocalStorageRoot();
    const fullPath = resolveLocalFilePath(normalizedKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return;
  }

  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: env.fileStorageS3Bucket,
      Key: normalizedKey,
      Body: buffer,
      ContentType: options.contentType || 'application/octet-stream',
      Metadata: options.metadata
    })
  );
}

export async function getStoredFileDownload(storageKey: string): Promise<StoredFileDownload> {
  const normalizedKey = normalizeStorageKey(storageKey);

  if (env.fileStorageDriver === 'local') {
    const filePath = resolveLocalFilePath(normalizedKey);
    const stat = await fs.stat(filePath);

    return {
      kind: 'path',
      filePath,
      sizeBytes: stat.size
    };
  }

  const client = getS3Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: env.fileStorageS3Bucket,
      Key: normalizedKey
    })
  );

  return {
    kind: 'buffer',
    buffer: await streamToBuffer(response.Body),
    sizeBytes: response.ContentLength ? Number(response.ContentLength) : undefined
  };
}

export async function removeStoredFile(storageKey: string): Promise<void> {
  const normalizedKey = normalizeStorageKey(storageKey);

  if (env.fileStorageDriver === 'local') {
    await fs.rm(resolveLocalFilePath(normalizedKey), { force: true });
    return;
  }

  const client = getS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: env.fileStorageS3Bucket,
      Key: normalizedKey
    })
  );
}

export function getFileStorageCapabilities() {
  return {
    driver: env.fileStorageDriver,
    localPath: env.fileStorageDriver === 'local' ? env.fileStoragePath : null,
    s3: env.fileStorageDriver === 's3'
      ? {
          bucket: env.fileStorageS3Bucket,
          endpoint: env.fileStorageS3Endpoint || null,
          region: env.fileStorageS3Region || null,
          forcePathStyle: env.fileStorageS3ForcePathStyle
        }
      : null
  };
}
