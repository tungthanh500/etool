# DEPLOY_NEW_SERVER.md — Bàn giao triển khai lên server nội bộ MỚI

> **File này là PROMPT + RUNBOOK.** Dành cho một phiên Claude Code chạy **trên server đích**
> (không phải máy dev gốc). Đọc hết file này trước khi gõ bất kỳ lệnh nào.
>
> Khác với `DEPLOY.md` (viết cứng cho máy dev gốc: IP `192.168.10.9`, user `tung`,
> path `/home/tung/etool`), file này **tham số hoá** mọi thứ theo server đích.

---

## 0. PROMPT — dán đoạn này cho Claude session trên server mới

```
Tôi cần triển khai hệ thống e-Approval (duyệt văn bản nội bộ, tiếng Việt) lên server
nội bộ này của công ty. Repo: https://github.com/tungthanh500/etool.git

Hãy đọc DEPLOY_NEW_SERVER.md trong repo và thực hiện theo. Trước khi bắt đầu, hỏi tôi
các thông tin ở Mục 2 (IP server, user chạy service, có cần chuyển dữ liệu từ máy cũ sang
hay cài mới hoàn toàn). Tuyệt đối tuân thủ Mục 6 (những điều KHÔNG được làm) — trong đó
có 2 lệnh đã từng gây mất sạch dữ liệu.
```

---

## 1. Bối cảnh hệ thống (đọc để hiểu mình đang triển khai cái gì)

**e-Approval** — hệ thống trình duyệt & phê duyệt văn bản nội bộ cho công ty ~30 nhân
viên, chạy trong mạng LAN, không ra Internet.

| Lớp | Công nghệ |
|---|---|
| Backend | Node.js v26 + Express + TypeScript, Prisma ORM |
| DB | PostgreSQL 16 (Docker Compose, bind `127.0.0.1`) |
| Frontend | React 19 + Vite (build tĩnh, phục vụ bởi Caddy) |
| Shared | npm workspace `@etool/shared` (chỉ type + hằng số) |
| Reverse proxy | Caddy (HTTPS nội bộ, `tls internal`) |
| Process manager | systemd |

**Tài liệu bắt buộc đọc thêm** (trong repo):
- `SYSTEM_OVERVIEW.md` — kiến trúc, workflow engine, phân quyền, API surface. **Đọc trước tiên.**
- `EXISTING-BUG.md` — sổ rủi ro R01→R36. Mục **R15** và **R28** mô tả 2 sự cố mất dữ liệu có thật.
- `scripts/RESTORE.md` — quy trình backup/restore DB + uploads.
- `DEPLOY.md` — runbook gốc (máy dev). Dùng để tham khảo lệnh, **nhưng đường dẫn/IP trong đó
  là của máy cũ, không copy nguyên xi.**

**Nguyên tắc kiến trúc bất di bất dịch — Fat Server / Thin Client:** mọi tính toán,
validate, phân quyền nằm ở backend; frontend chỉ hiển thị.

---

## 2. HỎI NGƯỜI DÙNG TRƯỚC KHI BẮT ĐẦU

Không đoán. Hỏi đủ 5 mục sau rồi mới chạy lệnh:

1. **IP LAN của server này** (sẽ ghi cứng vào Caddyfile) — và IP đã được đặt tĩnh
   hoặc DHCP reservation chưa? IP đổi = HTTPS + client hỏng.
2. **User Linux nào sẽ chạy service** (systemd `User=`) và **đặt mã nguồn ở đâu**
   (ví dụ `/opt/etool` hoặc `/home/<user>/etool`).
3. **Cài mới hoàn toàn** hay **chuyển dữ liệu từ máy cũ sang?**
   → Quyết định này ảnh hưởng trực tiếp tới Mục 4 (VAPID keys) và Mục 5.
4. **Đã có Docker + Docker Compose trên server chưa?** Node v26 đã cài chưa (và cài kiểu gì:
   nvm hay apt/nodesource)?
