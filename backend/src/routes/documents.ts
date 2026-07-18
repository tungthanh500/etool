import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { upload, UPLOAD_DIR, verifyMagicBytes } from "../lib/upload";
import { AppError } from "../lib/errors";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { canViewDocument, findActingDelegator, getActiveDelegators, isCurrentApprover } from "../lib/workflow";
import { getNotifiableUserIds, notify } from "../lib/notifications";
import { audit } from "../lib/audit";
import { currentYearVN, dayEndVN, dayStartVN, formatDateTimeVN } from "../lib/dateUtils";
import { statusLabelVN, typeLabelVN } from "../lib/labels";
import { stampApprovedPdf } from "../lib/stamp";
import type { ApproverInfo } from "../lib/stamp";

const router = Router();

const SAFE_CREATOR_SELECT = { id: true, fullName: true, email: true, departmentId: true } as const;

const DOCUMENT_INCLUDE = {
  attachments: true,
  creator: { select: SAFE_CREATOR_SELECT },
  workflow: { include: { steps: { orderBy: { stepOrder: "asc" as const } } } },
};

// Join user vào mỗi log để timeline hiển thị được ai đã submit/duyệt/bình luận.
const LOGS_INCLUDE = {
  orderBy: { createdAt: "asc" as const },
  include: { user: { select: SAFE_CREATOR_SELECT } },
};

const VALID_STATUSES = new Set(["DRAFT", "PENDING", "APPROVED", "REJECTED", "CHANGES_REQUESTED", "WITHDRAWN"]);
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface ListQuery {
  page: number;
  limit: number;
  where: Prisma.DocumentWhereInput;
}

// Đọc chung q/status/from/to/page/limit từ query string cho cả "/" và "/pending" —
// tránh lặp logic parse+validate ở 2 route. `extraWhere` là điều kiện cố định riêng
// của từng route (vd. creatorId hoặc status:"PENDING") được gộp cùng bằng AND.
function parseListQuery(req: import("express").Request, extraWhere: Prisma.DocumentWhereInput): ListQuery {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(String(req.query.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );

  const where: Prisma.DocumentWhereInput = { ...extraWhere };

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { docNo: { contains: q, mode: "insensitive" } },
    ];
  }

  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  if (status && VALID_STATUSES.has(status)) {
    where.status = status as Prisma.DocumentWhereInput["status"];
  }

  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: dayStartVN(from) } : {}),
      ...(to ? { lte: dayEndVN(to) } : {}),
    };
  }

  return { page, limit, where };
}

const createDocumentSchema = z.object({
  title: z.string().min(1, "Thiếu tiêu đề"),
  type: z.string().trim().min(1, "Thiếu loại văn bản"),
  formData: z.string().optional(),
});

router.post(
  "/",
  authenticate,
  authorize("document:create"),
  upload.array("attachments", 10),
  verifyMagicBytes,
  async (req, res, next) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
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

      const document = await prisma.$transaction(async (tx) => {
        // Cấp số văn bản atomic: upsert kèm increment là 1 câu SQL duy nhất
        // (INSERT ... ON CONFLICT DO UPDATE SET seq = seq + 1), Postgres khoá dòng
        // theo year nên 2 request tạo văn bản đồng thời không thể nhận trùng số.
        const year = currentYearVN();
        const counter = await tx.docCounter.upsert({
          where: { year },
          create: { year, seq: 1 },
          update: { seq: { increment: 1 } },
        });
        const docNo = `VB-${year}-${String(counter.seq).padStart(4, "0")}`;

        return tx.document.create({
          data: {
            docNo,
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
          include: { ...DOCUMENT_INCLUDE, logs: LOGS_INCLUDE },
        });
      });

      notify(await getNotifiableUserIds(document, req.user!.id), {
        type: "document:created",
        documentId: document.id,
        title: document.title,
        actorName: req.user!.fullName,
      });

      audit({ req, category: "DOCUMENT", action: "SUBMIT", targetType: "document", targetId: document.id, detail: document.title });
      for (const f of files) {
        audit({ req, category: "FILE", action: "FILE_UPLOAD", targetType: "document", targetId: document.id, detail: f.originalname });
      }

      res.status(201).json({ ...document, canApprove: isCurrentApprover(document, req.user!) });
    } catch (err) {
      // Multer đã ghi file lên đĩa trước khi handler chạy — nếu bất kỳ bước nào
      // sau đó thất bại (validate, workflow thiếu, lỗi DB), phải dọn file rác.
      for (const file of files) {
        fs.unlink(file.path, (unlinkErr) => {
          if (unlinkErr) console.error(`Lỗi xóa file mồ côi: ${file.path}`, unlinkErr);
        });
      }
      next(err);
    }
  },
);

