import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import type { NextFunction, Request, Response } from "express";

export const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx"]);
// Đối chiếu phần mở rộng khai báo với magic bytes thật của nội dung file.
const ALLOWED_MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
const MAX_FILES_PER_REQUEST = 10;
const MAX_FIELD_SIZE_BYTES = 2 * 1024 * 1024; // 2MB, đủ cho formData JSON tự do
const MAX_TEXT_FIELDS = 20;

// Chữ ký mẫu (mục 1.6) — ảnh PNG/JPG, giới hạn 1MB, không có field text đi kèm.
const SIGNATURE_ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
const SIGNATURE_ALLOWED_MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};
const SIGNATURE_MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_FILES_PER_REQUEST,
    fieldSize: MAX_FIELD_SIZE_BYTES,
    fields: MAX_TEXT_FIELDS,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(new Error("Chỉ chấp nhận file .pdf hoặc .docx"));
      return;
    }
    cb(null, true);
  },
});

export const signatureUpload = multer({
  storage,
  limits: {
    fileSize: SIGNATURE_MAX_FILE_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!SIGNATURE_ALLOWED_EXTENSIONS.has(ext)) {
      cb(new Error("Chỉ chấp nhận ảnh PNG hoặc JPG"));
      return;
    }
    cb(null, true);
  },
});

// fileFilter của multer chỉ nhìn phần mở rộng khai báo trong originalname — đổi tên
// ".exe" thành ".pdf" sẽ qua được. Middleware này chạy SAU khi multer đã ghi file lên
// đĩa, đối chiếu magic bytes thật với phần mở rộng; không khớp thì xoá file + báo lỗi
// cùng dạng message để error handler chung ở index.ts xử lý (nhận diện qua tiền tố message).
function createMagicByteVerifier(allowedMimeByExtension: Record<string, string>, mismatchMessage: string) {
  return async function verify(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const files = [
      ...((req.files as Express.Multer.File[] | undefined) ?? []),
      ...(req.file ? [req.file] : []),
    ];
    if (files.length === 0) {
      next();
      return;
    }

    try {
      const { fileTypeFromFile } = await import("file-type");
      for (const file of files) {
        const ext = path.extname(file.filename).toLowerCase();
        const expectedMime = allowedMimeByExtension[ext];
        const detected = await fileTypeFromFile(file.path);
        if (!expectedMime || detected?.mime !== expectedMime) {
          for (const f of files) {
            fs.unlink(f.path, (unlinkErr) => {
              if (unlinkErr) console.error(`Lỗi xóa file mồ côi: ${f.path}`, unlinkErr);
            });
          }
          next(new Error(mismatchMessage));
          return;
        }
      }
      next();
    } catch (err) {
      for (const f of files) {
        fs.unlink(f.path, (unlinkErr) => {
          if (unlinkErr) console.error(`Lỗi xóa file mồ côi: ${f.path}`, unlinkErr);
        });
      }
      next(err);
    }
  };
}

export const verifyMagicBytes = createMagicByteVerifier(
  ALLOWED_MIME_BY_EXTENSION,
  "Chỉ chấp nhận file .pdf hoặc .docx (nội dung file không khớp định dạng khai báo)",
);

export const verifySignatureMagicBytes = createMagicByteVerifier(
  SIGNATURE_ALLOWED_MIME_BY_EXTENSION,
  "Chỉ chấp nhận ảnh PNG hoặc JPG (nội dung file không khớp định dạng khai báo)",
);