5. Nếu chuyển dữ liệu: **file dump DB và thư mục `uploads/` từ máy cũ đã được mang sang chưa,
   đang nằm ở đâu?**

---

## 3. Ba thứ KHÔNG nằm trong git — phải mang sang thủ công

Clone repo về sẽ **thiếu** 3 thứ này. Đây là nguyên nhân lỗi phổ biến nhất khi dựng server mới.

| Thứ | Vì sao thiếu | Xử lý |
|---|---|---|
| `.env` (root) + `backend/.env` | `.gitignore` loại trừ (cố ý, để không lộ secret) | Tạo mới từ `.env.example` + `backend/.env.example` — xem Mục 4 |
| `backend/uploads/` | `.gitignore` loại trừ | **Copy thủ công từ máy cũ.** Đây là toàn bộ file đính kèm + PDF đã ký |
| Dữ liệu PostgreSQL | Nằm trong Docker volume | `pg_dump` từ máy cũ → restore (xem `scripts/RESTORE.md`) |

> ⚠️ Quên `uploads/`: hồ sơ vẫn hiện đầy đủ trong giao diện (vì metadata nằm ở DB),
> nhưng bấm tải file thì lỗi "File không còn tồn tại trên máy chủ". Rất dễ bỏ sót
> vì hệ thống trông như chạy bình thường.

---

## 4. Tạo file .env (Mục quan trọng nhất về bảo mật)

### `.env` ở thư mục gốc

```bash
POSTGRES_USER=eapproval
POSTGRES_PASSWORD=<sinh mới: openssl rand -base64 24 | tr -d '/+=' | head -c 32>
POSTGRES_DB=eapproval
POSTGRES_PORT=5432
```

### `backend/.env`

```bash
DATABASE_URL="postgresql://eapproval:<ĐÚNG password ở trên>@localhost:5432/eapproval?schema=public"
PORT=4000
NODE_ENV=production          # ⚠️ chỉ đặt production SAU KHI Caddy/HTTPS chạy (cookie secure cần HTTPS)
JWT_SECRET="<sinh mới: openssl rand -hex 64>"
JWT_EXPIRES_IN="10h"
COOKIE_NAME="eapproval_token"
VAPID_PUBLIC_KEY="<xem quy tắc bên dưới>"
VAPID_PRIVATE_KEY="<xem quy tắc bên dưới>"
REMIND_PENDING_AFTER_DAYS=3
REMIND_CRON="0 8 * * *"
```

### 🔑 Quy tắc VAPID keys — bẫy tinh tế, dễ sai

| Tình huống | Làm gì |
|---|---|
| **Cài mới hoàn toàn** (DB trống) | Sinh cặp mới: `npx web-push generate-vapid-keys` |
| **Chuyển dữ liệu từ máy cũ sang** | **GIỮ NGUYÊN cặp khoá cũ**, copy từ `backend/.env` của máy cũ |

Sinh cặp mới trong khi vẫn dùng DB cũ → toàn bộ bản ghi bảng `PushSubscription` thành rác,
người dùng mất thông báo đẩy mà không có lỗi nào hiện ra để biết nguyên nhân.

`JWT_SECRET` thì ngược lại — đổi thoải mái, hệ quả duy nhất là mọi người phải đăng nhập lại.

---

## 5. Các bước triển khai

### 5.1 Chuẩn bị mã nguồn

```bash
git clone https://github.com/tungthanh500/etool.git <THƯ_MỤC_ĐÍCH>
cd <THƯ_MỤC_ĐÍCH>
npm ci                # cài cả 3 workspace: shared, backend, frontend
```

### 5.2 Dựng PostgreSQL

```bash
docker compose up -d postgres
docker compose ps     # xác nhận healthy
ss -tlnp | grep 5432  # PHẢI thấy 127.0.0.1:5432, KHÔNG được 0.0.0.0
```