const editDocumentSchema = z.object({
  title: z.string().min(1).optional(),
  formData: z.string().optional(),
  // JSON array string các attachment ORIGINAL cần xoá kèm lần sửa này.
  removeAttachmentIds: z.string().optional(),
});

// Chỉ người tạo được sửa, chỉ khi văn bản đang ở trạng thái CHANGES_REQUESTED
// (người duyệt yêu cầu chỉnh sửa). Nộp lại (đổi trạng thái về PENDING) vẫn là
// hành động riêng ở route /resubmit — route này chỉ sửa nội dung tại chỗ.
router.patch(
  "/:id",
  authenticate,
  upload.array("attachments", 10),
  verifyMagicBytes,
  async (req, res, next) => {
    const newFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
    try {
      const parsed = editDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      }
      const { title, formData: formDataRaw, removeAttachmentIds: removeIdsRaw } = parsed.data;

      const document = await loadDocumentForAction(req.params.id);
      if (document.creatorId !== req.user!.id) {
        throw new AppError(403, "Chỉ người tạo mới được sửa văn bản này");
      }
      if (document.status !== "CHANGES_REQUESTED") {
        throw new AppError(400, "Văn bản không ở trạng thái chờ chỉnh sửa");
      }

      let formData: unknown | undefined;
      if (formDataRaw !== undefined) {
        try {
          formData = JSON.parse(formDataRaw);
        } catch {
          throw new AppError(400, "formData phải là chuỗi JSON hợp lệ");
        }
        if (typeof formData !== "object" || formData === null || Array.isArray(formData)) {
          throw new AppError(400, "formData phải là một object JSON");
        }
      }

      let removeAttachmentIds: string[] = [];
      if (removeIdsRaw !== undefined) {
        try {
          removeAttachmentIds = JSON.parse(removeIdsRaw);
        } catch {
          throw new AppError(400, "removeAttachmentIds phải là chuỗi JSON hợp lệ");
        }
        if (!Array.isArray(removeAttachmentIds) || removeAttachmentIds.some((v) => typeof v !== "string")) {
          throw new AppError(400, "removeAttachmentIds phải là mảng chuỗi id");
        }
      }

      // Chỉ cho xoá attachment ORIGINAL thuộc đúng văn bản này — chặn xoá nhầm/xoá
      // chéo attachment của văn bản khác qua id đoán được.
      const attachmentsToRemove = document.attachments.filter(
        (a) => removeAttachmentIds.includes(a.id) && a.kind !== "APPROVED",
      );

      const updated = await prisma.$transaction(async (tx) => {
        if (attachmentsToRemove.length > 0) {
          await tx.attachment.deleteMany({
            where: { id: { in: attachmentsToRemove.map((a) => a.id) } },
          });
        }
        if (newFiles.length > 0) {
          await tx.attachment.createMany({
            data: newFiles.map((f) => ({
              documentId: document.id,
              fileName: f.originalname,
              fileUrl: f.filename,
              mimeType: f.mimetype,
            })),
          });
        }
        await tx.documentLog.create({
          data: { documentId: document.id, userId: req.user!.id, action: "EDIT" },
        });
        return tx.document.update({
          where: { id: document.id },
          data: {
            ...(title !== undefined ? { title } : {}),
            ...(formData !== undefined ? { formData: formData as object } : {}),
          },
          include: { ...DOCUMENT_INCLUDE, logs: LOGS_INCLUDE },
        });
      });

      // Xoá file vật lý CHỈ sau khi transaction đã commit thành công.
      for (const a of attachmentsToRemove) {
        fs.unlink(path.join(UPLOAD_DIR, a.fileUrl), (unlinkErr) => {
          if (unlinkErr) console.error(`Lỗi xóa file: ${a.fileUrl}`, unlinkErr);
        });
      }

      audit({ req, category: "DOCUMENT", action: "EDIT", targetType: "document", targetId: updated.id, detail: updated.title });
      for (const f of newFiles) {
        audit({ req, category: "FILE", action: "FILE_UPLOAD", targetType: "document", targetId: updated.id, detail: f.originalname });
      }
      for (const a of attachmentsToRemove) {
        audit({ req, category: "FILE", action: "FILE_DELETE", targetType: "document", targetId: updated.id, detail: a.fileName });
      }

      res.json({ ...updated, canApprove: isCurrentApprover(updated, req.user!) });
    } catch (err) {
      for (const file of newFiles) {
        fs.unlink(file.path, (unlinkErr) => {
          if (unlinkErr) console.error(`Lỗi xóa file mồ côi: ${file.path}`, unlinkErr);
        });
      }
      next(err);
    }
  },
);

