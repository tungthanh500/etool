import type { Request } from "express";
import { z } from "zod";
import { prisma } from "./prisma";
import { AppError } from "./errors";
import {
  canViewDocument,
  findActingDelegator,
  getActiveDelegators,
  isCurrentApprover,
  resolveEffectiveStep,
} from "./workflow";
import { getNotifiableUserIds, notify } from "./notifications";
import { audit } from "./audit";
import { generateLeavePdfAttachment, autoStampApprovedPdfs } from "./documentPdf";
import { DOCUMENT_INCLUDE, LOGS_INCLUDE, SAFE_CREATOR_SELECT } from "./documentInclude";

// Nghiệp vụ các hành động trên văn bản (duyệt/từ chối/yêu cầu sửa/nộp lại/thu hồi/bình
// luận) tách khỏi routes/documents.ts để route chỉ còn lo HTTP. Mỗi hàm nhận req (dùng
// req.user!, req.params.id, req.body, req.file như handler cũ; audit + autoStamp cũng cần
// req), trả về payload để route res.json — hoặc ném AppError. Hành vi giữ NGUYÊN so với
// khi còn là handler inline.

const commentOptionalSchema = z.object({ comment: z.string().optional() });
const commentRequiredSchema = z.object({ comment: z.string().min(1, "Cần nêu lý do") });

export async function loadDocumentForAction(id: string) {
  const document = await prisma.document.findUnique({
    where: { id },
    include: { ...DOCUMENT_INCLUDE, logs: LOGS_INCLUDE },
  });
  if (!document) {
    throw new AppError(404, "Không tìm thấy văn bản");
  }
  return document;
}

// Nội dung log STEP_SKIPPED (mục 5.6B) — ghi rõ lý do để timeline minh bạch, không phải
// một bước "biến mất" âm thầm.
export function skipReasonText(stepOrder: number, reason: "EMPTY" | "ONLY_CREATOR"): string {
  const why = reason === "ONLY_CREATOR" ? "người tạo là người duyệt" : "không có người đảm nhiệm";
  return `Bỏ qua bước ${stepOrder} — ${why}`;
}

export async function approveDocument(req: Request) {
  const approvedFile = req.file as Express.Multer.File | undefined;
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

  // Quy tắc tự động bỏ qua bước (5.6B): tìm bước "thật" tiếp theo từ currentStep+1,
  // bỏ qua bước nào rỗng người duyệt hoặc chỉ có đúng người tạo. Hết bước -> APPROVED.
  const skipResult = await resolveEffectiveStep(
    document.workflow.steps,
    document.currentStep + 1,
    document.creatorId,
    document.creator.departmentId,
  );
  const isFinalApproval = skipResult.finalStepOrder === null;

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
    for (const s of skipResult.skipped) {
      await tx.documentLog.create({
        data: {
          documentId: document.id,
          userId: req.user!.id,
          action: "STEP_SKIPPED",
          comment: skipReasonText(s.stepOrder, s.reason),
        },
      });
    }
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
      data: isFinalApproval ? { status: "APPROVED" } : { currentStep: skipResult.finalStepOrder! },
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
    // LEAVE: regenerate toàn bộ PDF (khu PHẦN PHÊ DUYỆT điền đầy đủ) — không chèn
    // trang bìa/phụ lục như 2.4/2.5, xem generateLeavePdfAttachment (mục 5.2).
    if (updated.type === "LEAVE") {
      await generateLeavePdfAttachment(updated, "APPROVED");
    } else {
      await autoStampApprovedPdfs(req, updated);
    }
    responseDoc = await loadDocumentForAction(updated.id);
  }

  return { ...responseDoc, canApprove: isCurrentApprover(responseDoc, req.user!, delegators) };
}

export async function rejectDocument(req: Request) {
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
  return { ...updated, canApprove: isCurrentApprover(updated, req.user!) };
}

export async function requestChangeDocument(req: Request) {
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
  return { ...updated, canApprove: isCurrentApprover(updated, req.user!) };
}

export async function resubmitDocument(req: Request) {
  const parsed = commentOptionalSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new AppError(400, "Dữ liệu không hợp lệ");

  const document = await loadDocumentForAction(req.params.id);
  if (document.creatorId !== req.user!.id) {
    throw new AppError(403, "Chỉ người tạo mới được nộp lại văn bản này");
  }
  if (document.status !== "CHANGES_REQUESTED") {
    throw new AppError(400, "Văn bản không ở trạng thái chờ chỉnh sửa");
  }

  // Re-đánh giá tự động bỏ qua bước (5.6B) TỪ currentStep hiện tại (không phải +1) —
  // người phụ trách bước đó có thể đã đổi (khoá tài khoản, đổi phòng ban...) giữa lúc
  // yêu cầu chỉnh sửa và lúc nộp lại. Nếu mọi bước còn lại đều bị bỏ qua -> coi như đã
  // qua hết người duyệt thật, chuyển thẳng APPROVED.
  const skipResult = await resolveEffectiveStep(
    document.workflow.steps,
    document.currentStep,
    document.creatorId,
    document.creator.departmentId,
  );
  const isNowApproved = skipResult.finalStepOrder === null;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.documentLog.create({
      data: { documentId: document.id, userId: req.user!.id, action: "SUBMIT", comment: parsed.data.comment },
    });
    for (const s of skipResult.skipped) {
      await tx.documentLog.create({
        data: {
          documentId: document.id,
          userId: req.user!.id,
          action: "STEP_SKIPPED",
          comment: skipReasonText(s.stepOrder, s.reason),
        },
      });
    }
    return tx.document.update({
      where: { id: document.id, status: "CHANGES_REQUESTED" },
      data: isNowApproved
        ? { status: "APPROVED" }
        : { status: "PENDING", currentStep: skipResult.finalStepOrder! },
      include: { ...DOCUMENT_INCLUDE, logs: LOGS_INCLUDE },
    });
  });

  notify(await getNotifiableUserIds(updated, req.user!.id), {
    type: isNowApproved ? "document:approved" : "document:resubmitted",
    documentId: updated.id,
    title: updated.title,
    actorName: req.user!.fullName,
  });

  audit({ req, category: "DOCUMENT", action: "RESUBMIT", targetType: "document", targetId: updated.id, detail: updated.title });

  // Nộp lại mà auto-skip hết bước còn lại -> coi như vừa duyệt xong, cần đóng dấu PDF
  // tự động y hệt luồng duyệt bình thường (2.4/2.5) — không ai bấm "Duyệt" để kích hoạt.
  let responseDoc = updated;
  if (isNowApproved) {
    if (updated.type === "LEAVE") {
      await generateLeavePdfAttachment(updated, "APPROVED");
    } else {
      await autoStampApprovedPdfs(req, updated);
    }
    responseDoc = await loadDocumentForAction(updated.id);
  }

  return { ...responseDoc, canApprove: isCurrentApprover(responseDoc, req.user!) };
}

export async function withdrawDocument(req: Request) {
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
  return { ...updated, canApprove: isCurrentApprover(updated, req.user!) };
}

// Bình luận trên văn bản — trả về log vừa tạo (route res.status(201)).
export async function commentOnDocument(req: Request) {
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
  return log;
}