> Bind `127.0.0.1` là bắt buộc (rủi ro R02 trong `EXISTING-BUG.md`) — nếu thấy `0.0.0.0`,
> kiểm tra lại `docker-compose.yml`.

### 5.3 Tạo schema DB

```bash
cd backend
npx prisma migrate deploy      # ⚠️ KHÔNG BAO GIỜ dùng "migrate dev" — xem Mục 6
```

**Nếu chuyển dữ liệu từ máy cũ:** restore dump theo `scripts/RESTORE.md` **thay cho**
việc chạy seed. Sau khi restore xong thì bỏ qua 5.4.

### 5.4 Seed dữ liệu khởi tạo (CHỈ khi cài mới, DB trống)

```bash
cd backend && npx tsx prisma/seed.ts
```

Seed có guard chặn chạy trên `NODE_ENV=production` (rủi ro R03). Nếu đã đặt production
mà vẫn cần seed lần đầu, chạy với `FORCE_SEED=1`. Seed là idempotent — bỏ qua workflow
đã tồn tại, không ghi đè (đã sửa sau sự cố R28).

Seed tạo 2 tài khoản: **`admin`** (Quản trị hệ thống) và **`nhansu`** (Phòng Nhân sự),
cùng mật khẩu mặc định `ChangeMe123!`.

> 🔴 **BẮT BUỘC làm ngay sau khi seed:** đăng nhập `admin` và **đổi mật khẩu cả 2 tài khoản**.
> Seed **không** bật cờ `mustChangePassword`, nên hệ thống sẽ KHÔNG tự ép đổi — nếu quên,
> server đi vào vận hành với mật khẩu mặc định ai đọc repo cũng biết.

### 5.5 Build

```bash
cd <THƯ_MỤC_ĐÍCH> && npm run build     # build đúng thứ tự shared → backend → frontend
```

### 5.6 Cài Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

### 5.7 Sửa 2 file deploy cho khớp server này

**`deploy/Caddyfile`** — sửa 2 chỗ:
- `https://192.168.10.9:443` → IP server mới
- `root * /home/tung/etool/frontend/dist` → `<THƯ_MỤC_ĐÍCH>/frontend/dist`

**`deploy/etool-backend.service`** — sửa 3 chỗ:
- `User=tung` → user đã chọn
- `WorkingDirectory=/home/tung/etool/backend` → `<THƯ_MỤC_ĐÍCH>/backend`
- `ExecStart=/home/tung/.nvm/versions/node/v26.5.0/bin/node dist/index.js`
  → đường dẫn node **tuyệt đối** trên server này (tìm bằng `which node`)

> systemd **không đọc `PATH` của shell** — bắt buộc đường dẫn tuyệt đối, đặc biệt khi
> Node cài qua nvm. Đây là lỗi khiến service không khởi động được, log báo
> `status=203/EXEC`.

Rồi áp dụng:

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy

