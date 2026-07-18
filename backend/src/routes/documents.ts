import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { upload, UPLOAD_DIR, verifyMagicBytes } from "../lib/upload";
import { AppError } from "../lib/errors";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import {
  buildPendingWorkflowFilter,
  canViewDocument,
  findActingDelegator,
  getActiveDelegators,
  isCurrentApprover,
  resolveEffectiveStep,
} from "../lib/workflow";
import { deriveTitle, validateDocumentForm } from "../lib/documentForms";
import { getNotifiableUserIds, notify } from "../lib/notifications";
import { audit } from "../lib/audit";
import { currentYearVN, dayEndVN, dayStartVN, formatDateTimeVN } from "../lib/dateUtils";
import { statusLabelVN, typeLabelVN } from "../lib/labels";
import { generateLeavePdfAttachment } from "../lib/documentPdf";
import { DOCUMENT_INCLUDE, LOGS_INCLUDE, SAFE_CREATOR_SELECT } from "../lib/documentInclude";
import {
  approveDocument,
  commentOnDocument,
  loadDocumentForAction,
  rejectDocument,
  requestChangeDocument,
  resubmitDocument,
  skipReasonText,
  withdrawDocument,
} from "../lib/documentActions";

const router = Router();

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

// title tuỳ chọn: LEAVE/PAYMENT tự sinh tiêu đề từ formData (deriveTitle) — bắt buộc
// gõ tay chỉ áp dụng cho GENERAL/PURCHASE/loại tuỳ biến, kiểm tra sau khi biết type.
const createDocumentSchema = z.object({
  title: z.string().trim().optional(),
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
      const { type } = parsed.data;

      let formDataRaw: unknown = {};
      if (parsed.data.formData) {
        try {
          formDataRaw = JSON.parse(parsed.data.formData);
        } catch {
          throw new AppError(400, "formData phải là chuỗi JSON hợp lệ");
        }
      }
      // Validate + tính trường dẫn xuất (soNgay, tongTien...) theo đúng schema của type (mục 5.1).
      const formData = validateDocumentForm(type, formDataRaw);

      // LEAVE/PAYMENT tự sinh tiêu đề từ formData — bỏ qua title client gửi (nếu có).
      const derivedTitle = deriveTitle(type, formData as Record<string, unknown>, req.user!.fullName);
      const title = derivedTitle ?? parsed.data.title;
      if (!title || !title.trim()) {
        throw new AppError(400, "Thiếu tiêu đề");
      }

      // "Đơn hàng": người duyệt chỉ xem file để quyết định — bắt buộc có ít nhất 1 file.
      if (type === "PURCHASE" && files.length === 0) {
        throw new AppError(400, "Đơn hàng cần đính kèm ít nhất 1 file");
      }

      const workflow = await prisma.workflow.findFirst({
        where: { name: type },
        include: { steps: true },
      });
      if (!workflow) {
        throw new AppError(500, `Chưa cấu hình quy trình duyệt cho loại văn bản "${type}"`);
      }

      // Quy tắc tự động bỏ qua bước (mục 5.6B), tính trước khi tạo: bước nào không có
      // ai đủ điều kiện duyệt, hoặc người đủ điều kiện duy nhất chính là người tạo, thì
      // bỏ qua. Nếu bỏ hết mọi bước → không tạo được văn bản, tránh hồ sơ kẹt vĩnh viễn
      // không ai thấy.
      const skipResult = await resolveEffectiveStep(
        workflow.steps,
        1,
        req.user!.id,
        req.user!.departmentId,
      );
      if (skipResult.finalStepOrder === null) {
        throw new AppError(400, "Luồng duyệt không có người duyệt hợp lệ cho văn bản này");
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

        const created = await tx.document.create({
          data: {
            docNo,
            title,
            type,
            formData: formData as object,
            status: "PENDING",
            currentStep: skipResult.finalStepOrder!,
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
        });

        for (const s of skipResult.skipped) {
          await tx.documentLog.create({
            data: {
              documentId: created.id,
              userId: req.user!.id,
              action: "STEP_SKIPPED",
              comment: skipReasonText(s.stepOrder, s.reason),
              meta: { skippedStepOrder: s.stepOrder, reason: s.reason },
            },
          });
        }

        return tx.document.findUniqueOrThrow({
          where: { id: created.id },
          include: { ...DOCUMENT_INCLUDE, logs: LOGS_INCLUDE },
        });
      });

      // LEAVE không có file người dùng upload — tự sinh PDF đơn làm Attachment thay thế
      // (mục 5.2). Khu PHẦN PHÊ DUYỆT để trống/chờ, trừ bước nào vừa bị auto-skip ở trên.
      let responseDocument = document;
      if (type === "LEAVE") {
        await generateLeavePdfAttachment(document, "ORIGINAL");
        responseDocument = await prisma.document.findUniqueOrThrow({
          where: { id: document.id },
          include: { ...DOCUMENT_INCLUDE, logs: LOGS_INCLUDE },
        });
      }

      notify(await getNotifiableUserIds(responseDocument, req.user!.id), {
        type: "document:created",
        documentId: responseDocument.id,
        title: responseDocument.title,
        actorName: req.user!.fullName,
      });

      audit({ req, category: "DOCUMENT", action: "SUBMIT", targetType: "document", targetId: responseDocument.id, detail: responseDocument.title });
      for (const f of files) {
        audit({ req, category: "FILE", action: "FILE_UPLOAD", targetType: "document", targetId: responseDocument.id, detail: f.originalname });
      }

      res.status(201).json({ ...responseDocument, canApprove: isCurrentApprover(responseDocument, req.user!) });
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

      let formData: object | undefined;
      let derivedTitle: string | null = null;
      if (formDataRaw !== undefined) {
        let formDataParsed: unknown;
        try {
          formDataParsed = JSON.parse(formDataRaw);
        } catch {
          throw new AppError(400, "formData phải là chuỗi JSON hợp lệ");
        }
        // Cùng schema + tính lại trường dẫn xuất như lúc tạo (mục 5.1) — type không đổi
        // được sau khi tạo nên luôn biết đúng schema cần áp dụng.
        formData = validateDocumentForm(document.type, formDataParsed);
        derivedTitle = deriveTitle(document.type, formData as Record<string, unknown>, document.creator.fullName);
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

      // "Đơn hàng" bắt buộc còn ít nhất 1 file sau khi sửa — không cho xoá hết mà không bù lại.
      if (document.type === "PURCHASE") {
        const remaining =
          document.attachments.filter((a) => a.kind !== "APPROVED").length -
          attachmentsToRemove.length +
          newFiles.length;
        if (remaining <= 0) {
          throw new AppError(400, "Đơn hàng cần đính kèm ít nhất 1 file");
        }
      }

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
            ...(derivedTitle !== null ? { title: derivedTitle } : title !== undefined ? { title } : {}),
            ...(formData !== undefined ? { formData } : {}),
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
    // Lọc thô ở DB phải gồm CẢ vị trí của những người đang uỷ quyền cho mình (mục 4.1) —
    // nếu chỉ lọc theo vị trí bản thân, hồ sơ chỉ duyệt được qua uỷ quyền sẽ bị bỏ sót
    // trước khi tới bước hậu kiểm isCurrentApprover.
    const delegators = await getActiveDelegators(req.user!.id);

    const { page, limit, where } = parseListQuery(req, {
      status: "PENDING",
      workflow: buildPendingWorkflowFilter(req.user!, delegators),
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

// upload.single("approvedFile"): người duyệt bước cuối có thể đính kèm bản đã ký ngay khi
// bấm Duyệt. Middleware an toàn với cả request JSON (multer bỏ qua khi không phải
// multipart). Logic nghiệp vụ ở approveDocument (lib/documentActions.ts); route chỉ dọn
// file mồ côi nếu duyệt thất bại (multer đã ghi file lên đĩa trước handler).
router.post("/:id/approve", authenticate, upload.single("approvedFile"), verifyMagicBytes, async (req, res, next) => {
  const approvedFile = req.file as Express.Multer.File | undefined;
  try {
    res.json(await approveDocument(req));
  } catch (err) {
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
    res.json(await rejectDocument(req));
  } catch (err) {
    next(err);
  }
});

router.post("/:id/request-change", authenticate, async (req, res, next) => {
  try {
    res.json(await requestChangeDocument(req));
  } catch (err) {
    next(err);
  }
});

router.post("/:id/resubmit", authenticate, async (req, res, next) => {
  try {
    res.json(await resubmitDocument(req));
  } catch (err) {
    next(err);
  }
});

router.post("/:id/withdraw", authenticate, async (req, res, next) => {
  try {
    res.json(await withdrawDocument(req));
  } catch (err) {
    next(err);
  }
});

router.post("/:id/comments", authenticate, async (req, res, next) => {
  try {
    res.status(201).json(await commentOnDocument(req));
  } catch (err) {
    next(err);
  }
});

export default router;