// q/status/from/to lọc thẳng ở DB, phân trang chính xác (total đếm cùng where).
router.get("/", authenticate, authorize("document:read:own"), async (req, res, next) => {
  try {
    const { page, limit, where } = parseListQuery(req, { creatorId: req.user!.id });

    const [items, total, delegators] = await Promise.all([
      prisma.document.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: DOCUMENT_INCLUDE,
      }),
      prisma.document.count({ where }),
      getActiveDelegators(req.user!.id),
    ]);

    res.json({
      items: items.map((d) => ({ ...d, canApprove: isCurrentApprover(d, req.user!, delegators) })),
      total,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
});

// Đăng ký trước "/:id" để tránh :id nuốt mất path "/pending".
//
// GIỚI HẠN CỐ Ý (ghi rõ theo ACTION_PLAN.md mục 3.2): điều kiện approver thật sự
// (đúng bước hiện tại + Dept_Head phải cùng phòng ban người tạo — xem lib/workflow.ts)
// không thể diễn đạt trực tiếp trong Prisma `where` vì nó so sánh currentStep của
// Document với stepOrder của WorkflowStep, hai cột khác bảng. Chỉ đẩy xuống DB được
// phần lọc thô "role của mình có xuất hiện ở ĐÂU ĐÓ trong workflow" để giảm tập dữ
// liệu cần tải; điều kiện chính xác (canApprove) vẫn hậu kiểm ở app layer, kéo theo
// `total`/phân trang ở route này tính trên tập ĐÃ lọc chính xác trong bộ nhớ, không
// phải một COUNT(*) trực tiếp từ DB như route "/" ở trên. Chấp nhận được ở quy mô
// dữ liệu hiện tại (nội bộ, không phải hàng chục nghìn hồ sơ PENDING đồng thời).
router.get("/pending", authenticate, async (req, res, next) => {
  try {
    // Lọc thô ở DB phải gồm CẢ role của những người đang uỷ quyền cho mình (mục 4.1) —
    // nếu chỉ lọc theo role bản thân, hồ sơ chỉ duyệt được qua uỷ quyền sẽ bị bỏ sót
    // trước khi tới bước hậu kiểm isCurrentApprover.
    const delegators = await getActiveDelegators(req.user!.id);
    const roleNames = [...new Set([req.user!.role.name, ...delegators.map((d) => d.role.name)])];

    const { page, limit, where } = parseListQuery(req, {
      status: "PENDING",
      workflow: { steps: { some: { approverRole: { in: roleNames } } } },
    });

    const candidates = await prisma.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: DOCUMENT_INCLUDE,
    });
    const filtered = candidates.filter((d) => isCurrentApprover(d, req.user!, delegators));
    const total = filtered.length;
    const items = filtered.slice((page - 1) * limit, (page - 1) * limit + limit);

    res.json({ items: items.map((d) => ({ ...d, canApprove: true })), total, page, limit });
  } catch (err) {
    next(err);
  }
});

