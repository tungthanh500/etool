# SYSTEM_OVERVIEW.md — Tổng quan hệ thống e-Approval

> Cập nhật: 2026-07-19. Tài liệu này là bản tổng hợp MỘT-FILE cho người mới tiếp cận codebase
> (hoặc AI assistant đọc để tích hợp với hệ thống khác). Nhật ký xây dựng từng bước nằm ở
> `IMPLEMENTATION_PLAN.md`; sổ rủi ro/bug ở `EXISTING-BUG.md`; hướng dẫn triển khai ở `DEPLOY.md`.

## 1. Hệ thống làm gì

**e-Approval** — hệ thống trình duyệt & phê duyệt văn bản nội bộ (tiếng Việt) cho công ty ~30 nhân viên, chạy trên LAN:

- Nhân viên tạo văn bản theo loại: **GENERAL** (văn bản chung), **PURCHASE** (đơn hàng — bắt buộc đính file), **PAYMENT** (đề nghị thanh toán — bảng chi phí nhiều dòng, backend tự tính tổng), **LEAVE** (đơn nghỉ phép — backend tự tính số ngày, tự sinh PDF đơn). Admin có thể tạo loại tuỳ biến qua Workflow Builder.
- Văn bản chạy qua **luồng duyệt nhiều bước** cấu hình được (Workflow/WorkflowStep): duyệt / từ chối / yêu cầu chỉnh sửa → người tạo sửa & nộp lại / thu hồi.
- Realtime (WebSocket) + thông báo trong app (chuông) + Web Push (cần HTTPS); nhật ký kiểm toán đầy đủ; xuất Excel; PDF tự sinh có khu phê duyệt + chữ ký.

## 2. Stack & nguyên tắc kiến trúc

| Lớp | Công nghệ |
|---|---|
| Backend | Node.js (v26, nvm) + Express + TypeScript, Prisma ORM |
| DB | PostgreSQL 16 (Docker Compose, bind 127.0.0.1) |
| Frontend | React 19 + Vite + TypeScript, react-router, lucide-react |
| Shared | npm workspaces: package `@etool/shared` (dual build CJS + ESM) |
| Test/CI | Vitest + Supertest (39 integration test, DB riêng `eapproval_test`), GitHub Actions |

**Nguyên tắc bất di bất dịch — Fat Server / Thin Client:** MỌI tính toán, validate, phân quyền nằm ở backend; frontend chỉ hiển thị. `@etool/shared` CHỈ chứa type + hằng số (contract), tuyệt đối không chứa thuật toán. Ví dụ: số ngày nghỉ/tổng tiền preview cũng do backend tính qua `POST /api/documents/preview` (frontend gọi debounce 300ms).

**Cấu trúc thư mục:**

```
etool/
  shared/          # @etool/shared — contract types + constants (LEAVE_TYPES, DOCUMENT_STATUSES,
                   #   WORKFLOW_STEP_KINDS, PERMISSION_KEYS, FormPreviewResult, shape formData...)
  backend/
    prisma/        # schema.prisma + migrations + seed.ts (seed CHỈ khởi tạo lần đầu, không ghi đè)
    src/
      app.ts       # Express app (mount routers + error handler) — tách khỏi index.ts để test được
      index.ts     # listen (PORT=4000, HOST env) + initWebSocket + initReminderJob (cron nhắc việc)
      routes/      # auth, documents, users, departments, roles, workflows, audit, dashboard,
                   #   delegations, notifications, push, health
      lib/         # workflow.ts (tính bước/approver), documentActions.ts (5 action duyệt),
                   #   documentForms.ts (zod schema từng loại + computeLeaveDays + preview),
                   #   documentPdf.ts, leavePdf.ts (pdf-lib), stamp, upload (multer + magic bytes),
                   #   notifications, audit, ws, reminder, prisma singleton
      middlewares/ # authenticate (cookie JWT -> query User+Role từ DB mỗi request), authorize(permission)
    tests/         # integration tests (supertest vào app.ts, fixtures riêng, KHÔNG đụng DB thật)
  frontend/src/
    pages/         # Login, Dashboard, DocumentList/Create/Detail, UserList/Form, DepartmentList,
                   #   RoleList (vai trò & quyền), WorkflowList/Form (builder kéo-thả), AuditLog, Account
    components/    # AppLayout (sidebar theo quyền), documentForms/ (form theo loại), ui/ (design system nhỏ)
    hooks/         # useWebSocket (reconnect backoff), useDocumentFormPreview, usePushNotifications
  deploy/          # Caddyfile + etool-backend.service (systemd) — chưa kích hoạt, xem DEPLOY.md
  scripts/         # backup-db.sh + RESTORE.md
  .github/workflows/ci.yml
```

## 3. Mô hình dữ liệu (Prisma — 13 model chính)

