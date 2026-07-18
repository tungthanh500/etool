# POST_REFACTOR_PLAN.md — Phương án SAU refactor: đưa vào vận hành thật + nâng chất lượng

> **Điều kiện tiên quyết:** `REFACTOR_PLAN.md` (giai đoạn A–C) đã hoàn tất — nghĩa là đã có bộ test integration xanh, `documents.ts` đã tách, `DocumentLog.meta` đã có. Nếu chưa xong refactor thì làm refactor trước.
>
> **Người thực thi dự kiến:** Claude Sonnet (reasoning high). Nguyên tắc như REFACTOR_PLAN: mọi sự thật ghi ở đây đã kiểm chứng trên code ngày 2026-07-18 (HEAD `8a7fc03`) — nếu code thực tế đã khác, tin code và ghi chú lại.
>
> **Mục tiêu tổng:** đóng nốt các rủi ro còn mở trong `EXISTING-BUG.md` (R06, R12, R16, R17, R18-phần CI) và đưa hệ thống từ "chạy dev bằng tsx watch + Vite dev server" sang vận hành thật trên LAN.

## Hiện trạng còn mở (đối chiếu EXISTING-BUG.md)

| Mục | Nội dung | Xử lý ở giai đoạn |
|---|---|---|
| R06 | Không có HTTPS — cookie JWT truyền bản rõ; Web Push không chạy được (không phải secure context) | D2 |
| R17 | Backend chạy `tsx watch`, không có process manager | D3 |
| R16 | `GET /health` không kiểm tra DB | D4 |
| R12 | WebSocket không có reconnect | D5 |
| R18 | Không có test tự động → **đã có sau refactor giai đoạn A**; phần còn thiếu là CI chạy tự động | E1 |
| R19 | WS registry in-memory không scale nhiều instance | **Chủ động KHÔNG làm** — một instance đủ cho quy mô LAN nội bộ; ghi rõ vào EXISTING-BUG là "chấp nhận, xem lại khi >1 instance" |

---

## Các sự thật codebase PHẢI biết (kiểm chứng 2026-07-18)

1. **Cookie đã sẵn sàng cho HTTPS:** `routes/auth.ts` có `cookieOptions = { sameSite: "strict", secure: process.env.NODE_ENV === "production" }`. Hệ quả: khi bật `NODE_ENV=production` mà chưa có HTTPS thì **login sẽ hỏng âm thầm** (browser từ chối cookie secure trên HTTP) — vì vậy D2 (HTTPS) phải xong TRƯỚC hoặc CÙNG LÚC với việc bật production mode, không được làm lẻ.
2. **`useWebSocket.ts` hardcode cổng backend:** `getWsUrl()` trả `ws(s)://<hostname>:4000`. Khi đứng sau reverse proxy một origin duy nhất, URL này sai — phải đổi thành same-origin (xem D2, có patch cụ thể). Comment trong file nói rõ lý do hiện tại nối thẳng cổng 4000: Vite dev proxy không proxy WebSocket upgrade của app này.
3. **Đường dẫn runtime tương đối `__dirname`:** `lib/upload.ts` → `UPLOAD_DIR = __dirname/../../uploads`; `lib/leavePdf.ts` → fonts ở `__dirname/../../assets/fonts`. Build `tsc` ra `dist/` thì `dist/lib/../..` = `backend/` — vẫn đúng thư mục `backend/uploads` và `backend/assets`. Không cần sửa, nhưng smoke test sau build phải chạm cả upload lẫn sinh PDF LEAVE để xác nhận.
4. **`package.json` backend đã có sẵn script build/start:** `"build": "tsc -p tsconfig.json"`, `"start": "node dist/index.js"` — chưa từng dùng thật; bước D1 là lần đầu kiểm chứng chúng.
5. **Env nạp ngầm qua `@prisma/client`** (đọc `backend/.env` khi import, không override biến có sẵn). Chạy dưới systemd vẫn hoạt động vì process khởi động từ working directory nào không quan trọng với dotenv của Prisma — NHƯNG an toàn hơn là khai báo `WorkingDirectory=` đúng `backend/` trong unit file (D3).
6. **Seed guard:** `NODE_ENV=production` chặn `prisma:seed` (trừ khi `FORCE_SEED=1`) — đúng ý, không đụng.
7. **Web Push cần VAPID keys trong env** (`backend/.env` đã có từ Bước 8) và cần secure context phía trình duyệt — sau D2, tính năng Web Push coi như được "mở khoá" lại; phải test đăng ký subscription sau khi có HTTPS.
8. **Frontend gọi API bằng đường dẫn tương đối `/api/...`** (qua Vite proxy khi dev). Build tĩnh + serve cùng origin với backend qua reverse proxy → không phải sửa gì ở `api/client.ts`.
9. **Máy chủ đích:** chính máy Linux hiện tại (Ubuntu, đã có Docker cho Postgres). Truy cập từ LAN `192.168.10.0/24` qua IP tĩnh của máy — **không có domain công cộng**, vậy chứng chỉ HTTPS phải là self-signed/internal CA, client trong LAN cần trust CA một lần (ghi hướng dẫn cho người dùng cuối ở D2).