// Xuất Excel danh sách văn bản — cùng phạm vi (creatorId) và cùng bộ lọc q/status/from/to
// với GET "/", nhưng KHÔNG phân trang (xuất toàn bộ kết quả khớp). Đăng ký trước "/:id".
router.get("/export", authenticate, authorize("document:read:own"), async (req, res, next) => {
  try {
    const { where } = parseListQuery(req, { creatorId: req.user!.id });
    const documents = await prisma.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        creator: { select: SAFE_CREATOR_SELECT },
        // Chỉ cần log APPROVE mới nhất để suy ra "ngày duyệt cuối".
        logs: { where: { action: "APPROVE" }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Văn bản");
    sheet.columns = [
      { header: "Số VB", key: "docNo", width: 16 },
      { header: "Tiêu đề", key: "title", width: 40 },
      { header: "Loại", key: "type", width: 20 },
      { header: "Trạng thái", key: "status", width: 18 },
      { header: "Người tạo", key: "creator", width: 26 },
      { header: "Ngày tạo", key: "createdAt", width: 24 },
      { header: "Ngày duyệt cuối", key: "approvedAt", width: 24 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const d of documents) {
      const lastApprove = d.logs[0];
      // Ngày duyệt cuối chỉ có ý nghĩa khi hồ sơ đã APPROVED; các trạng thái khác để trống.
      const approvedAt = d.status === "APPROVED" && lastApprove ? formatDateTimeVN(lastApprove.createdAt) : "";
      sheet.addRow({
        docNo: d.docNo ?? "",
        title: d.title,
        type: typeLabelVN(d.type),
        status: statusLabelVN(d.status),
        creator: d.creator.fullName,
        createdAt: formatDateTimeVN(d.createdAt),
        approvedAt,
      });
    }

    audit({ req, category: "FILE", action: "EXPORT", targetType: "document", detail: `Xuất ${documents.length} văn bản ra Excel` });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", 'attachment; filename="danh-sach-van-ban.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
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
        logs: LOGS_INCLUDE,
      },
    });

    if (!document) {
      throw new AppError(404, "Không tìm thấy văn bản");
    }
    const delegators = await getActiveDelegators(req.user!.id);
    if (!canViewDocument(document, req.user!, delegators)) {
      throw new AppError(403, "Không đủ quyền xem văn bản này");
    }

    // approvingVia: tên người uỷ quyền nếu user chỉ có quyền duyệt hồ sơ này QUA uỷ quyền
    // — frontend dùng để hiện banner "đang duyệt thay X".
    const actingDelegator = findActingDelegator(document, req.user!, delegators);
    res.json({
      ...document,
      canApprove: isCurrentApprover(document, req.user!, delegators),
      approvingVia: actingDelegator?.fullName ?? null,
    });
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
        include: { ...DOCUMENT_INCLUDE, logs: LOGS_INCLUDE },
      });
      if (!document) {
        throw new AppError(404, "Không tìm thấy văn bản");
      }
      if (!canViewDocument(document, req.user!, await getActiveDelegators(req.user!.id))) {
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

      audit({ req, category: "FILE", action: "FILE_DOWNLOAD", targetType: "attachment", targetId: attachment.id, detail: attachment.fileName });
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
    include: { ...DOCUMENT_INCLUDE, logs: LOGS_INCLUDE },
  });
  if (!document) {
    throw new AppError(404, "Không tìm thấy văn bản");
  }
  return document;
}

