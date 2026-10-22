import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default private storage outside any publicly exposed web directories
const DEFAULT_UPLOAD_DIR = path.resolve(__dirname, '../../uploads/events');

export function getEventUploadDir(): string {
  return process.env.EVENT_UPLOAD_DIR
    ? path.resolve(process.env.EVENT_UPLOAD_DIR)
    : DEFAULT_UPLOAD_DIR;
}

export async function ensureUploadDirExists(): Promise<string> {
  const dir = getEventUploadDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function getSafeFilePath(fileIdentifier: string): string {
  const safeFilename = path.basename(fileIdentifier);
  const baseDir = getEventUploadDir();
  const resolvedPath = path.resolve(baseDir, safeFilename);

  // Path traversal guard
  if (!resolvedPath.startsWith(baseDir)) {
    throw new Error('Access denied: Invalid file path traversal detected');
  }

  return resolvedPath;
}

export async function deleteStoredFile(fileIdentifier: string): Promise<boolean> {
  try {
    const filePath = getSafeFilePath(fileIdentifier);
    await fs.unlink(filePath);
    return true;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return false; // Already missing
    }
    console.error(`Failed to delete stored file ${fileIdentifier}:`, err);
    return false;
  }
}

export async function verifyPdfMagicBytes(filePath: string): Promise<boolean> {
  try {
    const handle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(5);
    await handle.read(buffer, 0, 5, 0);
    await handle.close();

    // Valid PDF files start with %PDF- (0x25 0x50 0x44 0x46 0x2D)
    return buffer.toString('ascii') === '%PDF-';
  } catch {
    return false;
  }
}
