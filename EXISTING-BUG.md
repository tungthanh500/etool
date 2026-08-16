# EXISTING-BUG.md — Rủi ro & Vấn đề còn tồn tại (e-Approval Workflow)

> **Nguồn gốc tài liệu:** Thay thế `CONVERSATION.md` (báo cáo cũ của Antigravity, đã lỗi thời — liệt kê sai một số mục đã được fix). Danh sách dưới đây được kiểm chứng **trực tiếp trên code thực tế** trong repo `~/etool` (đọc từng file liên quan qua SSH, không suy đoán từ tài liệu cũ) vào **2026-07-16**.
>
> **Dành cho Claude/người kế nhiệm:** Trước khi sửa bất kỳ mục nào, đọc lại đúng phần liên quan, xác nhận lại code hiện tại (có thể đã thay đổi từ lúc viết tài liệu này), và cập nhật trạng thái thành `[ĐÃ FIX — <ngày>, commit <hash>]` sau khi hoàn tất.

---

## Hiện trạng khi đánh giá (2026-07-16)

- Backend Bước 1–9 + Web Push (Bước 8) + Trang quản trị User (Bước 7): code đã hoàn thành, `tsc --noEmit` sạch, đã commit (13 commit, HEAD `82682f5`).
- Frontend core (login, danh sách, tạo văn bản, chi tiết/duyệt, WebSocket): đã hoàn thành, test qua trình duyệt thật.
- Không có dev server nào đang chạy; chỉ có container `etool-postgres-1` đang `Up (healthy)`.
- GitHub sync: đã có remote `origin` (`https://github.com/tungthanh500/etool.git`), đã push đầy đủ — xem cập nhật 2026-07-18 bên dưới.
- **R08 (bug logs thiếu entry) đã được fix ở Bước 9** (commit `01ae7f4`) — xác nhận lại đúng trong `backend/src/routes/documents.ts`: thứ tự `tx.documentLog.create()` chạy trước `tx.document.update({include: {logs}})` ở cả 4 action (`approve`/`reject`/`request-change`/`resubmit`).
- **Cập nhật 2026-07-16 (cùng ngày, Giai đoạn 0 của `ACTION_PLAN.md`):** toàn bộ **NHÓM 1** đã fix trừ R06 — **R01, R02, R03, R04, R05, R07 đã fix và kiểm chứng thật** (curl + đối chiếu DB + đối chiếu cổng mạng), xem chi tiết ở từng mục bên dưới. R06 (HTTPS) vẫn ghi nhận chờ lúc triển khai, không thuộc phạm vi code sửa được ngay. (Đã commit — xem cập nhật 2026-07-18 bên dưới.)
- **Cập nhật 2026-07-17 (sau khi hoàn tất toàn bộ 4 giai đoạn `ACTION_PLAN.md`):** rà soát lại từng mục **trực tiếp trên code hiện tại** (không suy từ tài liệu). Đã fix thêm: **R09 (một phần — giới hạn chấp nhận được), R10, R11, R13, R15**. **R20 đổi đánh giá: rủi ro KHÔNG còn bằng 0** vì trang quản trị Workflow (Bước 11) đã tồn tại — nâng ưu tiên P3 → P2. Còn mở: R06, R12, R14, R16, R17, R18, R19, R20. (Đã commit — xem cập nhật 2026-07-18 bên dưới.)
- **Cập nhật 2026-07-18:** repo đã có remote GitHub (`origin`) và **đã push toàn bộ, không còn thay đổi tồn đọng**. Nhánh `main` local và `origin/main` trùng khớp tại commit `f1237da` (bao gồm cả toàn bộ Giai đoạn 5 — mục 5.1–5.6 — và fix R28). Mọi ghi chú "(chưa commit)" còn sót lại trong tài liệu này bên dưới đã lỗi thời và được sửa lại thành "(đã commit)".
- **Cập nhật 2026-07-18 (tiếp, sau refactor + E1/E2):** Đóng R18 một phần (backend test + CI, xem `REFACTOR_PLAN.md` giai đoạn A + `POST_REFACTOR_PLAN.md` E1). Đóng R19 (chấp nhận có chủ đích). E2 (`POST_REFACTOR_PLAN.md`) hoàn tất theo hướng npm workspace + package `@etool/shared` (chỉ type/hằng số, không thuật toán — đúng nguyên tắc Fat Server/Thin Client). Phát sinh **R29** (mới, chưa fix): frontend đang tự tính toán ở 2 chỗ (`previewLeaveDays`, tổng tiền `PaymentForm`), vi phạm nguyên tắc Fat Server — cần quyết định UX trước khi sửa. Còn mở: R06, R12, R16, R17, R18 (một phần), R29.
- **Cập nhật 2026-07-19:** Đóng **R29** (API preview `POST /api/documents/preview` + hook debounce, xem `POST_REFACTOR_PLAN.md` E2). Giai đoạn D: đóng **R16** (health check DB thật) và **R12** (WS reconnect backoff); **R06**/**R17** đã chuẩn bị sẵn toàn bộ code + config (`deploy/Caddyfile`, `deploy/etool-backend.service`, `DEPLOY.md`) nhưng CHƯA thực thi — cần sudo tại máy, người dùng hiện không có mặt. Dùng thử đa vai trò qua trình duyệt thật phát hiện + fix ngay **R30** (layout PAYMENT bó hẹp) và **R31** (seed user `hr` 2 ký tự vi phạm `usernameSchema`, Admin không sửa được qua UI); phát hiện thêm **R32** (mới, chưa fix, tech debt nhỏ): trang `/audit` hiện sai thông báo khi bị 403. Còn mở: R06, R17 (chuẩn bị sẵn), R18 (một phần), R32.
- **Cập nhật 2026-08-16 (rà lại theo git log — tài liệu trước đó dừng ở 2026-07-19/21, code đã đi tiếp tới 2026-07-25):** ghi bổ sung 4 mục **R33–R36** (đều ĐÃ FIX) phát hiện trong đợt review sau khi chuẩn bị go-live, và 1 đợt làm mới giao diện (`bb850ee`, 2026-07-20 — DateInput lịch bấm chọn, design token Material 3, gọn bộ lọc; kèm thay đổi hành vi API `GET /users/options`). Giai đoạn 6 (thu hồi hồ sơ đã duyệt một phần) đã hoàn thành + commit — chi tiết ở `ACTION_PLAN.md`. Bộ test backend: **39 → 49 test / 9 file**, toàn bộ xanh. Còn mở: **R06, R17** (chuẩn bị sẵn, chờ sudo), **R18** (một phần — vẫn thiếu test frontend), cộng nợ UX nhỏ ở form user (xem R31).

---

## NHÓM 1 — Bảo mật nghiêm trọng (xử lý trước khi go-live)

### [R01] ~~`JWT_SECRET` vẫn là placeholder~~
- **File:** `backend/.env` — `JWT_SECRET="change-me-in-production"`.
- **Nguy cơ:** Ai biết chuỗi này có thể tự ký JWT với `userId` bất kỳ, bypass hoàn toàn xác thực.
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-16 (đã commit)**. Sinh secret bằng `openssl rand -hex 64` (64 byte hex), thay vào `backend/.env`; `.env.example` thêm ghi chú cách sinh + cảnh báo không dùng giá trị mẫu. Đã restart backend + đăng nhập lại thành công (token ký bằng secret cũ tự động hết hiệu lực do không còn ai giữ).

### [R02] ~~Mật khẩu Postgres mặc định + DB expose ra LAN~~
- **File:** `docker-compose.yml` (`ports: "${POSTGRES_PORT:-5432}:5432"` → bind `0.0.0.0`), root `.env` (`POSTGRES_PASSWORD=eapproval`), `backend/.env` (`DATABASE_URL` cùng password yếu).
- **Nguy cơ:** Bất kỳ máy nào trong LAN 192.168.10.0/24 kết nối thẳng tới Postgres với mật khẩu đoán được.
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-16 (đã commit)**. Làm đúng thứ tự đã ghi: (1) `ALTER USER eapproval PASSWORD '<new>'` qua `psql` trên container đang chạy (không mất dữ liệu volume); (2) cập nhật `POSTGRES_PASSWORD` (root `.env`) + `DATABASE_URL` (`backend/.env`) khớp mật khẩu mới (`openssl rand -base64 24` lọc còn 32 ký tự alphanumeric, tránh vấn đề encode trong URL); (3) `docker-compose.yml` đổi port mapping thành `127.0.0.1:${POSTGRES_PORT:-5432}:5432`; (4) `docker compose up -d` recreate container. **Kiểm chứng:** container `healthy` sau recreate; `ss -tlnp` xác nhận chỉ nghe `127.0.0.1:5432` (trước đó `0.0.0.0:5432`); backend reconnect + login thật (`director@example.com`) trả đúng dữ liệu cũ — không mất dữ liệu.

### [R03] ~~Seed script không có guard chống chạy trên production~~
- **File:** `backend/prisma/seed.ts` — hàm `main()` không kiểm tra `NODE_ENV`.
- **Nguy cơ:** Vô tình chạy `prisma:seed` trên production sẽ reset mật khẩu 4 user mẫu về `ChangeMe123!` (biến `DEV_PASSWORD`).
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-16 (đã commit)**. Thêm hàm `assertSafeToSeed()` đầu `main()`: nếu `NODE_ENV === "production"` và không có `FORCE_SEED=1` → in lỗi tiếng Việt + `process.exit(1)`. **Kiểm chứng:** `NODE_ENV=production npx tsx prisma/seed.ts` → bị chặn, exit code 1; chạy lại không set `NODE_ENV` → seed chạy bình thường (exit code 0).

### [R04] ~~Không có rate limiting cho `/api/auth/login`~~
- **File:** `backend/src/routes/auth.ts` — route `POST /login` không có middleware giới hạn số lần thử.
- **Nguy cơ:** Brute-force mật khẩu không giới hạn.
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-16 (đã commit)**. Cài `express-rate-limit`, áp riêng cho `POST /login` (giới hạn 10 lần/15 phút/IP, trả 429 kèm message tiếng Việt). **Kiểm chứng:** curl sai mật khẩu 11 lần liên tiếp cùng IP → 10 lần đầu 401, lần 11 → 429; đối chiếu `AuditLog` xác nhận đúng 10 entry `AUTH/LOGIN_FAILED` được ghi (lần bị chặn không tính vào audit vì không chạm tới route handler).

### [R05] ~~Không có HTTP security headers (Helmet)~~
- **File:** `backend/src/index.ts`, `backend/package.json` — không có dependency `helmet`, không import/dùng ở đâu.
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-16 (đã commit)**. Cài `helmet`, `app.use(helmet())` đặt trước mọi route (dùng cấu hình mặc định vì backend là API JSON thuần, không render HTML). **Kiểm chứng:** response có đủ header bảo mật (CSP, X-Frame-Options, X-Content-Type-Options...); WebSocket không bị ảnh hưởng (gắn trực tiếp vào HTTP server ở sự kiện `upgrade`, không đi qua Express middleware); luồng login/download cũ vẫn chạy bình thường.

### [R06] Không có HTTPS — cookie JWT truyền bản rõ
- **Xác nhận:** Không có `nginx` cài trên máy (`which nginx` → không tìm thấy), không có cert Let's Encrypt, backend chạy HTTP thuần trên port 4000, frontend Vite dev trên 5173.
- **Nguy cơ:** Cookie JWT (dù `HttpOnly`) và toàn bộ traffic đi bản rõ trên LAN — sniff được nếu có kẻ tấn công trong cùng mạng.
- **Ghi chú thêm:** HTTPS còn là điều kiện bắt buộc để Web Push (Service Worker) hoạt động — hiện tại truy cập qua IP LAN HTTP không phải "secure context" nên Service Worker không đăng ký được (xem thêm ghi chú Web Push trong `IMPLEMENTATION_PLAN.md` Bước 8).
- **Trạng thái:** ❌ Chưa fix.

### [R07] ~~Kiểm tra MIME type upload chỉ dựa vào phần mở rộng file~~
- **File:** `backend/src/lib/upload.ts` — `fileFilter` chỉ check `path.extname(file.originalname)`, không đọc magic bytes/nội dung thật của file.
- **Nguy cơ:** Đổi tên file `.exe`/mã độc thành `.pdf`/`.docx` sẽ qua được filter (dù mimeType báo cáo bởi client cũng không đáng tin).
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-16 (đã commit)**. Thêm middleware `verifyMagicBytes` (`backend/src/lib/upload.ts`) chạy SAU khi multer ghi file lên đĩa, dùng `file-type` (v22, ESM-only — cần ambient module declaration riêng ở `backend/src/types/file-type.d.ts` vì `moduleResolution: "node"` không tự resolve type của gói ESM) đối chiếu magic bytes thật với phần mở rộng khai báo; không khớp → xoá file + 400. Gắn vào cả 2 route upload: `POST /api/documents` (tạo văn bản) và `POST /api/documents/:id/approve` (bản đã ký). **Kiểm chứng:** file ELF đổi đuôi thành `.pdf` → 400 "nội dung file không khớp định dạng khai báo", không còn file rác trong `UPLOAD_DIR`; PDF thật và DOCX thật (zip OOXML hợp lệ) đều qua bình thường (201, không false positive).

---

## NHÓM 2 — Vận hành & chức năng

### [R08] ~~Bug: response action endpoints trả logs thiếu entry vừa tạo~~
- **Trạng thái:** ✅ **ĐÃ FIX** ở Bước 9 (2026-07-16, commit `01ae7f4`). Xác nhận lại trực tiếp trong `backend/src/routes/documents.ts`: cả 4 transaction (`approve`/`reject`/`request-change`/`resubmit`) đều gọi `tx.documentLog.create(...)` **trước** `tx.document.update({include: {..., logs}})`.

### [R09] ~~`GET /api/documents/pending` lọc ở application layer~~
- **File:** `backend/src/routes/documents.ts:129-141` — query `findMany({ where: { status: "PENDING" } })` tải **toàn bộ** hồ sơ PENDING của cả công ty vào memory, rồi mới `.filter(d => isCurrentApprover(d, req.user!))` bằng JS.
- **Nguy cơ:** Không hiệu quả khi số lượng hồ sơ PENDING lớn — tải dư thừa dữ liệu không thuộc về người dùng hiện tại trước khi lọc.
- **Trạng thái:** ✅ **ĐÃ FIX MỘT PHẦN — 2026-07-17, mục 3.2 ACTION_PLAN (đã commit), giới hạn còn lại chấp nhận được.** Phần lọc thô đã đẩy xuống DB (`workflow.steps.some({approverRole ∈ [role mình + role người uỷ quyền]})` — thu hẹp mạnh tập cần tải); điều kiện chính xác (đúng bước hiện tại + Dept_Head cùng phòng ban) **không diễn đạt được trong Prisma `where`** (so sánh 2 cột khác bảng) nên vẫn hậu kiểm `isCurrentApprover()` ở app layer — giới hạn này đã ghi rõ trong code comment, chấp nhận được ở quy mô nội bộ hiện tại.

### [R10] ~~Không có pagination~~
- **File:** `backend/src/routes/documents.ts` — cả `GET /` (dòng 117) và `GET /pending` (dòng 131) đều không có `take`/`skip`.
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-17, mục 3.2 ACTION_PLAN (đã commit).** `parseListQuery()` dùng chung (`q`/`status`/`from`/`to`/`page`/`limit`): `GET /` phân trang + đếm **thật ở DB**; `GET /pending` phân trang trên mảng sau hậu kiểm (hệ quả của giới hạn R09, đã ghi chú trong code). Response đổi sang shape `{items, total, page, limit}`, frontend có thanh lọc + phân trang đồng bộ URL.

### [R11] ~~Không thể vô hiệu hóa tài khoản user (nhân viên nghỉ việc)~~
- **File:** `backend/prisma/schema.prisma` — model `User` (dòng 11-27) **không có field** `isActive`/`deletedAt` nào cả. `backend/src/routes/users.ts` cũng không có route `DELETE`.
- **Đánh giá lại so với báo cáo cũ:** Effort thực tế **cao hơn ước tính ban đầu** — đây không chỉ là thêm 1 route, mà cần **migration Prisma mới** để thêm field vào schema trước khi có route xử lý.
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-16, Giai đoạn 1 ACTION_PLAN (migration `add_user_account_fields`, đã commit).** `User.isActive Boolean @default(true)`; `PATCH /api/users/:id` cho bật/tắt (chặn tự vô hiệu hoá chính mình); login/authenticate từ chối user bị khoá; uỷ quyền (4.1) tự treo khi người uỷ quyền bị khoá; thông báo/nhắc hạn chỉ gửi tới user active.

### [R12] WebSocket không có reconnect logic
- **File:** `frontend/src/hooks/useWebSocket.ts` — không có `ws.onclose` kèm retry/exponential backoff. Mất kết nối (mạng chập chờn, backend restart) → im lặng cho tới khi người dùng tự F5.
- **Trạng thái:** ❌ Chưa fix.

### [R13] ~~Không có audit log cho thay đổi quyền user~~
- **File:** `backend/src/routes/users.ts` — `PATCH /:id` cho phép đổi `roleId`/`departmentId`/`password` nhưng không ghi lại ai đã đổi, đổi từ gì sang gì, lúc nào (khác với `DocumentLog` chỉ theo dõi hành động trên văn bản, không theo dõi hành động quản trị user).
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-16, Bước 12 (AuditLog toàn hệ thống, đã commit) + mở rộng ở các bước sau.** `lib/audit.ts` + bảng `AuditLog`; `users.ts` ghi `USER_CREATE`/`USER_UPDATE`/`USER_ENABLE`/`USER_DISABLE`; các hành động quản trị khác cũng phủ audit (`DEPT_*`, `WORKFLOW_*`, `DELEGATION_*`, `AUTH`, `FILE`...); trang `/audit` cho Admin tra cứu.

### [R14] ~~`formData` không có schema validation theo từng loại văn bản~~
- **File:** `backend/src/routes/documents.ts:29-59` — chỉ kiểm tra `formData` là JSON string hợp lệ và là object (không phải array/null), không validate cấu trúc cụ thể theo `type` (`PURCHASE`/`PAYMENT`/`GENERAL`).
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-18, Giai đoạn 5 mục 5.1 (đã commit).** `lib/documentForms.ts` — zod schema riêng cho từng loại chuẩn (GENERAL/PURCHASE/PAYMENT/LEAVE), validate ở cả POST lẫn PATCH; trường dẫn xuất (tổng tiền, số ngày nghỉ) server tự tính lại, không tin client. Ô "Dữ liệu form (JSON — nâng cao)" đã bỏ hẳn khỏi UI, thay bằng form thật theo từng loại. Loại tuỳ biến ngoài 4 loại chuẩn (Admin tự tạo qua Workflow Builder) vẫn fallback nhận JSON tự do như cũ.

---

## NHÓM 3 — Chống sập & vận hành production

### [R15] ~~Không có backup database tự động~~
- **Xác nhận:** Không tìm thấy script backup nào trong repo, không có crontab nào cấu hình (`crontab -l` rỗng).
- **⚠️ RỦI RO ĐÃ THÀNH SỰ THẬT — 2026-07-16:** lệnh `prisma migrate dev` chạy trong môi trường non-interactive đã tự reset (xoá sạch) toàn bộ dữ liệu DB dev mà không có gì để khôi phục. Xem chi tiết đầy đủ trong `IMPLEMENTATION_PLAN.md` mục "SỰ CỐ NGHIÊM TRỌNG". Đã thêm mục 3.4 vào `ACTION_PLAN.md` để xử lý, kèm khuyến nghị nâng độ ưu tiên.
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-17, mục 3.4 ACTION_PLAN (script trong repo, đã commit).** `scripts/backup-db.sh`: `pg_dump -Fc` qua docker exec + tar `backend/uploads/` (DB không chứa file — vá ở Bước 24A), ghi `.tmp` rồi rename, xoay vòng giữ 7 bản, log đầy đủ; cron hệ điều hành `0 2 * * *` (GMT+7, độc lập với backend); `scripts/RESTORE.md` 6 bước kèm quy tắc an toàn migrate (backup trước + `--create-only` + `migrate deploy`). Đã restore thử thật vào DB tạm để kiểm chứng. **Lưu ý vận hành:** crontab là cấu hình theo máy — chuyển server phải cài lại.

### [R16] `GET /health` không kiểm tra kết nối DB
- **File:** `backend/src/routes/health.ts` — trả cứng `{ status: "ok" }`, không có bất kỳ query Prisma nào để xác nhận Postgres còn sống.
- **Trạng thái:** ❌ Chưa fix.

### [R17] Backend chạy bằng `tsx watch` — chưa có process manager cho production
- **File:** `backend/package.json` — script `dev: "tsx watch src/index.ts"`. Có sẵn `start: "node dist/index.js"` nhưng không có gì (pm2/systemd) chạy nó bền vững.
- **Xác nhận thêm:** `pm2` **chưa được cài** trên máy (`which pm2` → not found). Không tìm thấy file `ecosystem.config.js` hay systemd `.service` nào trong repo/hệ thống.
- **Trạng thái:** ❌ Chưa fix.

---

## NHÓM 4 — Kỹ thuật dài hạn (backlog)

### [R18] ~~Không có test tự động~~
- **Xác nhận (cũ):** `find` không thấy file `*.test.ts*`/`*.spec.ts*` nào trong `backend/src` hay `frontend/src`. Không có `jest`/`vitest`/`mocha` trong `package.json` của cả backend lẫn frontend.
- **Trạng thái:** ✅ **ĐÃ FIX (một phần — backend integration) — 2026-07-18, `REFACTOR_PLAN.md` Giai đoạn A.** Thêm vitest + supertest, DB test riêng `eapproval_test` (guard `tests/setup.ts` chặn chạy nhầm DB thật), fixtures mint token trực tiếp tránh rate limit login. **19 test** phủ: tạo văn bản, luồng duyệt nhiều bước, sai người duyệt (403), duyệt/thu hồi khi không PENDING (400), OCC, reject (±comment), request-change→resubmit (±đúng creator), auto-skip ONLY_CREATOR & EMPTY (kèm `meta`), LEAVE tự sinh PDF ORIGINAL→APPROVED, guard R20, và 2 unit test `buildLeaveStepRows`. Chạy: `cd backend && npm test`. **CI GitHub Actions đã có (2026-07-18, `POST_REFACTOR_PLAN.md` E1):** `.github/workflows/ci.yml` chạy backend (Postgres service + tsc + 19 test) và frontend (build) mỗi push/PR vào `main` — đã xác nhận xanh. **Còn thiếu:** test frontend (component/e2e).

### [R19] WebSocket registry in-memory, không scale nhiều instance
- **File:** `backend/src/lib/ws.ts` — biến `connections: Map<string, Set<WebSocket>>` sống trong memory của 1 process Node duy nhất, không dùng Redis Pub/Sub hay cơ chế chia sẻ giữa nhiều instance.
- **Ghi chú:** Hiện hệ thống chỉ chạy 1 instance nên chưa phải vấn đề thực tế, chỉ là giới hạn khi scale ngang sau này.
- **Trạng thái:** ✅ **CHẤP NHẬN CÓ CHỦ ĐÍCH — 2026-07-18.** Xác nhận với người dùng: công ty quy mô hơn 30 nhân viên, không có kế hoạch triển khai đa instance. Ở quy mô này, 1 process Node xử lý thoải mái toàn bộ kết nối WebSocket (ước tính tối đa ~90 kết nối đồng thời kể cả mỗi người mở 3 tab) — không chạm ngưỡng cần scale ngang (số kết nối lớn, CPU-bound, HA/zero-downtime, hay phân tán địa lý). Toàn bộ kiến trúc (`POST_REFACTOR_PLAN.md`) cũng nhất quán thiết kế 1 instance: Postgres 1 container, backend 1 unit systemd, upload lưu đĩa cục bộ — không riêng WS registry. Điều kiện để fix lại: có quyết định thật sự chạy ≥2 instance backend, lúc đó phải sửa đồng thời cả WS registry (Redis Pub/Sub), file storage (object storage dùng chung), và connection pooling Postgres.

### [R20] ~~Workflow bị sửa giữa chừng khi document đang PENDING~~
- **Đánh giá cũ (2026-07-16, đã lỗi thời):** khi đó chưa có route admin nào sửa Workflow → rủi ro = 0.
- **⚠️ ĐÁNH GIÁ LẠI 2026-07-17 — RỦI RO ĐÃ THÀNH HIỆN THỰC:** từ Bước 11, trang quản trị Workflow Builder + `PATCH /api/workflows/:id` đã tồn tại và **thay toàn bộ steps** (`deleteMany` + `createMany`) **không có guard** kiểm tra hồ sơ PENDING đang dùng workflow đó.
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-18, Giai đoạn 5 mục 5.6 (đã commit).** Đúng hướng đề xuất: `PATCH` có `steps` → đếm `document.count({workflowId, status:"PENDING"})`, >0 → 409 "Không thể sửa các bước: đang có văn bản chờ duyệt dùng luồng này" (vẫn cho sửa `description` riêng). Kiểm chứng qua curl thật (tạo văn bản PENDING → PATCH steps → 409; PATCH chỉ description → 200).

---

## NHÓM 5 — UX & chức năng phát hiện qua phiên chạy thử nhập vai (Bước 28, 2026-07-17)

> Nguồn: đóng vai Staff + Trưởng phòng chạy trọn vòng đời hồ sơ trên trình duyệt thật. Mục #3 của phiên đánh giá (ô nhập JSON thô khi tạo văn bản) chính là **R14** — không lập mã mới, R14 vẫn mở chờ spec.

### [R21] ~~Nút "Duyệt" không có xác nhận~~
- **Hiện tượng:** 1 click là duyệt ngay, không hỏi lại, không nhập được ý kiến — trong khi Từ chối/Yêu cầu chỉnh sửa/Thu hồi đều có modal. Hành động không hoàn tác được.
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-17 (đã commit).** `PromptDialog` mở rộng (`optional`, `message`, tone `success`); bấm Duyệt mở modal ghi rõ hệ quả (bước cuối hay chuyển tiếp, kèm tên bản đã ký nếu có) + ô "Ý kiến (tuỳ chọn)". Backend vốn đã nhận `comment` — ý kiến ghi vào timeline.

### [R22] ~~`formData` không hiển thị trên trang chi tiết~~
- **Hiện tượng:** dữ liệu đặc thù (số tiền, nhà cung cấp...) nhập lúc tạo nhưng người duyệt không thấy ở đâu — mất thông tin ra quyết định.
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-17 (đã commit).** Card "Dữ liệu form" trên trang chi tiết: bảng key–value, số format `vi-VN` (12.500.000), object lồng thì stringify. Chỉ hiện khi formData có nội dung.

### [R23] ~~Không có hộp thông báo trong app~~
- **Hiện tượng:** WS toast chỉ hiện khi đang mở tab đúng lúc; Web Push cần HTTPS (kẹt R06) — người duyệt offline là lỡ thông báo.
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-17 (đã commit).** Bảng `Notification` (migration `add_notification`, cascade theo User/Document); `notify()` ghi DB trước rồi mới bắn WS/Push; `GET /api/notifications` (30 bản mới nhất + unreadCount), `POST /api/notifications/read-all`; chuông trên topbar có badge số chưa đọc, panel danh sách (item chưa đọc nền khác, click điều hướng tới hồ sơ, mở panel = đánh dấu đã đọc), đồng bộ realtime qua WS.

### [R24] ~~Sidebar hiển thị role thô tiếng Anh~~
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-17 (đã commit).** `AppLayout` dùng `roleLabel()` — "Dept_Head" → "Trưởng phòng" ở cả trigger menu lẫn dropdown.

### [R25] ~~Card Uỷ quyền duyệt + Chữ ký mẫu hiện với role không duyệt~~
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-17 (đã commit).** Helper mới `canApproveAnything()` (quyền `document:approve:*` hoặc `*`). Hai card chỉ hiện khi là người duyệt HOẶC có uỷ quyền liên quan (Staff **nhận** uỷ quyền vẫn thấy bảng + upload được chữ ký — vì khi duyệt thay, chữ ký của họ được đóng vào PDF); form "Tạo uỷ quyền" chỉ hiện với người duyệt. Subtitle trang đổi theo ngữ cảnh.

### [R26] ~~4/6 stat card dashboard không click được~~
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-17 (đã commit).** Đã duyệt/Đang chờ/Cần sửa/Bị từ chối điều hướng `/documents?status=...` (filter có sẵn từ 3.2).

### [R27] ~~Toast "Đã xử lý thành công" chung chung~~
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-17 (đã commit).** Message theo hành động: "Đã duyệt văn bản" / "Đã từ chối văn bản" / "Đã gửi yêu cầu chỉnh sửa" / "Đã nộp lại văn bản".

---

## NHÓM 6 — Phát hiện trong lúc xây Giai đoạn 5 (2026-07-18)

### [R28] ~~`prisma/seed.ts` ghi đè dữ liệu thật khi chạy lại trên môi trường đã có user/workflow thật~~
- **Sự cố có thật đã xảy ra:** chạy `npx tsx prisma/seed.ts` (chỉ định thêm "Phòng Nhân sự" cho mục 5.1) đã vô tình: (1) hồi sinh 4 tài khoản demo cũ (`staff`/`depthead`/`director`/`accountant`) — email demo không còn tồn tại trong DB thật nên `upsert` coi là tạo mới; (2) **ghi đè bước duyệt Director/Accountant của GENERAL/PAYMENT/PURCHASE** từ đích danh "Eng Han Liang" (thật, do Admin tự cấu hình qua UI) sang các user demo giả — vì vòng lặp WORKFLOWS trong seed.ts **unconditionally xoá + tạo lại steps của MỌI workflow mỗi lần chạy**, kể cả workflow đã tồn tại và đã được tuỳ chỉnh thật.
- **Khắc phục:** khôi phục 3 workflow qua API (`PATCH /workflows`, có audit); vô hiệu hoá rồi xoá 4 user demo hồi sinh (qua API hợp lệ, có xác nhận người dùng trước khi xoá hẳn).
- **Trạng thái:** ✅ **ĐÃ FIX TẬN GỐC — 2026-07-18 (đã commit).** `seed.ts`: bỏ hẳn 4 user demo khỏi danh sách (chỉ còn `admin` + `hr`); vòng lặp WORKFLOWS đổi sang **bỏ qua hoàn toàn** workflow đã tồn tại (không đụng description lẫn steps) — seed giờ chỉ lo khởi tạo lần đầu, không còn là "nguồn sự thật" ghi đè cấu hình môi trường đang chạy thật. **Bài học ghi lại trong code:** không giả định "seed lại vô hại" một khi hệ thống đã có dữ liệu vận hành thật.

### [R29] ~~Frontend tự tính toán — vi phạm Fat Server / Thin Client~~
- **Phát hiện:** 2026-07-18, khi audit toàn frontend theo yêu cầu người dùng "luôn ghi nhớ, frontend chỉ hiển thị, tất cả tính toán đều làm ở backend" (đã lưu thành ghi nhớ dài hạn `feedback_fat_server.md`).
- **File:**
  - `frontend/src/lib/documentFormMeta.ts` — hàm `previewLeaveDays()` tự chép lại thuật toán tính số ngày nghỉ (trừ Thứ 7/CN) mà backend đã có ở `computeLeaveDays()` (`backend/src/lib/documentForms.ts`), để hiện preview trước khi submit.
  - `frontend/src/components/documentForms/PaymentForm.tsx` dòng 34 — tự `reduce()` cộng tổng tiền các dòng chi phí để hiện preview `tongTien`.
- **Mức độ:** KHÔNG phải lỗ hổng bảo mật — backend vẫn luôn tính lại và validate độc lập lúc submit (`validateDocumentForm`), không tin dữ liệu client gửi lên. Đây là vi phạm nguyên tắc kiến trúc/nợ đồng bộ logic (2 nơi cùng một công thức, dễ lệch khi sửa 1 bên).
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-19 (đã commit).** Chọn hướng (b): `POST /api/documents/preview` (backend tính, lenient — không throw khi form đang gõ dở) + hook `useDocumentFormPreview` debounce 300ms phía frontend. Xoá hẳn `previewLeaveDays()`/`parseISODateUTC()`. Kiểm chứng qua trình duyệt thật: LEAVE hiện đúng số ngày + lỗi cuối tuần, PAYMENT hiện đúng tổng tiền.

### [R30] Bảng chi phí PAYMENT bị bó hẹp trong khoảng trắng thừa
- **Phát hiện:** 2026-07-19, người dùng chụp màn hình điện thoại báo "còn thừa nhiều không gian bên phải".
- **Nguyên nhân:** `.form-stack` mặc định `max-width: 520px` — hợp cho form 1 tiêu đề/textarea (GENERAL/PURCHASE/LEAVE) nhưng bảng chi phí 4 cột của PAYMENT cần rộng hơn.
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-19 (đã commit).** Modifier `.form-stack--wide`, áp dụng có điều kiện theo `type === "PAYMENT"` ở `CreateDocumentPage.tsx`, `DocumentDetailPage.tsx` (panel Sửa), và root của `PaymentForm.tsx`.

### [R31] Seed user `hr` (2 ký tự) vi phạm chính `usernameSchema` của hệ thống
- **Phát hiện:** 2026-07-19, khi dùng thử đa vai trò — Admin không sửa được bất kỳ trường nào của user `hr` qua UI (HTML5 pattern validation chặn im lặng, không có thông báo lỗi rõ ràng).
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-19 (đã commit).** Đổi username user thật `hr` → `nhansu` qua UI Admin; sửa `prisma/seed.ts` dùng `nhansu` kèm comment giải thích để không tái diễn trên máy mới.
- **Nợ UX nhỏ còn lại (chưa sửa):** form user không hiện thông báo lỗi inline khi username không khớp pattern — chỉ dựa vào native validation bubble của trình duyệt, dễ hiểu nhầm là nút "không phản ứng".

---

## NHÓM 7 — Đợt review sau khi chuẩn bị go-live (2026-07-25, ghi lại 2026-08-16)

> Nguồn: 5 commit `ff5dd7c`→`176a94a` (chưa push lên `origin` tại thời điểm ghi tài liệu). Tất cả đều đã fix kèm test regression; ghi lại ở đây để sổ rủi ro không bỏ sót lớp lỗi tương ứng.
>
> Ngoài ra, commit `bb850ee` (2026-07-20) làm mới giao diện — **không phải rủi ro**, nhưng có 1 thay đổi hành vi API cần biết: `GET /api/users/options` giờ **chỉ trả người có quyền duyệt** (`document:approve:*` hoặc `*`) thay vì mọi user active, vì lọc "Đã duyệt bởi" theo người không bao giờ duyệt là vô nghĩa. Kèm theo: component `DateInput` (lịch bấm chọn dùng chung cho bộ lọc/LEAVE/uỷ quyền) và bộ design token kiểu Material 3.

### [R33] ~~Người tạo tự duyệt được hồ sơ của chính mình (2 đường)~~
- **File:** `backend/src/lib/workflow.ts` — `matchesCurrentStep()` chỉ so vị trí trong luồng, không biết `document.creatorId`.
- **Nguy cơ (bảo mật, nghiêm trọng):** (1) **trực tiếp** — bước `DEPARTMENT` không đích danh ("bất kỳ thành viên phòng X") mà người tạo cũng thuộc phòng X → tự bấm Duyệt hồ sơ của mình; (2) **qua uỷ quyền 2 chiều** — `POST /api/delegations` không giới hạn quan hệ, nên người tạo có thể tự uỷ quyền cho người khác rồi để người đó "duyệt thay", bản chất vẫn là tự quyết hồ sơ của mình.
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-25 (commit `ff5dd7c`).** Chặn tại `isCurrentApprover()` (nơi biết danh tính người GỌI API thật): `user.id === document.creatorId` → false ngay, và loại `creatorId` khỏi danh sách delegators; `findActingDelegator()` loại tương tự để audit không ghi nhầm "duyệt thay bởi chính người tạo". Cố ý KHÔNG sửa trong `matchesCurrentStep` vì tham số ở đó có thể là delegator, không phải người thực hiện. **5 test regression** (`tests/documents.selfapprove.test.ts`): trực tiếp, qua uỷ quyền, chiều ngược lại, uỷ quyền hợp lệ giữa 2 người khác vẫn chạy, và không lan sang tầng uỷ quyền thứ 2.

### [R34] ~~Frontend nuốt lỗi tải dữ liệu — 9 trang hiện "rỗng" thay vì báo lỗi~~
- **File:** 9 trang trong `frontend/src/pages/` chỉ có `.then().finally()` mà không `.catch()`.
- **Nguy cơ:** lỗi mạng/500 khiến (a) danh sách hiện "chưa có gì" → người duyệt tưởng hết việc; (b) Dashboard trắng màn hình; (c) **nguy hiểm nhất** — form SỬA user/workflow hiện rỗng như form tạo mới, bấm Lưu là **ghi đè dữ liệu thật bằng rỗng**.
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-25 (commit `624a1de`).** Trang danh sách (Dashboard, DocumentList, RoleList, DepartmentList, WorkflowList, UserList, CreateDocument): thêm `.catch` + Alert/toast "Không tải được… Thử lại", **giữ nguyên dữ liệu cũ** thay vì xoá về rỗng. Form sửa (UserForm, WorkflowForm): **chặn hẳn form** khi tải lỗi, không hiện form rỗng. Kiểm chứng bằng Playwright giả lập 500 cho cả 9 trang.

### [R35] ~~`<label>` không gắn với control — screen reader bỏ qua tên trường ở mọi form~~
- **File:** `frontend/src/components/ui/Field.tsx` — `<label>` đứng cạnh `children`, không có `htmlFor` và không bọc control.
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-25 (commit `20d4e10`).** `Field` tự sinh id (`useId`) và inject `id` + `htmlFor` + `aria-describedby` + `aria-invalid` khi `children` là đúng 1 element (Input/Select/Textarea/DateInput); `DateInput` nhận thêm `id`/`aria-*` để nút mở lịch được gắn label đúng. Kiểm chứng bằng Playwright: đọc `label[for]` thật trong DOM ở AccountPage/LeaveForm, khớp đúng id từng control.

### [R36] ~~Lỗi sinh PDF bị nuốt im lặng — hồ sơ báo "đã duyệt" nhưng file không tồn tại~~
- **File:** `backend/src/lib/documentPdf.ts` — `generateLeavePdfAttachment` và `autoStampApprovedPdfs` bọc toàn thân trong `try/catch` chỉ `console.error`.
- **Nguy cơ:** API vẫn trả 200/201 "đã duyệt" trong khi PDF gốc/đã ký không được tạo; log server production không ai đọc → không ai phát hiện cho tới lúc cần file.
- **Trạng thái:** ✅ **ĐÃ FIX — 2026-07-25 (commit `dd22baa`).** Giữ đúng thiết kế (lỗi PDF **không** chặn nộp/duyệt) nhưng thêm audit `FILE_GENERATE_FAILED` để Admin thấy trong Nhật ký hệ thống; thread `req` qua 3 nơi gọi để audit ghi được actor/IP; thêm nhãn tiếng Việt cho action mới. Test: mock `fs.writeFileSync` throw → nộp đơn vẫn 201, có đúng 1 audit `FILE_GENERATE_FAILED` kèm nội dung lỗi.

---

## Bảng tóm tắt theo mức ưu tiên (cập nhật 2026-08-16 — rà trực tiếp trên code + git log)

### Còn mở

| Mã | Hạng mục | Mức độ | Ghi chú | Ưu tiên |
|---|---|---|---|---|
| R06 | HTTPS / Caddy | 🟠 High | 🔶 **Đã chuẩn bị sẵn** (`deploy/Caddyfile`, `DEPLOY.md`, code hỗ trợ same-origin WS) — chỉ còn chạy lệnh sudo tại máy, người dùng hiện không ở gần máy | **P1 — go-live** |
| R17 | systemd process manager | 🟠 High | 🔶 **Đã chuẩn bị sẵn** (`deploy/etool-backend.service`) — cùng cửa sổ thao tác với R06, xem `DEPLOY.md` | **P1 — go-live** |
| R18 | Test tự động (còn thiếu test frontend) | 🔵 Tech debt | Backend integration (**49 test / 9 file**) + CI đã có; còn thiếu test component/e2e frontend | **Một phần** |
| — | Form user: không có lỗi inline khi username sai pattern | 🔵 Nợ UX nhỏ | Chỉ dựa vào native validation bubble (`pattern` ở `UserFormPage.tsx`), dễ tưởng nút "không phản ứng" — xem ghi chú cuối R31 | **P4** |

### Đã fix (chi tiết + cách kiểm chứng ở từng mục phía trên)

| Mã | Hạng mục | Fix ở đâu / khi nào |
|---|---|---|
| R01 | Đổi `JWT_SECRET` | Giai đoạn 0 ACTION_PLAN, 2026-07-16 |
| R02 | Postgres password + bind localhost | Giai đoạn 0, 2026-07-16 |
| R03 | Guard seed production | Giai đoạn 0, 2026-07-16 |
| R04 | Rate limit login | Giai đoạn 0, 2026-07-16 |
| R05 | Helmet headers | Giai đoạn 0, 2026-07-16 |
| R07 | MIME magic bytes | Giai đoạn 0, 2026-07-16 |
| R08 | Bug logs thiếu entry vừa tạo | Bước 9, commit `01ae7f4` |
| R09 | Lọc `/pending` ở DB | Mục 3.2, 2026-07-17 — **một phần**, giới hạn ghi trong code |
| R10 | Pagination API | Mục 3.2, 2026-07-17 |
| R11 | Vô hiệu hoá user (`isActive`) | Giai đoạn 1, 2026-07-16 |
| R13 | Audit log quản trị user | Bước 12, 2026-07-16 + mở rộng các bước sau |
| R19 | Redis Pub/Sub cho WebSocket | **Chấp nhận có chủ đích**, 2026-07-18 — quy mô 30+ nhân viên, không kế hoạch đa instance |
| R15 | Backup DB + uploads tự động | Mục 3.4 + Bước 24A, 2026-07-17 |
| R21 | Xác nhận + ý kiến khi Duyệt | Bước 29, 2026-07-17 |
| R22 | Hiển thị `formData` trang chi tiết | Bước 29, 2026-07-17 |
| R23 | Hộp thông báo trong app (chuông + badge) | Bước 29, 2026-07-17 |
| R24 | Nhãn role tiếng Việt trên sidebar | Bước 29, 2026-07-17 |
| R25 | Ẩn card uỷ quyền/chữ ký với role không duyệt | Bước 29, 2026-07-17 |
| R26 | Stat card dashboard click được | Bước 29, 2026-07-17 |
| R27 | Toast nói rõ hành động | Bước 29, 2026-07-17 |
| R14 | Schema `formData` theo loại văn bản | Giai đoạn 5 mục 5.1, 2026-07-18 |
| R20 | Guard sửa Workflow khi có doc PENDING | Giai đoạn 5 mục 5.6, 2026-07-18 |
| R28 | `seed.ts` ghi đè dữ liệu thật khi chạy lại | Bước 36, 2026-07-18 — sự cố có thật, xem chi tiết ở mục |
| R16 | Health check DB ping | Bước 39, 2026-07-19 |
| R12 | WS reconnect logic | Bước 39, 2026-07-19 |
| R29 | Frontend tự tính toán (vi phạm Fat Server) | Bước 38, 2026-07-19 — API preview + hook debounce |
| R30 | Layout PAYMENT bó hẹp 520px | Bước 41, 2026-07-19 |
| R31 | Seed user `hr` 2 ký tự vi phạm usernameSchema | Bước 41, 2026-07-19 |
| R32 | Trang `/audit` hiện sai thông báo khi bị 403 | Bước 42, 2026-07-19 — `ForbiddenState` dùng chung + gate client `can(user,"audit:read")` |
| R33 | Người tạo tự duyệt hồ sơ của mình (trực tiếp + qua uỷ quyền) | 2026-07-25, commit `ff5dd7c` — **bảo mật**, 5 test regression |
| R34 | Frontend nuốt lỗi tải dữ liệu ở 9 trang | 2026-07-25, commit `624a1de` — nguy hiểm nhất: form sửa rỗng ghi đè dữ liệu thật |
| R35 | `<label>` không gắn control (a11y screen reader) | 2026-07-25, commit `20d4e10` — `Field` tự inject `id`/`htmlFor`/`aria-*` |
| R36 | Lỗi sinh PDF bị nuốt im lặng | 2026-07-25, commit `dd22baa` — thêm audit `FILE_GENERATE_FAILED` |
| — | Thu hồi/từ chối/yêu cầu sửa **không báo cho người đang chờ duyệt** | 2026-07-25, commit `176a94a` (Giai đoạn 6 — chi tiết ở `ACTION_PLAN.md` mục 6.2/6.3): `notify` dùng snapshot `document` (còn PENDING) thay vì `updated` |

> ✅ **2026-08-16:** đã push toàn bộ lên `origin/main` — đợt 2026-07-25 (`ff5dd7c`→`176a94a`: R33, R34, R35, R36, Giai đoạn 6) cùng bản cập nhật tài liệu này. Local và remote trùng khớp, không còn thay đổi tồn đọng.

---

## Điểm mạnh của hệ thống — đã làm đúng (giữ nguyên từ đánh giá trước, vẫn đúng)

- ✅ Kiến trúc **Fat Server / Thin Client** đúng theo `PLAN.md`.
- ✅ **JWT HttpOnly Cookie** — token không lộ ra JavaScript.
- ✅ **RBAC truy vấn DB realtime** mỗi request — không trust claim quyền hạn trong token.
- ✅ **Optimistic Concurrency Control** — race condition khi approve đã xử lý (`where: {currentStep, status}` → Prisma ném `P2025` thay vì ghi đè âm thầm).
- ✅ **Cross-department guard** — `Dept_Head` chỉ duyệt hồ sơ cùng phòng ban.
- ✅ **Orphan file cleanup** — file upload rollback được `fs.unlink` dọn dẹp khi transaction thất bại.
- ✅ Index trên các FK quan trọng (`roleId`, `departmentId`, và các FK khác theo migration `add_indexes`).
- ✅ **WebSocket authenticated** — `verifyClient` từ chối handshake trước khi upgrade nếu cookie không hợp lệ.
- ✅ `passwordHash` không bao giờ lộ ra response — `SAFE_CREATOR_SELECT`/`SAFE_USER_SELECT`/`toSafeUser()` áp dụng nhất quán toàn codebase.
- ✅ Prisma schema có `onDelete: Cascade`, quan hệ rõ ràng, dễ mở rộng.
