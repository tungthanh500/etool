# DEPLOY.md — Đưa e-Approval vào vận hành thật trên LAN (D2 + D3)

> **Trạng thái:** file cấu hình + code đã chuẩn bị sẵn (2026-07-19), CHƯA thực thi — các bước dưới đây cần sudo (máy không có passwordless sudo) nên phải chạy tay tại terminal.
>
> **Hệ quả khi thực thi:** mọi phiên đang đăng nhập qua `http://192.168.10.9:5173` / `:4000` sẽ ngắt; sau đó tất cả truy cập qua **`https://192.168.10.9`** duy nhất. Hệ thống đang ở giai đoạn testing nên gián đoạn chấp nhận được.
>
> Máy chủ: chính máy này (Ubuntu 24.04, IP LAN `192.168.10.9`). Node qua nvm: `/home/tung/.nvm/versions/node/v26.5.0/bin/node`.

## 0. Chuẩn bị đã xong sẵn (không cần làm lại)

- `deploy/Caddyfile` — cấu hình Caddy hoàn chỉnh (HTTPS nội bộ `tls internal`, proxy `/api/*` + `/ws` → 4000, serve `frontend/dist` với SPA fallback).
- `deploy/etool-backend.service` — systemd unit (NODE_ENV=production, HOST=127.0.0.1, node path tuyệt đối, Restart=always).
- Code đã hỗ trợ sẵn:
  - `backend/src/index.ts` đọc `HOST` env (mặc định `0.0.0.0` cho dev — unit set `127.0.0.1`).
  - `frontend/src/hooks/useWebSocket.ts` — production build tự nối `wss://<host>/ws` same-origin (dev vẫn nối thẳng cổng 4000).
  - Root `npm run build` build đúng thứ tự shared → backend → frontend.

## 1. Build mới nhất

```bash
cd /home/tung/etool && npm run build
```

## 2. Cài Caddy (repo chính thức, KHÔNG qua snap)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

## 3. Cấu hình Caddy + systemd cho backend

```bash
# Backup Caddyfile mặc định rồi thay bằng bản của dự án
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak 2>/dev/null || true
sudo cp /home/tung/etool/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy

# Dừng backend dev (tsx watch) + Vite dev server đang chạy nền, rồi bật systemd unit
pkill -f "tsx watch src/index.ts" || true
pkill -f "vite --host" || true
sudo cp /home/tung/etool/deploy/etool-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now etool-backend
```

Kiểm tra nhanh:

```bash
systemctl status etool-backend --no-pager
curl -sk https://192.168.10.9/api/health   # mong đợi {"status":"ok","db":"ok"}
ss -tlnp | grep 4000                        # mong đợi 127.0.0.1:4000 (không còn *:4000)
```

## 4. Trust CA cho client trong LAN (mỗi máy 1 lần)

Xuất root CA của Caddy:

```bash
sudo cat /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt > /tmp/etool-root.crt
```

Chuyển `etool-root.crt` cho từng máy Windows trong công ty (USB/chia sẻ file), rồi trên máy đó: mở file → Install Certificate → Local Machine → "Place all certificates in the following store" → **Trusted Root Certification Authorities** → Finish.

Không trust cũng vẫn dùng được: trình duyệt cảnh báo "Your connection is not private" → Advanced → Proceed (chỉ phiền, không chặn).

## 5. Nghiệm thu sau go-live

- Từ máy khác trong LAN: mở `https://192.168.10.9` → login được (cookie secure hoạt động vì đã có HTTPS + NODE_ENV=production).
- Realtime: mở 2 trình duyệt, duyệt văn bản bên này → bên kia cập nhật không cần F5 (WS same-origin `/ws` qua proxy).
- WS reconnect: `sudo systemctl restart etool-backend` → trang đang mở tự nối lại sau vài giây (backoff), realtime hoạt động lại không cần F5.
- **Web Push mở khoá lại** (cần secure context): vào phần cài đặt tài khoản, bật thông báo đẩy, xác nhận đăng ký subscription thành công.
- Truy cập cũ `http://192.168.10.9:5173` và `:4000` phải CHẾT (Vite tắt, backend bind localhost) — báo người dùng chuyển sang `https://192.168.10.9`.

## Quy trình cập nhật phiên bản (sau go-live)

```bash
cd /home/tung/etool
git pull
npm ci                                        # chỉ khi package-lock.json đổi
cd backend && npx prisma migrate deploy && cd ..   # chỉ khi có migration mới — KHÔNG dùng migrate dev
npm run build
sudo systemctl restart etool-backend
# Caddy không cần reload cho file tĩnh mới (file_server đọc trực tiếp);
# chỉ reload khi Caddyfile đổi: sudo systemctl reload caddy
```

## Vận hành

- Log backend: `journalctl -u etool-backend -f`
- Log Caddy: `journalctl -u caddy -f`
- Backup/restore DB: xem `scripts/RESTORE.md` (backup hàng ngày qua `scripts/backup-db.sh`).
- Quay lại chế độ dev (nếu cần): `sudo systemctl stop etool-backend`, rồi chạy lại `npm run dev` trong backend/ và frontend/ như cũ.