// Tự động đóng dấu "ĐÃ PHÊ DUYỆT" + khối chữ ký (mục 2.4/2.5) khi hồ sơ vừa chuyển
// APPROVED và người duyệt cuối KHÔNG tự tay đính kèm bản đã ký. Chạy sau khi transaction
// duyệt đã commit (không giữ transaction lâu chờ xử lý PDF); lỗi đóng dấu KHÔNG được
// làm hỏng việc duyệt — chỉ log lại, hồ sơ vẫn coi là đã duyệt xong bình thường.
async function autoStampApprovedPdfs(
  req: import("express").Request,
  document: { id: string; docNo: string | null; attachments: { id: string; kind: string; mimeType: string; fileUrl: string; fileName: string }[] },
): Promise<void> {
  try {
    const approveLogs = await prisma.documentLog.findMany({
      where: { documentId: document.id, action: "APPROVE" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { fullName: true, signatureUrl: true, role: { select: { name: true } } } } },
    });
    if (approveLogs.length === 0) return;

    const approvers: ApproverInfo[] = approveLogs.map((l) => ({
      fullName: l.user.fullName,
      roleName: l.user.role.name,
      approvedAt: l.createdAt,
      signatureUrl: l.user.signatureUrl,
    }));

    for (const attachment of document.attachments) {
      if (attachment.kind === "APPROVED" || attachment.mimeType !== "application/pdf") continue;
      const srcPath = path.join(UPLOAD_DIR, attachment.fileUrl);
      if (!fs.existsSync(srcPath)) continue;

      const stampedBytes = await stampApprovedPdf(fs.readFileSync(srcPath), {
        docNo: document.docNo,
        approvers,
      });
      const newFilename = `${crypto.randomUUID()}.pdf`;
      fs.writeFileSync(path.join(UPLOAD_DIR, newFilename), stampedBytes);

      const stampedFileName = attachment.fileName.replace(/\.pdf$/i, "") + "-da-duyet.pdf";
      await prisma.attachment.create({
        data: {
          documentId: document.id,
          fileName: stampedFileName,
          fileUrl: newFilename,
          mimeType: "application/pdf",
          kind: "APPROVED",
        },
      });
      audit({ req, category: "FILE", action: "FILE_UPLOAD", targetType: "document", targetId: document.id, detail: `Bản đóng dấu tự động: ${stampedFileName}` });
    }
  } catch (err) {
    console.error(`Lỗi đóng dấu PDF tự động cho văn bản ${document.id}:`, err);
  }
}

