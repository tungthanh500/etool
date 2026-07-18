# Khôi phục database từ backup (e-Approval)

> Đi kèm `scripts/backup-db.sh` (mục 3.4 ACTION_PLAN.md). Backup tự động chạy
> hằng ngày lúc **02:00 (GMT+7)** qua crontab của user `tung`, lưu tại
> `/home/tung/etool-backups/`, giữ **7 bản** gần nhất mỗi loại.
>
> Mỗi lần backup sinh **2 file** — phải hiểu rõ vai trò từng file:
> - `eapproval-<time>.dump` — dữ liệu PostgreSQL (`pg_dump -Fc`). **KHÔNG chứa file đính kèm.**
> - `uploads-<time>.tar.gz` — toàn bộ file thật trong `backend/uploads/` (văn bản
>   đính kèm, bản PDF đã đóng dấu, ảnh chữ ký). DB chỉ lưu metadata trỏ tới các
>   file này; restore DB không tự phục hồi file — cần giải nén tar tương ứng.

## Kiểm tra backup hiện có

```bash
ls -la /home/tung/etool-backups/
tail -20 /home/tung/etool-backups/backup.log
```

## Quy trình khôi phục (6 bước — làm ĐÚNG THỨ TỰ)

```bash
# 1. DỪNG BACKEND trước — tránh app ghi dữ liệu vào DB đang được khôi phục
#    (tìm process: ps aux | grep tsx)
pkill -f "tsx watch src/index.ts"   # hoặc dừng service tương ứng nếu chạy production

# 2. Chọn bản backup muốn khôi phục (dump DB + tar uploads phải CÙNG timestamp)
DUMP=/home/tung/etool-backups/eapproval-YYYY-MM-DD_HHMMSS.dump

# 3. (Khuyến nghị) Khôi phục THỬ vào DB tạm trước để xác nhận file dump lành lặn
docker exec etool-postgres-1 createdb -U eapproval eapproval_restore_test
docker exec -i etool-postgres-1 pg_restore -U eapproval -d eapproval_restore_test --no-owner < "$DUMP"
docker exec etool-postgres-1 psql -U eapproval -d eapproval_restore_test -c '\dt'   # xem đủ bảng chưa
docker exec etool-postgres-1 dropdb -U eapproval eapproval_restore_test

# 4. Khôi phục THẬT: xoá sạch DB hiện tại rồi nạp lại từ dump
#    ⚠️ --clean --if-exists sẽ DROP các bảng hiện có trước khi tạo lại
docker exec -i etool-postgres-1 pg_restore -U eapproval -d eapproval --clean --if-exists --no-owner < "$DUMP"

# 5. Khôi phục file đính kèm TƯƠNG ỨNG cùng thời điểm với bản dump
#    (nếu bỏ qua bước này, bản ghi Attachment có thể trỏ tới file không tồn tại
#    → nút tải file báo "File không còn tồn tại trên máy chủ")
UTAR=/home/tung/etool-backups/uploads-YYYY-MM-DD_HHMMSS.tar.gz   # cùng timestamp với $DUMP
rm -rf /home/tung/etool/backend/uploads
tar -xzf "$UTAR" -C /home/tung/etool/backend/

# 6. Khởi động lại backend và kiểm tra đăng nhập/danh sách văn bản/tải file hoạt động
cd /home/tung/etool/backend && npm run dev
```

## Backup thủ công ngay lập tức (trước khi migrate schema, nâng cấp...)

```bash
bash /home/tung/etool/scripts/backup-db.sh
```

## Lưu ý khi chuyển server mới

- Cài lại cron: `crontab -e` thêm dòng `0 2 * * * /home/tung/etool/scripts/backup-db.sh`
- File backup nằm NGOÀI repo và NGOÀI docker volume — nhớ copy thư mục
  `/home/tung/etool-backups/` nếu muốn giữ lịch sử backup cũ.
- Script giả định container tên `etool-postgres-1` và giờ hệ thống là GMT+7
  (server hiện tại: `Asia/Ho_Chi_Minh`) — kiểm tra lại bằng `timedatectl` trên máy mới.

## Quy tắc an toàn khi thay đổi schema (rút ra từ sự cố mất dữ liệu 2026-07-16)

Trước MỌI lần chạy `prisma migrate`:

1. Chạy backup thủ công: `bash /home/tung/etool/scripts/backup-db.sh`
2. Dùng `npx prisma migrate dev --create-only` để sinh file SQL ra xem trước,
   KHÔNG để nó tự áp.
3. Đọc file SQL trong `prisma/migrations/.../migration.sql` — xác nhận không có
   `DROP TABLE`/`DROP COLUMN` ngoài ý muốn.
4. Áp bằng `npx prisma migrate deploy` (lệnh này KHÔNG bao giờ reset DB, chỉ áp
   migration chưa chạy).
