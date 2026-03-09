import fs from 'fs/promises';
import path from 'path';
import { env } from '../../config/env';
import {
  buildNamespacedStorageKey,
  removeStoredFile as removeGenericStoredFile,
  resolveStoredFile as resolveGenericStoredFile,
  sanitizeStorageSegment,
  saveStoredFile
} from '../../services/file-storage';

export function resolveStorageRoot(): string {
  return path.resolve(process.cwd(), env.fileStoragePath);
}

export async function ensureStorageRoot(): Promise<string> {
  const root = resolveStorageRoot();
  await fs.mkdir(root, { recursive: true });
  return root;
}

export async function savePrintingFile(storageKey: string, buffer: Buffer): Promise<string> {
  await saveStoredFile(storageKey, buffer, {
    contentType: 'application/octet-stream'
  });
  return storageKey;
}

export function buildPrintingStorageKey(jobKey: string, fileName: string): string {
  return buildNamespacedStorageKey(['printing', sanitizeStorageSegment(jobKey)], fileName);
}

export function resolveStoredFile(storageKey: string): string {
  return resolveGenericStoredFile(storageKey);
}

export async function removeStoredFile(storageKey: string): Promise<void> {
  await removeGenericStoredFile(storageKey);
}
