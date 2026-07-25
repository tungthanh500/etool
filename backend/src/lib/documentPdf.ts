import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "./prisma";
import { UPLOAD_DIR } from "./upload";
import { audit } from "./audit";
import { stampApprovedPdf } from "./stamp";
import type { ApproverInfo } from "./stamp";
import { buildLeavePdf, buildLeaveStepRows } from "./leavePdf";

// Sinh PDF đơn xin nghỉ phép (mục 5.2) — LEAVE không có file người dùng upload (file
// policy "hidden"), nên tự sinh Attachment PDF thay thế. kind="ORIGINAL" lúc vừa nộp đơn
// (khu PHẦN PHÊ DUYỆT để trống/chờ theo đúng log tại thời điểm gọi — có thể đã có bước bị
// auto-skip ngay từ đầu); kind="APPROVED" lúc duyệt xong bước cuối (mọi bước đã ĐÃ DUYỆT
// hoặc Bỏ qua, không còn "(Chưa duyệt)"). Khác autoStampApprovedPdfs (2.4/2.5): LEAVE
// regenerate TOÀN BỘ 1 trang, không chèn trang bìa/phụ lục — đúng yêu cầu nghiệp vụ.
// Lỗi sinh PDF KHÔNG được chặn hành động chính (nộp/duyệt) — chỉ ghi audit (để Admin thấy
// trong Nhật ký hệ thống) thay vì chỉ console.error (không ai đọc log server production).
export async function generateLeavePdfAttachment(
  document: {
    id: string;
    docNo: string | null;
    createdAt: Date;
    creatorId: string;
    formData: unknown;
    workflow: { steps: Parameters<typeof buildLeaveStepRows>[0] };
  },
  kind: "ORIGINAL" | "APPROVED",
  req?: import("express").Request,
): Promise<void> {
  try {
    const creator = await prisma.user.findUnique({
      where: { id: document.creatorId },
      select: { fullName: true, signatureUrl: true, department: { select: { name: true } } },
    });
    if (!creator) return;

    // Log riêng (không dùng document.logs sẵn có) vì cần signatureUrl của người duyệt —
    // LOGS_INCLUDE dùng chung toàn route chỉ select SAFE_CREATOR_SELECT, không có trường đó.
    const logs = await prisma.documentLog.findMany({
      where: { documentId: document.id, action: { in: ["APPROVE", "STEP_SKIPPED"] } },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { fullName: true, signatureUrl: true } } },
    });

    const formData = document.formData as {
      tuNgay: string;
      denNgay: string;
      soNgay: number;
      loaiNghi: string;
      lyDo?: string;
    };
    const rows = buildLeaveStepRows(document.workflow.steps, logs);
    const pdfBytes = await buildLeavePdf({
      docNo: document.docNo,
      fullName: creator.fullName,
      departmentName: creator.department.name,
      tuNgay: formData.tuNgay,
      denNgay: formData.denNgay,
      soNgay: formData.soNgay,
      loaiNghi: formData.loaiNghi,
      lyDo: formData.lyDo,
      createdAt: document.createdAt,
      requesterSignatureUrl: creator.signatureUrl,
      steps: rows,
    });

    const filename = `${crypto.randomUUID()}.pdf`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), pdfBytes);
    await prisma.attachment.create({
      data: {
        documentId: document.id,
        fileName: kind === "APPROVED" ? "Don-xin-nghi-phep-da-duyet.pdf" : "Don-xin-nghi-phep.pdf",
        fileUrl: filename,
        mimeType: "application/pdf",
        kind,
      },
    });
  } catch (err) {
    console.error(`Lỗi sinh PDF đơn nghỉ phép cho văn bản ${document.id}:`, err);
    audit({
      req,
      category: "FILE",
      action: "FILE_GENERATE_FAILED",
      targetType: "document",
      targetId: document.id,
      detail: `Sinh PDF đơn nghỉ phép (${kind}) thất bại: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

// Tự động đóng dấu "ĐÃ PHÊ DUYỆT" + khối chữ ký (mục 2.4/2.5) khi hồ sơ vừa chuyển
// APPROVED và người duyệt cuối KHÔNG tự tay đính kèm bản đã ký. Chạy sau khi transaction
// duyệt đã commit (không giữ transaction lâu chờ xử lý PDF); lỗi đóng dấu KHÔNG được
// làm hỏng việc duyệt — chỉ log lại, hồ sơ vẫn coi là đã duyệt xong bình thường.
export async function autoStampApprovedPdfs(
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
    audit({
      req,
      category: "FILE",
      action: "FILE_GENERATE_FAILED",
      targetType: "document",
      targetId: document.id,
      detail: `Đóng dấu PDF tự động thất bại: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
