import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { upload, UPLOAD_DIR } from "../lib/upload";
import { AppError } from "../lib/errors";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { canViewDocument, isCurrentApprover } from "../lib/workflow";

const router = Router();

const SAFE_CREATOR_SELECT = { id: true, fullName: true, email: true } as const;

const DOCUMENT_INCLUDE = {
  attachments: true,
  creator: { select: SAFE_CREATOR_SELECT },
  workflow: { include: { steps: { orderBy: { stepOrder: "asc" as const } } } },
};

const createDocumentSchema = z.object({
  title: z.string().min(1, "Thiếu tiêu đề"),
  type: z.enum(["PURCHASE", "PAYMENT", "GENERAL"]),
  formData: z.string().optional(),
});

router.post(
  "/",
  authenticate,
  authorize("document:create"),
  upload.array("attachments", 10),
  async (req, res, next) => {
    try {
      const parsed = createDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Dữ liệu văn bản không hợp lệ");
      }
      const { title, type } = parsed.data;

      let formData: unknown = {};
      if (parsed.data.formData) {
        try {
          formData = JSON.parse(parsed.data.formData);
        } catch {
          throw new AppError(400, "formData phải là chuỗi JSON hợp lệ");
        }
        if (typeof formData !== "object" || formData === null || Array.isArray(formData)) {
          throw new AppError(400, "formData phải là một object JSON");
        }
      }

      const workflow = await prisma.workflow.findFirst({ where: { name: type } });
      if (!workflow) {
        throw new AppError(500, `Chưa cấu hình quy trình duyệt cho loại văn bản "${type}"`);
      }

      const files = (req.files as Express.Multer.File[] | undefined) ?? [];

      const document = await prisma.$transaction(async (tx) => {
        return tx.document.create({
          data: {
            title,
            type,
            formData: formData as object,
            status: "PENDING",
            currentStep: 1,
            creatorId: req.user!.id,
            workflowId: workflow.id,
            attachments: {
              create: files.map((f) => ({
                fileName: f.originalname,
                fileUrl: f.filename,
                mimeType: f.mimetype,
              })),
            },
            logs: {
              create: {
                userId: req.user!.id,
                action: "SUBMIT",
              },
            },
          },
          include: { ...DOCUMENT_INCLUDE, logs: true },
        });
      });

      res.status(201).json({ ...document, canApprove: isCurrentApprover(document, req.user!) });
    } catch (err) {
      next(err);
    }
  },
);

router.get("/", authenticate, authorize("document:read:own"), async (req, res, next) => {
  try {
    const documents = await prisma.document.findMany({
      where: { creatorId: req.user!.id },
      orderBy: { createdAt: "desc" },
      include: DOCUMENT_INCLUDE,
    });
    res.json(documents.map((d) => ({ ...d, canApprove: isCurrentApprover(d, req.user!) })));
  } catch (err) {
    next(err);
  }
});

// Đăng ký trước "/:id" để tránh :id nuốt mất path "/pending".
router.get("/pending", authenticate, async (req, res, next) => {
  try {
    const documents = await prisma.document.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: DOCUMENT_INCLUDE,
    });
    const pending = documents.filter((d) => isCurrentApprover(d, req.user!));
    res.json(pending.map((d) => ({ ...d, canApprove: true })));
  } catch (err) {
    next(err);
  }
});

router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: {
        ...DOCUMENT_INCLUDE,
        logs: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!document) {
      throw new AppError(404, "Không tìm thấy văn bản");
    }
    if (!canViewDocument(document, req.user!)) {
      throw new AppError(403, "Không đủ quyền xem văn bản này");
    }

    res.json({ ...document, canApprove: isCurrentApprover(document, req.user!) });
  } catch (err) {
    next(err);
  }
});

router.get(
  "/:id/attachments/:attachmentId/download",
  authenticate,
  async (req, res, next) => {
    try {
      const document = await prisma.document.findUnique({
        where: { id: req.params.id },
        include: { ...DOCUMENT_INCLUDE, logs: true },
      });
      if (!document) {
        throw new AppError(404, "Không tìm thấy văn bản");
      }
      if (!canViewDocument(document, req.user!)) {
        throw new AppError(403, "Không đủ quyền xem văn bản này");
      }

      const attachment = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
      if (!attachment || attachment.documentId !== document.id) {
        throw new AppError(404, "Không tìm thấy file đính kèm");
      }

      const filePath = path.join(UPLOAD_DIR, attachment.fileUrl);
      if (!fs.existsSync(filePath)) {
        throw new AppError(404, "File không còn tồn tại trên máy chủ");
      }

      res.download(filePath, attachment.fileName);
    } catch (err) {
      next(err);
    }
  },
);

