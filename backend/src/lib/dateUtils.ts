// Múi giờ hiển thị/đánh số thống nhất toàn hệ thống là GMT+7 (Asia/Ho_Chi_Minh),
// bất kể server chạy ở múi giờ nào — dùng Intl thay vì cộng trừ offset thủ công
// để tránh sai lệch quanh ranh giới nửa đêm.
const YEAR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
});

export function currentYearVN(): number {
  return Number(YEAR_FORMATTER.format(new Date()));
}

const DATETIME_PART_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// Dùng khi in ngày giờ lên PDF đóng dấu — tự ghép "dd/MM/yyyy HH:mm" (thứ tự Intl mặc định
// theo locale "vi-VN" lại đặt giờ trước ngày, không hợp thói quen đọc trên văn bản).
export function formatDateTimeVN(date: Date): string {
  const parts = Object.fromEntries(
    DATETIME_PART_FORMATTER.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute} (GMT+7)`;
}

// Chuyển ngày "YYYY-MM-DD" (từ input type=date, hiểu theo lịch GMT+7) thành mốc UTC
// đầu/cuối ngày đó — dùng để lọc khoảng ngày tạo văn bản. Ghi thẳng offset "+07:00"
// vào chuỗi ISO để Date parse đúng mốc tuyệt đối, không cần tính tay UTC offset.
export function dayStartVN(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+07:00`);
}

export function dayEndVN(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999+07:00`);
}

// en-CA cho ra thẳng dạng "YYYY-MM-DD" — dùng làm khoá ngày theo lịch GMT+7
// (ví dụ: xác định "hôm nay" cho job nhắc hạn, ghép được với dayStartVN).
const DATE_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayVN(): string {
  return DATE_KEY_FORMATTER.format(new Date());
}

const YEAR_MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
});

// 6 tháng gần nhất (cũ→mới) theo lịch GMT+7, mỗi bucket là nửa khoảng [gte, lt)
// để đếm document tạo trong tháng đó — dùng cho biểu đồ dashboard. Ranh giới tháng
// ghi kèm offset +07:00 nên không lệch dù server chạy ở múi giờ khác.
export function lastSixMonthsVN(): { label: string; gte: Date; lt: Date }[] {
  const parts = Object.fromEntries(
    YEAR_MONTH_FORMATTER.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  const curYear = Number(parts.year);
  const curMonth = Number(parts.month); // 1-12

  // Lùi 5 tháng để có đủ 6 bucket kết thúc ở tháng hiện tại.
  let y = curYear;
  let m = curMonth - 5;
  while (m <= 0) {
    m += 12;
    y -= 1;
  }

  const buckets: { label: string; gte: Date; lt: Date }[] = [];
  for (let i = 0; i < 6; i++) {
    const mm = String(m).padStart(2, "0");
    let ny = y;
    let nm = m + 1;
    if (nm > 12) {
      nm = 1;
      ny += 1;
    }
    const nmm = String(nm).padStart(2, "0");
    buckets.push({
      label: `${y}-${mm}`,
      gte: new Date(`${y}-${mm}-01T00:00:00+07:00`),
      lt: new Date(`${ny}-${nmm}-01T00:00:00+07:00`),
    });
    y = ny;
    m = nm;
  }
  return buckets;
}
