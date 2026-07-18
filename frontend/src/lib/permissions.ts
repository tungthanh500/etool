import type { User } from "../types";

// Kiểm quyền phía client — chỉ để ẩn/hiện UI (backend luôn là nơi chốt chặn thật).
// Hiểu wildcard "*" của role Admin: có "*" nghĩa là đủ mọi quyền.
export function can(user: User | null | undefined, permission: string): boolean {
  if (!user) return false;
  const perms = user.role.permissions;
  return perms.includes("*") || perms.includes(permission);
}

// Role có tham gia duyệt không (bất kỳ biến thể document:approve:* nào, hoặc Admin) —
// dùng để ẩn các UI chỉ có nghĩa với người duyệt (uỷ quyền duyệt, chữ ký mẫu).
export function canApproveAnything(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.role.permissions.some((p) => p === "*" || p.startsWith("document:approve"));
}