const commentOptionalSchema = z.object({ comment: z.string().optional() });
const commentRequiredSchema = z.object({ comment: z.string().min(1, "Cần nêu lý do") });

async function loadDocumentForAction(id: string) {
  const document = await prisma.document.findUnique({
    where: { id },
    include: { ...DOCUMENT_INCLUDE, logs: true },
  });
  if (!document) {
    throw new AppError(404, "Không tìm thấy văn bản");
  }
  return document;
}

router.post("/:id/approve", authenticate, async (req, res, next) => {
  try {
    const parsed = commentOptionalSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new AppError(400, "Dữ liệu không hợp lệ");

    const document = await loadDocumentForAction(req.params.id);
    if (document.status !== "PENDING") {
      throw new AppError(400, "Văn bản không ở trạng thái chờ duyệt");
    }
    if (!isCurrentApprover(document, req.user!)) {
      throw new AppError(403, "Bạn không phải người duyệt ở bước hiện tại của văn bản này");
    }

    const nextStep = document.workflow.steps.find((s) => s.stepOrder === document.currentStep + 1);

    const updated = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.update({
        where: { id: document.id },
        data: nextStep ? { currentStep: document.currentStep + 1 } : { status: "APPROVED" },
        include: { ...DOCUMENT_INCLUDE, logs: true },
      });
      await tx.documentLog.create({
        data: { documentId: document.id, userId: req.user!.id, action: "APPROVE", comment: parsed.data.comment },
      });
      return doc;
    });

    res.json({ ...updated, canApprove: isCurrentApprover(updated, req.user!) });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/reject", authenticate, async (req, res, next) => {
  try {
    const parsed = commentRequiredSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new AppError(400, "Cần nêu lý do từ chối");

    const document = await loadDocumentForAction(req.params.id);
    if (document.status !== "PENDING") {
      throw new AppError(400, "Văn bản không ở trạng thái chờ duyệt");
    }
    if (!isCurrentApprover(document, req.user!)) {
      throw new AppError(403, "Bạn không phải người duyệt ở bước hiện tại của văn bản này");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.update({
        where: { id: document.id },
        data: { status: "REJECTED" },
        include: { ...DOCUMENT_INCLUDE, logs: true },
      });
      await tx.documentLog.create({
        data: { documentId: document.id, userId: req.user!.id, action: "REJECT", comment: parsed.data.comment },
      });
      return doc;
    });

    res.json({ ...updated, canApprove: isCurrentApprover(updated, req.user!) });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/request-change", authenticate, async (req, res, next) => {
  try {
    const parsed = commentRequiredSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new AppError(400, "Cần nêu lý do yêu cầu chỉnh sửa");

    const document = await loadDocumentForAction(req.params.id);
    if (document.status !== "PENDING") {
      throw new AppError(400, "Văn bản không ở trạng thái chờ duyệt");
    }
    if (!isCurrentApprover(document, req.user!)) {
      throw new AppError(403, "Bạn không phải người duyệt ở bước hiện tại của văn bản này");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.update({
        where: { id: document.id },
        data: { status: "CHANGES_REQUESTED" },
        include: { ...DOCUMENT_INCLUDE, logs: true },
      });
      await tx.documentLog.create({
        data: {
          documentId: document.id,
          userId: req.user!.id,
          action: "REQUEST_CHANGE",
          comment: parsed.data.comment,
        },
      });
      return doc;
    });

    res.json({ ...updated, canApprove: isCurrentApprover(updated, req.user!) });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/resubmit", authenticate, async (req, res, next) => {
  try {
    const parsed = commentOptionalSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new AppError(400, "Dữ liệu không hợp lệ");

    const document = await loadDocumentForAction(req.params.id);
    if (document.creatorId !== req.user!.id) {
      throw new AppError(403, "Chỉ người tạo mới được nộp lại văn bản này");
    }
    if (document.status !== "CHANGES_REQUESTED") {
      throw new AppError(400, "Văn bản không ở trạng thái chờ chỉnh sửa");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.update({
        where: { id: document.id },
        data: { status: "PENDING" },
        include: { ...DOCUMENT_INCLUDE, logs: true },
      });
      await tx.documentLog.create({
        data: { documentId: document.id, userId: req.user!.id, action: "SUBMIT", comment: parsed.data.comment },
      });
      return doc;
    });

    res.json({ ...updated, canApprove: isCurrentApprover(updated, req.user!) });
  } catch (err) {
    next(err);
  }
});

export default router;
