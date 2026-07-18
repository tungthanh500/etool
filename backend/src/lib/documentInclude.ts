// Các hình dạng select/include Prisma dùng CHUNG giữa route (GET danh sách/chi tiết,
// tạo văn bản) và các hàm nghiệp vụ duyệt (lib/documentActions.ts) — gom về 1 nơi để
// không lệch nhau khi chỉnh trường trả ra.

// Chỉ lộ trường an toàn của người tạo/người thao tác — KHÔNG kèm passwordHash, role...
export const SAFE_CREATOR_SELECT = { id: true, fullName: true, email: true, departmentId: true } as const;

export const DOCUMENT_INCLUDE = {
  attachments: true,
  creator: { select: SAFE_CREATOR_SELECT },
  workflow: {
    include: {
      steps: {
        orderBy: { stepOrder: "asc" as const },
        include: {
          department: { select: { id: true, name: true } },
          approverUser: { select: { id: true, fullName: true } },
        },
      },
    },
  },
};

// Join user vào mỗi log để timeline hiển thị được ai đã submit/duyệt/bình luận.
export const LOGS_INCLUDE = {
  orderBy: { createdAt: "asc" as const },
  include: { user: { select: SAFE_CREATOR_SELECT } },
};