// upload.single("approvedFile"): người duyệt bước cuối có thể đính kèm bản đã ký
// ngay khi bấm Duyệt. Middleware an toàn với cả request JSON (multer bỏ qua khi
// không phải multipart), nên các lần duyệt không kèm file vẫn hoạt động như cũ.
router.post("/:id/approve", authenticate, upload.single("approvedFile"), verifyMagicBytes, async (req, res, next) => {
  const approvedFile = req.file as Express.Multer.File | undefined;
  try {
    const parsed = commentOptionalSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new AppError(400, "Dữ liệu không hợp lệ");

    const document = await loadDocumentForAction(req.params.id);
    if (document.status !== "PENDING") {
      throw new AppError(400, "Văn bản không ở trạng thái chờ duyệt");
    }
    const delegators = await getActiveDelegators(req.user!.id);
    if (!isCurrentApprover(document, req.user!, delegators)) {
      throw new AppError(403, "Bạn không phải người duyệt ở bước hiện tại của văn bản này");
    }
    // Duyệt theo uỷ quyền: ghi rõ vào comment của log để timeline + PDF thể hiện đúng ai duyệt thay ai.
    const actingDelegator = findActingDelegator(document, req.user!, delegators);
    const delegationNote = actingDelegator ? `(duyệt thay — uỷ quyền bởi ${actingDelegator.fullName})` : null;
    const logComment = [parsed.data.comment, delegationNote].filter(Boolean).join(" ") || undefined;

    const nextStep = document.workflow.steps.find((s) => s.stepOrder === document.currentStep + 1);
    const isFinalApproval = !nextStep;

    // Bản đã ký chỉ được đính kèm ở bước duyệt cuối (khi hồ sơ chuyển sang APPROVED).
    if (approvedFile && !isFinalApproval) {
      throw new AppError(400, "Chỉ đính kèm bản đã ký ở bước duyệt cuối");
    }

    // where kèm currentStep+status: nếu hồ sơ đã bị request khác xử lý trước,
    // điều kiện không khớp nữa và Prisma ném P2025 thay vì ghi đè âm thầm.
    // Ghi log trước rồi mới update+include: nếu làm ngược lại, include.logs sẽ
    // chụp ảnh trước khi log này tồn tại, khiến response thiếu đúng entry vừa tạo.
    const updated = await prisma.$transaction(async (tx) => {
      await tx.documentLog.create({
        data: { documentId: document.id, userId: req.user!.id, action: "APPROVE", comment: logComment },
      });
      if (approvedFile && isFinalApproval) {
        await tx.attachment.create({
          data: {
            documentId: document.id,
            fileName: approvedFile.originalname,
            fileUrl: approvedFile.filename,
            mimeType: approvedFile.mimetype,
            kind: "APPROVED",
          },
        });
      }
      return tx.document.update({
        where: { id: document.id, currentStep: document.currentStep, status: "PENDING" },
        data: nextStep ? { currentStep: document.currentStep + 1 } : { status: "APPROVED" },
        include: { ...DOCUMENT_INCLUDE, logs: LOGS_INCLUDE },
      });
    });

    notify(await getNotifiableUserIds(updated, req.user!.id), {
      type: updated.status === "APPROVED" ? "document:approved" : "document:step_advanced",
      documentId: updated.id,
      title: updated.title,
      actorName: req.user!.fullName,
    });

    audit({ req, category: "DOCUMENT", action: "APPROVE", targetType: "document", targetId: updated.id, detail: updated.title });
    if (approvedFile && isFinalApproval) {
      audit({ req, category: "FILE", action: "FILE_UPLOAD", targetType: "document", targetId: updated.id, detail: `Bản đã ký: ${approvedFile.originalname}` });
    }

    // Không có bản ký tay do người duyệt cuối tự đính kèm → tự sinh bản PDF đóng dấu.
    let responseDoc = updated;
    if (updated.status === "APPROVED" && !approvedFile) {
      await autoStampApprovedPdfs(req, updated);
      responseDoc = await loadDocumentForAction(updated.id);
    }

    res.json({ ...responseDoc, canApprove: isCurrentApprover(responseDoc, req.user!, delegators) });
  } catch (err) {
    // Multer đã ghi file lên đĩa trước handler — nếu duyệt thất bại (sai trạng thái,
    // không phải người duyệt, không phải bước cuối, lỗi DB), dọn file mồ côi.
    if (approvedFile) {
      fs.unlink(approvedFile.path, (unlinkErr) => {
        if (unlinkErr) console.error(`Lỗi xóa file mồ côi: ${approvedFile.path}`, unlinkErr);
      });
    }
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
    const delegators = await getActiveDelegators(req.user!.id);
    if (!isCurrentApprover(document, req.user!, delegators)) {
      throw new AppError(403, "Bạn không phải người duyệt ở bước hiện tại của văn bản này");
    }
    const actingDelegator = findActingDelegator(document, req.user!, delegators);
    const logComment = actingDelegator
      ? `${parsed.data.comment} (duyệt thay — uỷ quyền bởi ${actingDelegator.fullName})`
      : parsed.data.comment;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.documentLog.create({
        data: { documentId: document.id, userId: req.user!.id, action: "REJECT", comment: logComment },
      });
      return tx.document.update({
        where: { id: document.id, currentStep: document.currentStep, status: "PENDING" },
        data: { status: "REJECTED" },
        include: { ...DOCUMENT_INCLUDE, logs: LOGS_INCLUDE },
      });
    });

    notify(await getNotifiableUserIds(updated, req.user!.id), {
      type: "document:rejected",
      documentId: updated.id,
      title: updated.title,
      actorName: req.user!.fullName,
    });

    audit({ req, category: "DOCUMENT", action: "REJECT", targetType: "document", targetId: updated.id, detail: updated.title });
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
    const delegators = await getActiveDelegators(req.user!.id);
    if (!isCurrentApprover(document, req.user!, delegators)) {
      throw new AppError(403, "Bạn không phải người duyệt ở bước hiện tại của văn bản này");
    }
    const actingDelegator = findActingDelegator(document, req.user!, delegators);
    const logComment = actingDelegator
      ? `${parsed.data.comment} (duyệt thay — uỷ quyền bởi ${actingDelegator.fullName})`
      : parsed.data.comment;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.documentLog.create({
        data: {
          documentId: document.id,
          userId: req.user!.id,
          action: "REQUEST_CHANGE",
          comment: logComment,
        },
      });
      return tx.document.update({
        where: { id: document.id, currentStep: document.currentStep, status: "PENDING" },
        data: { status: "CHANGES_REQUESTED" },
        include: { ...DOCUMENT_INCLUDE, logs: LOGS_INCLUDE },
      });
    });

    notify(await getNotifiableUserIds(updated, req.user!.id), {
      type: "document:changes_requested",
      documentId: updated.id,
      title: updated.title,
      actorName: req.user!.fullName,
    });

    audit({ req, category: "DOCUMENT", action: "REQUEST_CHANGE", targetType: "document", targetId: updated.id, detail: updated.title });
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
      await tx.documentLog.create({
        data: { documentId: document.id, userId: req.user!.id, action: "SUBMIT", comment: parsed.data.comment },
      });
      return tx.document.update({
        where: { id: document.id, status: "CHANGES_REQUESTED" },
        data: { status: "PENDING" },
        include: { ...DOCUMENT_INCLUDE, logs: LOGS_INCLUDE },
      });
    });

    notify(await getNotifiableUserIds(updated, req.user!.id), {
      type: "document:resubmitted",
      documentId: updated.id,
      title: updated.title,
      actorName: req.user!.fullName,
    });

    audit({ req, category: "DOCUMENT", action: "RESUBMIT", targetType: "document", targetId: updated.id, detail: updated.title });
    res.json({ ...updated, canApprove: isCurrentApprover(updated, req.user!) });
  } catch (err) {
    next(err);
  }
});