- **User** (username đăng nhập, passwordHash bcryptjs, mustChangePassword, isActive, signatureUrl) → thuộc **Role** + **Department**.
- **Role**: `name` unique + `permissions String[]` — quản lý qua UI "Vai trò & quyền"; wildcard `"*"` = toàn quyền.
- **Workflow** (tên = loại văn bản) → **WorkflowStep[]**: `stepOrder` + `kind` (`CREATOR_DEPT_HEAD` = trưởng phòng của người nộp | `DEPARTMENT` = phòng chỉ định, có thể đích danh `approverUserId`).
- **Document**: docNo tự cấp (`VB-{năm}-{seq}` — DocCounter, atomic upsert), title (LEAVE/PAYMENT tự sinh), type, `formData Json` (đã validate theo schema từng loại + trường dẫn xuất soNgay/tongTien do server tính), status (`PENDING/APPROVED/REJECTED/CHANGES_REQUESTED/WITHDRAWN`), currentStep, creatorId, workflowId.
- **DocumentLog**: timeline (SUBMIT/APPROVE/REJECT/REQUEST_CHANGE/RESUBMIT/WITHDRAW/COMMENT/STEP_SKIPPED + `meta Json` có cấu trúc cho bước bị bỏ qua).
- **Attachment**: file lưu tên UUID trong `backend/uploads/`, `kind` ORIGINAL/APPROVED.
- **Delegation**: uỷ quyền duyệt theo khoảng ngày (fromUser → toUser).
- **Notification** (chuông trong app), **PushSubscription** (Web Push VAPID), **AuditLog** (mọi hành động + IP), **Department**, **DocCounter**.

## 4. Xác thực & phân quyền

- **Đăng nhập** username+password → JWT (payload chỉ `{sub: userId}`, 8h) trong **cookie HttpOnly SameSite=Strict** (`eapproval_token`); `secure` khi NODE_ENV=production. Rate limit login 10 lần/15 phút/IP.
- **Mỗi request**: middleware `authenticate` verify JWT rồi **query lại User+Role+Department từ DB** — không tin claim trong token. `authorize(permission)` so với `role.permissions` (hỗ trợ `"*"`).
- **Catalog quyền** (`PERMISSION_KEYS` trong shared): `document:create`, `document:read:own`, `document:approve:dept|final|payment` (3 quyền này CHỈ điều khiển hiển thị UI thẻ Uỷ quyền/Chữ ký), `user:manage`, `workflow:manage`, `audit:read`.
- **Quyền DUYỆT thật sự KHÔNG đến từ role** mà từ VỊ TRÍ trong WorkflowStep của từng văn bản (so khớp tại thời điểm request — `lib/workflow.ts`), cộng cơ chế uỷ quyền (Delegation) đang hiệu lực.
- `mustChangePassword`: admin cấp/reset mật khẩu → user bị ép đổi mật khẩu ngay lần đăng nhập sau.

## 5. Workflow engine — hành vi cốt lõi

- **Auto-skip bước** khi tạo/nộp lại: bước không có ai đủ điều kiện duyệt (EMPTY) hoặc người duy nhất là chính người tạo (ONLY_CREATOR) → bỏ qua, ghi log STEP_SKIPPED kèm meta; nếu mọi bước đều bị bỏ → chặn tạo.
- **Optimistic concurrency**: update kèm `where {id, currentStep, status}` — 2 người duyệt cùng lúc thì người sau nhận 409 "vừa được người khác xử lý".
- **Guard sửa workflow**: không sửa steps khi còn văn bản PENDING trên workflow đó (409).
- Duyệt bước cuối: LEAVE tự sinh PDF bản "đã duyệt" (1 trang, khu PHẦN PHÊ DUYỆT đủ người/giờ/chữ ký); loại khác có thể đính bản ký tay hoặc auto-stamp PDF gốc.
- Reject/Request-change bắt buộc lý do; resubmit quay về bước thật đầu tiên; withdraw bởi người tạo khi chưa ai duyệt.

## 6. API surface (tất cả JSON, prefix `/api`, cookie auth)

