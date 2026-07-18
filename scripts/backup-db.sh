#!/usr/bin/env bash
# ============================================================
# Backup PostgreSQL (e-Approval) — mục 3.4 ACTION_PLAN.md
#
# - Dump định dạng custom (-Fc, đã nén) qua docker exec — chạy trong
#   container nên không cần mật khẩu (local socket trust).
# - Xoay vòng: giữ KEEP bản mới nhất, xoá bản cũ hơn.
# - Ghi log kết quả vào backup.log cùng thư mục backup.
# - Chạy bởi cron hệ điều hành (user tung), KHÔNG phụ thuộc backend —
#   backend chết vẫn backup được. Xem hướng dẫn khôi phục: scripts/RESTORE.md
#
# Cách chạy tay:  bash /home/tung/etool/scripts/backup-db.sh
# ============================================================
set -euo pipefail

CONTAINER="etool-postgres-1"
DB_USER="eapproval"
DB_NAME="eapproval"
BACKUP_DIR="/home/tung/etool-backups"
KEEP=7
LOG_FILE="$BACKUP_DIR/backup.log"

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y-%m-%d_%H%M%S)"           # giờ hệ thống = GMT+7
FILE="$BACKUP_DIR/eapproval-$STAMP.dump"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] $*" >> "$LOG_FILE"
}

# Dump vào file tạm rồi mới đổi tên — tránh để lại file dump cụt nếu lỗi giữa chừng.
if docker exec "$CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$FILE.tmp" 2>>"$LOG_FILE"; then
  mv "$FILE.tmp" "$FILE"
  SIZE=$(du -h "$FILE" | cut -f1)
  log "OK  $FILE ($SIZE)"
else
  rm -f "$FILE.tmp"
  log "FAIL pg_dump thất bại — xem lỗi phía trên"
  exit 1
fi

# --- Backup thư mục file upload (đính kèm + chữ ký) ---
# DB chỉ lưu metadata (Attachment.fileUrl trỏ tên file) — file THẬT nằm trên đĩa
# tại backend/uploads/, pg_dump KHÔNG bao gồm chúng. Backup cả hai mới khôi phục
# trọn vẹn được: dump để phục hồi dữ liệu, tar này để phục hồi file.
UPLOADS_DIR="/home/tung/etool/backend/uploads"
if [ -d "$UPLOADS_DIR" ]; then
  UFILE="$BACKUP_DIR/uploads-$STAMP.tar.gz"
  if tar -czf "$UFILE.tmp" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")" 2>>"$LOG_FILE"; then
    mv "$UFILE.tmp" "$UFILE"
    USIZE=$(du -h "$UFILE" | cut -f1)
    log "OK  $UFILE ($USIZE)"
  else
    rm -f "$UFILE.tmp"
    log "FAIL tar uploads thất bại — xem lỗi phía trên"
  fi
fi

# Xoay vòng: xoá các bản cũ, giữ lại $KEEP bản mới nhất mỗi loại (tên file chứa
# timestamp nên sort theo tên = sort theo thời gian).
for PATTERN in "eapproval-*.dump" "uploads-*.tar.gz"; do
  while IFS= read -r old; do
    rm -f "$old"
    log "DEL $old (xoay vòng, giữ $KEEP bản)"
  done < <(ls -1 "$BACKUP_DIR"/$PATTERN 2>/dev/null | sort | head -n -"$KEEP")
done

exit 0