sudo cp deploy/etool-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now etool-backend
```

### 5.8 Firewall

Chỉ mở **443**. Chặn từ LAN: `4000` (backend), `5432` (Postgres), `5173` (Vite dev).

```bash
sudo ufw allow 443/tcp
sudo ufw enable
```

### 5.9 Cron backup — PHẢI cài lại trên server mới

Crontab là cấu hình **theo máy**, không theo repo (ghi chú ở R15). Không cài = không có backup.

```bash
crontab -e
# thêm dòng (giờ GMT+7 theo timezone hệ thống):
0 2 * * * <THƯ_MỤC_ĐÍCH>/scripts/backup-db.sh >> /var/log/etool-backup.log 2>&1
```

Kiểm tra timezone server: `timedatectl` → nên là `Asia/Ho_Chi_Minh`, vì cả cron backup
lẫn job nhắc hạn (`REMIND_CRON`) đều dùng giờ hệ thống.

### 5.10 Trust root CA trên máy client (mỗi máy Windows 1 lần)

```bash
sudo cat /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt > /tmp/etool-root.crt
```

Chuyển file này cho từng máy → mở file → Install Certificate → Local Machine →
Trusted Root Certification Authorities → Finish.

Không trust vẫn dùng được, chỉ hiện cảnh báo "Your connection is not private" → Advanced → Proceed.

---

## 6. ⛔ NHỮNG ĐIỀU KHÔNG ĐƯỢC LÀM

| Không được | Vì sao |
|---|---|
| `npx prisma migrate dev` | **Đã xoá sạch DB một lần rồi** (R15). Trong môi trường non-interactive nó tự reset database không hỏi. Luôn dùng `migrate deploy`. |
| Chạy `seed.ts` trên DB đã có dữ liệu thật | Từng hồi sinh user demo + ghi đè cấu hình workflow thật (R28). Đã có guard nhưng vẫn tránh. |
| Sinh VAPID keys mới khi dùng lại DB cũ | Làm hỏng toàn bộ `PushSubscription`, không có lỗi hiện ra |
| Để `NODE_ENV=production` khi chưa có HTTPS | Cookie `secure` sẽ không gửi được → không đăng nhập được |
| Mở port 4000/5432 ra LAN | Backend phải bind `127.0.0.1`, mọi traffic đi qua Caddy |
| Commit file `.env` | Chứa `JWT_SECRET` + mật khẩu DB |
| Copy nguyên `DEPLOY.md` | IP/user/path trong đó là của máy dev cũ |

---

## 7. Nghiệm thu sau khi chạy

```bash
systemctl status etool-backend --no-pager
curl -sk https://<IP_SERVER>/api/health      # mong đợi {"status":"ok","db":"ok"}
ss -tlnp | grep 4000                          # PHẢI là 127.0.0.1:4000, không phải *:4000
```

Từ một máy khác trong LAN:

- [ ] Mở `https://<IP_SERVER>` → đăng nhập được
- [ ] Tạo văn bản có đính kèm → tải lại file đó về được (xác nhận `uploads/` đúng)
- [ ] Realtime: mở 2 trình duyệt, duyệt văn bản bên này → bên kia tự cập nhật, không cần F5
- [ ] WS reconnect: `sudo systemctl restart etool-backend` → trang đang mở tự nối lại sau vài giây
- [ ] Web Push: vào cài đặt tài khoản, bật thông báo đẩy → đăng ký thành công (cần HTTPS)
- [ ] Nếu đã restore dữ liệu cũ: kiểm tra vài hồ sơ cũ, tải được file đính kèm cũ
- [ ] Chạy thử `scripts/backup-db.sh` một lần bằng tay, xác nhận file backup được tạo

---

## 8. Vận hành sau go-live

```bash
# Log
journalctl -u etool-backend -f
journalctl -u caddy -f

# Cập nhật phiên bản
cd <THƯ_MỤC_ĐÍCH>
git pull
npm ci                                            # chỉ khi package-lock.json đổi
cd backend && npx prisma migrate deploy && cd ..   # chỉ khi có migration mới
npm run build
sudo systemctl restart etool-backend
# Caddy chỉ cần reload khi Caddyfile đổi
```

**Trước mỗi lần cập nhật có migration: chạy backup trước.** Xem `scripts/RESTORE.md`.

---

## 9. Việc còn mở đã biết (không chặn go-live)

- **R18** — thiếu test frontend (backend đã có 49 test + CI xanh)
- Form user chưa hiện lỗi inline khi username sai pattern (nợ UX nhỏ, xem cuối R31)
- WebSocket registry in-memory → chỉ chạy được **1 instance backend**. Đây là quyết định
  có chủ đích cho quy mô ~30 người (R19). Nếu sau này cần ≥2 instance, phải sửa đồng thời
  WS registry (Redis Pub/Sub), file storage (object storage dùng chung) và connection pooling.
