import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { upload, UPLOAD_DIR } from "../lib/upload";
import { AppError } from "../lib/errors";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";

const router = Router();

const SAFE_CREATOR_SELECT = { id: true, fullName: true, email: true } as const;

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
        const created = await tx.document.create({
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
          include: {
            attachments: true,
            logs: true,
            creator: { select: SAFE_CREATOR_SELECT },
            workflow: { select: { id: true, name: true } },
          },
        });
        return created;
      });

      res.status(201).json(document);
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
      include: {
        attachments: true,
        creator: { select: SAFE_CREATOR_SELECT },
        workflow: { select: { id: true, name: true } },
      },
    });
    res.json(documents);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", authenticate, authorize("document:read:own"), async (req, res, next) => {
  try {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: {
        attachments: true,
        logs: { orderBy: { createdAt: "asc" } },
        creator: { select: SAFE_CREATOR_SELECT },
        workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
      },
    });

    if (!document) {
      throw new AppError(404, "Không tìm thấy văn bản");
    }
    if (document.creatorId !== req.user!.id) {
      throw new AppError(403, "Không đủ quyền xem văn bản này");
    }

    res.json(document);
  } catch (err) {
    next(err);
  }
});

router.get(
  "/:id/attachments/:attachmentId/download",
  authenticate,
  authorize("document:read:own"),
  async (req, res, next) => {
    try {
      const document = await prisma.document.findUnique({ where: { id: req.params.id } });
      if (!document) {
        throw new AppError(404, "Không tìm thấy văn bản");
      }
      if (document.creatorId !== req.user!.id) {
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

export default router;
