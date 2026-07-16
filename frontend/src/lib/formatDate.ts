// Ép cứng GMT+7 (Asia/Ho_Chi_Minh) thay vì dùng múi giờ trình duyệt của người xem,
// để mọi người dùng thấy cùng một mốc thời gian nhất quán bất kể máy họ đặt múi giờ gì.
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}