---

## GIAI ĐOẠN D — Vận hành thật trên LAN (go-live)

### D1. Build production và smoke test bằng tay (chưa cần proxy)

1. `cd backend && npm run build` — sửa lỗi tsc nếu có (lần đầu build thật).
2. Chạy thử TẠM bằng HTTP để kiểm build (chưa bật NODE_ENV=production — vì sự thật #1 sẽ làm hỏng cookie): `node dist/index.js`, rồi smoke: login → tạo LEAVE (chạm sinh PDF/fonts — sự thật #3) → upload file ở loại PURCHASE (chạm UPLOAD_DIR) → duyệt.
3. `cd frontend && npm run build` — ra `frontend/dist/`. Sửa lỗi tsc/vite nếu có.
4. Dừng process tạm. **Commit D1** nếu có sửa gì để build qua.

### D2. Reverse proxy + HTTPS (R06) — dùng Caddy

Chọn **Caddy** thay vì nginx: một binary, tự sinh và tự quản chứng chỉ nội bộ (`tls internal` — Caddy tự làm CA), cấu hình vài dòng, phù hợp LAN không có domain. (Nginx + mkcert là phương án thay thế nếu Caddy không cài được — quyết định đổi phải ghi chú lại.)

1. Cài Caddy theo repo chính thức của distro (apt). KHÔNG cài qua snap.
2. Tạo `/etc/caddy/Caddyfile` (backup file cũ nếu có):

```caddyfile
https://<IP-tĩnh-của-máy>:443 {
	tls internal

	# API + WebSocket upgrade đều về backend 4000
	handle /api/* {
		reverse_proxy 127.0.0.1:4000
	}
	handle /ws {
		reverse_proxy 127.0.0.1:4000
	}

	# Frontend tĩnh (SPA fallback về index.html)
	handle {
		root * /home/tung/etool/frontend/dist
		try_files {path} /index.html
		file_server
	}
}
```

3. **Sửa `frontend/src/hooks/useWebSocket.ts`** (sự thật #2) — same-origin khi production, giữ cổng 4000 khi dev:

```ts
function getWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  // Dev (Vite 5173): nối thẳng backend 4000 vì dev proxy không proxy WS upgrade.
  // Production sau reverse proxy: cùng origin, path /ws.
  if (import.meta.env.DEV) {
    return `${protocol}://${window.location.hostname}:4000`;
  }
  return `${protocol}://${window.location.host}/ws`;
}
```

   Đối chiếu backend: `lib/ws.ts` gắn WebSocketServer vào sự kiện `upgrade` của http.Server **không phân biệt path** (theo comment trong useWebSocket) — nên proxy `/ws` về 4000 là đủ; xác nhận lại trong `lib/ws.ts` trước khi chốt, nếu nó có check path thì khớp theo.
4. Backend bind localhost là đủ (proxy cùng máy) — kiểm tra `app.listen(PORT)` hiện bind mọi interface; đổi thành `app.listen(PORT, "127.0.0.1")` để cổng 4000 không còn truy cập thẳng từ LAN (ép mọi traffic đi qua HTTPS proxy). Tương tự R02 đã làm với Postgres.
5. Rebuild frontend (`npm run build`), restart Caddy (`sudo systemctl reload caddy`).
6. **Trust CA cho client LAN:** xuất CA root của Caddy (`/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt`), viết hướng dẫn ngắn (file `DEPLOY.md`, mục "Cài chứng chỉ") cho người dùng Windows trong công ty: import root.crt vào "Trusted Root Certification Authorities". Không trust thì trình duyệt cảnh báo nhưng vẫn vào được (Advanced → Proceed) — ghi cả 2 cách.
7. Kiểm chứng: từ máy khác trong LAN mở `https://<IP>` → login được (cookie secure hoạt động), realtime WS chạy (mở 2 trình duyệt, duyệt văn bản bên này thấy cập nhật bên kia), **đăng ký Web Push thành công** (secure context — điểm bị khoá từ Bước 8 giờ mở).

