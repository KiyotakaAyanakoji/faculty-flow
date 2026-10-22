import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { Request, Response, NextFunction } from 'express';
import { ensureUploadDirExists, verifyPdfMagicBytes } from '../services/storage.service.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB in bytes

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      const uploadDir = await ensureUploadDirExists();
      cb(null, uploadDir);
    } catch (err: any) {
      cb(err, '');
    }
  },
  filename: (_req, file, cb) => {
    // Generate secure random UUID identifier
    const safeStorageName = `${crypto.randomUUID()}.pdf`;
    cb(null, safeStorageName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    // Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.pdf') {
      return cb(new Error('Only PDF documents are allowed (.pdf)'));
    }

    // Check client-provided MIME type
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Invalid MIME type: file must be application/pdf'));
    }

    cb(null, true);
  },
}).single('file');

/**
 * Express middleware that handles PDF file upload, enforces 10MB limit,
 * and performs cryptographic magic bytes verification (%PDF-).
 */
export function handlePdfUpload(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, async (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: 'File size exceeds maximum limit of 10 MB',
          });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ error: err.message || 'Invalid upload' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file was provided in the upload request' });
    }

    // Magic byte content signature inspection
    const isMagicValid = await verifyPdfMagicBytes(req.file.path);
    if (!isMagicValid) {
      // Immediately remove corrupted/spoofed file from storage
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupErr) {
        console.error('Failed to clean up invalid uploaded file:', cleanupErr);
      }

      return res.status(400).json({
        error: 'Invalid file format: File contents do not match a valid PDF document signature',
      });
    }

    next();
  });
}