// Người tạo tự rút văn bản khi còn PENDING (nộp nhầm, đổi ý...). Không cho nộp lại
// từ WITHDRAWN — muốn trình lại thì tạo văn bản mới, tránh làm phức tạp workflow engine.
router.post("/:id/withdraw", authenticate, async (req, res, next) => {
  try {
    const document = await loadDocumentForAction(req.params.id);
    if (document.creatorId !== req.user!.id) {
      throw new AppError(403, "Chỉ người tạo mới được thu hồi văn bản này");
    }
    if (document.status !== "PENDING") {
      throw new AppError(400, "Chỉ có thể thu hồi văn bản đang ở trạng thái chờ duyệt");
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.documentLog.create({
        data: { documentId: document.id, userId: req.user!.id, action: "WITHDRAW" },
      });
      return tx.document.update({
        where: { id: document.id, currentStep: document.currentStep, status: "PENDING" },
        data: { status: "WITHDRAWN" },
        include: { ...DOCUMENT_INCLUDE, logs: LOGS_INCLUDE },
      });
    });

    notify(await getNotifiableUserIds(updated, req.user!.id), {
      type: "document:withdrawn",
      documentId: updated.id,
      title: updated.title,
      actorName: req.user!.fullName,
    });

    audit({ req, category: "DOCUMENT", action: "WITHDRAW", targetType: "document", targetId: updated.id, detail: updated.title });
    res.json({ ...updated, canApprove: isCurrentApprover(updated, req.user!) });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/comments", authenticate, async (req, res, next) => {
  try {
    const parsed = commentRequiredSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new AppError(400, "Cần nhập nội dung bình luận");

    const document = await loadDocumentForAction(req.params.id);
    if (!canViewDocument(document, req.user!, await getActiveDelegators(req.user!.id))) {
      throw new AppError(403, "Không đủ quyền bình luận trên văn bản này");
    }

    const log = await prisma.documentLog.create({
      data: {
        documentId: document.id,
        userId: req.user!.id,
        action: "COMMENT",
        comment: parsed.data.comment,
      },
      include: { user: { select: SAFE_CREATOR_SELECT } },
    });

    notify(await getNotifiableUserIds(document, req.user!.id), {
      type: "document:commented",
      documentId: document.id,
      title: document.title,
      actorName: req.user!.fullName,
    });

    audit({ req, category: "DOCUMENT", action: "COMMENT", targetType: "document", targetId: document.id, detail: document.title });
    res.status(201).json(log);
  } catch (err) {
    next(err);
  }
});

export default router;