### D3. systemd cho backend (R17)

Tạo `/etc/systemd/system/etool-backend.service`:

```ini
[Unit]
Description=eTool e-Approval backend
After=network.target docker.service

[Service]
Type=simple
User=tung
WorkingDirectory=/home/tung/etool/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Lưu ý: `ExecStart` dùng đường dẫn node thật (`which node` — máy này dùng nvm thì trỏ thẳng vào binary trong `~/.nvm/versions/...`, systemd không đọc PATH của shell). `NODE_ENV=production` bật được từ đây vì D2 đã có HTTPS (sự thật #1). Postgres container đã có `restart: unless-stopped` — đủ, không cần unit riêng.

`sudo systemctl enable --now etool-backend` → smoke lại toàn bộ qua HTTPS. Thử `sudo systemctl restart etool-backend` và `sudo reboot` (nếu được phép) để xác nhận tự khởi động.

Viết `DEPLOY.md` ở gốc repo: quy trình cập nhật phiên bản (git pull → `npm ci` nếu lockfile đổi → `prisma migrate deploy` → `npm run build` cả 2 phía → `systemctl restart etool-backend` → reload Caddy nếu Caddyfile đổi), vị trí log (`journalctl -u etool-backend`), quy trình restore (đã có `scripts/RESTORE.md` — link tới).

### D4. Health check DB (R16) — nhỏ

`backend/src/routes/health.ts`:

```ts
router.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "ok" });
  } catch {
    res.status(503).json({ status: "degraded", db: "unreachable" });
  }
});
```

Thêm 1 test integration (DB đang chạy → 200). Có thể dùng health này làm `healthcheck` cho monitoring sau này.

### D5. WebSocket reconnect (R12)

Sửa `frontend/src/hooks/useWebSocket.ts`: reconnect với backoff lũy tiến (1s → 2s → 4s → ... trần 30s), reset backoff khi kết nối thành công; trả thêm cờ `connected: boolean` để UI có thể hiện trạng thái nếu muốn (chưa cần UI, chỉ cần expose). Điểm dễ sai: cleanup của `useEffect` phải huỷ cả timer reconnect đang chờ, và socket đóng do unmount thì KHÔNG reconnect (phân biệt bằng cờ `closedByCleanup` trong closure). Sau khi reconnect thành công, các trang đang mở có thể đã lỡ event — chấp nhận (người dùng F5); KHÔNG xây cơ chế replay event trong đợt này.

Kiểm chứng: mở trang, `sudo systemctl restart etool-backend`, đợi — trang tự nối lại (xem Network tab), duyệt văn bản từ trình duyệt khác → realtime hoạt động lại không cần F5.

**Commit sau mỗi bước D2–D5. Cập nhật `EXISTING-BUG.md`:** đóng R06, R12, R16, R17 (kèm ngày + cách fix); R19 chuyển trạng thái "chấp nhận có chủ đích".**

---

## GIAI ĐOẠN E — Chất lượng & phòng ngừa hồi quy

### E1. CI GitHub Actions ✅ ĐÃ LÀM (2026-07-18)

> Đã tạo `.github/workflows/ci.yml` (job backend: Postgres service + prisma generate + tsc + `npm test`; job frontend: `npm run build`). Xác nhận chạy xanh trên `main`. CI bắt được 1 lỗi thật: test phụ thuộc ngầm vào `.env` thật vì `lib/push.ts` yêu cầu VAPID lúc import — đã fix bằng cặp VAPID test trong `.env.test`. Mô tả gốc bên dưới giữ làm hồ sơ.


`.github/workflows/ci.yml` — chạy trên mọi push/PR vào `main`:

- Job backend: `services: postgres:16-alpine` (env POSTGRES_USER/PASSWORD/DB=eapproval_test), steps: checkout → setup-node (cache npm) → `npm ci` → tạo `.env.test` từ secrets/inline (DATABASE_URL trỏ service container, JWT_SECRET giá trị test) → `npx prisma migrate deploy` → `npx tsc --noEmit` → `npx vitest run`.
- Job frontend: `npm ci` → `npx tsc --noEmit` → `npm run build`.

Lưu ý khớp với hạ tầng test của REFACTOR_PLAN giai đoạn A: test đọc `.env.test` qua `tests/setup.ts` — trong CI chỉ cần tạo file `.env.test` đúng nội dung trước khi chạy; guard "URL phải chứa eapproval_test" vẫn thoả nếu đặt tên DB service là `eapproval_test`. Kiểm chứng: push một commit cố tình làm đỏ 1 test → CI đỏ → revert.

### E2. Shared types frontend/backend (mục hoãn từ đánh giá cấu trúc)

Phương án nhẹ, không monorepo tool:

1. Tạo `shared/documentForms.ts` chứa các Zod schema theo loại văn bản + type infer (`z.infer`) — chuyển từ `backend/src/lib/documentForms.ts` sang, backend re-export từ `shared/` để không phải sửa import toàn backend.
2. Frontend: `frontend/tsconfig.json` (hoặc `tsconfig.app.json`) thêm `"paths"` alias `@shared/*` → `../shared/*` + chỉnh `vite.config.ts` (`resolve.alias`). Thay các type chép tay trong `frontend/src/types.ts` và quy tắc trong `documentFormMeta.ts` bằng import từ shared — làm DẦN từng loại văn bản, mỗi loại một commit, tsc cả 2 phía xanh mới sang loại tiếp.
3. Điều kiện dừng: nếu vướng cấu hình build (Vite/tsc không resolve ra ngoài root), giải pháp dự phòng là npm workspace tối thiểu ở root `package.json` — chỉ dùng khi cách paths thất bại, ghi chú lại lý do.
4. Zod phía frontend: frontend hiện KHÔNG phụ thuộc zod — cài thêm `zod` vào frontend (chấp nhận ~14KB gzip) hoặc chỉ share type thuần (`type`-only imports, không share schema). **Khuyến nghị: bắt đầu type-only** (zero runtime cost, giải quyết đúng vấn đề drift), nâng lên share schema khi có nhu cầu validate client-side thật sự.

### E3. (Tuỳ chọn — chỉ làm nếu còn thời gian/nhu cầu) Tách `DocumentDetailPage.tsx` (678 dòng)

Tách 3 component theo ranh giới đã rõ: `DocumentTimeline` (khối timeline log), `ApprovalActions` (cụm nút duyệt/từ chối/yêu cầu sửa + modal xác nhận R21), `DocumentEditPanel` (panel sửa khi CHANGE_REQUESTED, tái dùng documentForms). Thuần di chuyển JSX + props, không đổi hành vi; test tay 1 vòng duyệt + 1 vòng request-change→resubmit sau khi tách.

---

## Thứ tự & khối lượng gợi ý

| Bước | Phụ thuộc | Ước lượng |
|---|---|---|
| D1 build + smoke | refactor xong | 0.5 buổi |
| D2 Caddy + HTTPS + sửa WS URL | D1 | 1 buổi |
| D3 systemd + DEPLOY.md | D2 | 0.5 buổi |
| D4 health DB | không | 30 phút |
| D5 WS reconnect | D2 (test qua proxy) | 0.5 buổi |
| E1 CI | refactor A | 0.5 buổi |
| E2 shared types | không | 1–2 buổi, làm dần |
| E3 tách DetailPage | không | tuỳ chọn |

D2 là bước "mở khoá" lớn nhất (đóng R06 + kích hoạt lại Web Push + cho phép NODE_ENV=production). E1 nên làm sớm ngay sau refactor vì gần như miễn phí một khi test đã có.

## Bẫy đã biết

- **Không bật `NODE_ENV=production` khi chưa có HTTPS** — cookie secure sẽ làm login hỏng âm thầm (sự thật #1).
- **systemd không dùng PATH của shell** — `ExecStart` phải là đường dẫn node tuyệt đối; máy dùng nvm thì càng phải chú ý.
- **Sau khi backend bind 127.0.0.1**, mọi client cũ truy cập thẳng `http://<IP>:4000` hoặc `http://<IP>:5173` sẽ chết — thông báo người dùng chuyển sang `https://<IP>`, và tắt hẳn Vite dev server trên máy chủ.
- **Caddy reload không tự pick up frontend build mới** — không cần reload cho file tĩnh (file_server đọc trực tiếp), nhưng trình duyệt cache: đảm bảo `index.html` không bị cache cứng (Vite build mặc định hash asset — đủ; không tự thêm header cache lạ).
- **`prisma migrate deploy` (không phải `migrate dev`) trên DB production** — quy tắc đã ghi trong `scripts/RESTORE.md`, nhắc lại trong `DEPLOY.md`.
- CI: cổng service Postgres trong Actions là `5432` trên host `localhost` (dùng `ports: 5432:5432`) — đừng copy DATABASE_URL của máy dev có password thật vào repo; CI dùng password riêng vô nghĩa.