| Nhóm | Endpoints chính |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/profile`, đổi mật khẩu |
| Documents | `GET /documents` (của tôi) · `GET /documents/pending` (chờ tôi duyệt) · `GET /documents/export` (Excel) — cùng bộ lọc: `q, status, from, to, creator, approvedBy, approvedFrom, approvedTo, page, limit` · `POST /documents` (multipart, tối đa 10 file pdf/docx 15MB, magic-bytes check) · `POST /documents/preview` (tính soNgay/tongTien) · `GET/PATCH /documents/:id` · `POST /documents/:id/approve|reject|request-change|resubmit|withdraw|comments` · download attachment |
| Users | CRUD (gate `user:manage`) · `GET /users/options` ({id, fullName} — mọi user đăng nhập, cho picker) |
| Roles | `GET/POST/PATCH/DELETE /roles` (gate `user:manage`; guard chống tự khoá + chống xoá role còn user) |
| Departments | CRUD (gate `user:manage`) |
| Workflows | CRUD + builder steps (gate `workflow:manage`) |
| Delegations | tạo/thu hồi uỷ quyền duyệt |
| Notifications | `GET /notifications` (+unreadCount), `POST /notifications/read-all` |
| Audit | `GET /audit` (gate `audit:read`, lọc theo nhóm AUTH/DOCUMENT/USER/WORKFLOW/FILE) |
| Dashboard | thống kê cá nhân + toàn hệ thống (admin) |
| Push | đăng ký/huỷ Web Push subscription |
| Health | `GET /health` — có ping DB thật (`SELECT 1`), 503 khi DB chết |

Response lỗi thống nhất: `{ "error": "<message tiếng Việt>" }` + HTTP status đúng nghĩa (400/401/403/404/409/500). Mọi response user đều đã lược `passwordHash`.

## 7. Realtime & thông báo

- **WebSocket** gắn trên cùng http server (mọi path; handshake xác thực bằng cookie JWT, từ chối trước khi upgrade). Registry in-memory userId→sockets (chấp nhận 1 instance — không scale ngang, đã quyết định có chủ đích). Client `useWebSocket` có **reconnect backoff** 1s→30s. Dev nối thẳng `:4000`; production build nối same-origin `/ws` (qua Caddy).
- `notify()` ghi bảng Notification TRƯỚC rồi mới bắn WS + Web Push — offline không mất thông báo.
- Cron nhắc việc (node-cron, `lib/reminder.ts`) nhắc hồ sơ chờ duyệt lâu.

## 8. Trạng thái vận hành hiện tại

- **Đang ở giai đoạn TESTING nội bộ** trên LAN: backend `tsx watch` (0.0.0.0:4000) + Vite dev (5173), truy cập `http://192.168.10.9:5173`. Postgres container `etool-postgres-1` (chỉ localhost).
- **Đã chuẩn bị sẵn go-live** (chưa kích hoạt — cần sudo tại máy): Caddy HTTPS `tls internal` + systemd + NODE_ENV=production — làm theo `DEPLOY.md` mục 1→5. Sau đó Web Push mới hoạt động (cần secure context).
- Build production: `npm run build` ở root (shared → backend → frontend, đúng thứ tự).
- Chạy dev: `docker compose up -d postgres` → `npm ci` (root, cài cả 3 workspace) → `npm run build:shared` → backend `npm run dev`, frontend `npm run dev`. Env: xem `backend/.env.example` (DATABASE_URL, JWT_SECRET, VAPID keys...) — **file .env thật không có trong bản bàn giao**.
- Test: `cd backend && npm test` (tự migrate DB test riêng). CI chạy test + tsc + build mỗi push/PR vào main.
- Việc còn mở: R06/R17 (go-live — đã chuẩn bị sẵn), R18 (thiếu test frontend). Chi tiết: `EXISTING-BUG.md`.

## 9. Gợi ý cho việc tích hợp với hệ thống khác (vd. CRM)

- **Toàn bộ nghiệp vụ đi qua REST API JSON** (mục 6) — tích hợp server-to-server dễ nhất là gọi các API này. Lưu ý auth hiện tại là **cookie session của người dùng** (không có API key/service token) — nếu CRM cần gọi máy-với-máy, nên thêm cơ chế token riêng (vd. API key per-integration hoặc JWT service account) thay vì giả lập cookie.
- **Chưa có webhook/outbound event** — CRM muốn nhận sự kiện (văn bản được duyệt...) thì hoặc polling `GET /documents` với bộ lọc `approvedFrom/approvedTo`, hoặc thêm webhook vào `notify()` (`lib/notifications.ts` — điểm bắn sự kiện tập trung, dễ mở rộng).
- **Contract dùng chung** nằm gọn trong `shared/src/index.ts` — nếu CRM viết TypeScript có thể copy/import package này để khớp kiểu dữ liệu wire.
- Mã nguồn không phụ thuộc domain/cloud nào; DB schema qua Prisma migrations (`backend/prisma/migrations/`) — dựng lại từ đầu bằng `prisma migrate deploy` + `seed.ts` (seed idempotent, không ghi đè dữ liệu thật).
- Danh tính người dùng: username nội bộ, không SSO — nếu CRM có SSO/LDAP thì điểm chạm là `routes/auth.ts` + bảng User.

## 10. Tài liệu liên quan trong repo

| File | Vai trò |
|---|---|
| `IMPLEMENTATION_PLAN.md` | Nhật ký xây dựng từng bước (Bước 1→42) — lịch sử quyết định, kết quả kiểm thử từng đợt |
| `EXISTING-BUG.md` | Sổ rủi ro R01→R32: đã fix gì, còn mở gì, fix ở đâu |
| `DEPLOY.md` | Runbook go-live (Caddy/HTTPS/systemd) + quy trình cập nhật phiên bản |
| `REFACTOR_PLAN.md` / `POST_REFACTOR_PLAN.md` | Hồ sơ refactor (test, tách file, meta) + giai đoạn D/E |
| `ACTION_PLAN.md` | Hồ sơ hardening bảo mật giai đoạn đầu |
| `scripts/RESTORE.md` | Backup/restore DB + uploads |
