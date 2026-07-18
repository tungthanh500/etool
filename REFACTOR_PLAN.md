# REFACTOR_PLAN.md — Tối ưu cấu trúc backend (test trước, tách file sau)

> **Người thực thi dự kiến:** Claude Sonnet (reasoning high). Phương án viết để làm được TRỌN VẸN mà không phải đoán — mọi tên file, chữ ký hàm, lệnh kiểm chứng đều ghi rõ. Nếu thực tế code khác với mô tả ở đây (repo có thể đã thay đổi), **tin code, không tin tài liệu**, và ghi chú lại chỗ lệch.
>
> **Ngày lập:** 2026-07-18. HEAD lúc lập kế hoạch: `3dd5785` (main, đã push). Toàn bộ đường dẫn tính từ gốc repo `~/etool`.

## Bối cảnh & mục tiêu

Hệ thống e-Approval (backend Express/Prisma/PostgreSQL, frontend React/Vite) đã chạy được, đã test tay qua trình duyệt, **nhưng chưa có một file test tự động nào**. File `backend/src/routes/documents.ts` phình 1.075 dòng (gần 1/3 backend), trộn route handler + logic nghiệp vụ duyệt + logic sinh PDF. Lý do bước bị auto-skip đang lưu dạng chuỗi tiếng Việt trong `DocumentLog.comment` và bị regex-parse ngược ở nơi khác — nợ cấu trúc thật sự.

**3 giai đoạn, làm ĐÚNG THỨ TỰ** (test là lưới an toàn cho 2 giai đoạn sau):

| Giai đoạn | Nội dung | Kết quả |
|---|---|---|
| A | Bộ test integration API (vitest + supertest) | ~12 test phủ 5 action duyệt + auto-skip + guard |
| B | Tách `documents.ts` → `lib/documentPdf.ts` + `lib/documentActions.ts` | `documents.ts` < 500 dòng, KHÔNG đổi hành vi |
| C | Thêm cột `meta Json?` vào `DocumentLog`, hết regex-parse comment | Migration + sửa 4 điểm ghi/đọc |

**KHÔNG thuộc phạm vi:** shared types frontend/backend (để đợt sau), tách `DocumentDetailPage.tsx`, mọi thay đổi UI.

---

## Các sự thật về codebase PHẢI biết trước khi làm

Đây là những điều đã kiểm chứng trực tiếp trên code (2026-07-18) mà nếu không biết sẽ vấp:

1. **Không có dotenv import ở đâu cả.** `backend/src/index.ts` không load `.env`; script dev chỉ là `tsx watch src/index.ts`. Env hoạt động được là nhờ `@prisma/client` **tự động load `backend/.env`** khi được import (side effect: nạp luôn cả `JWT_SECRET`). Hệ quả cho test: dotenv của Prisma **không override** biến đã có sẵn trong `process.env` — vậy setup test chỉ cần set `process.env.DATABASE_URL` (và các biến khác) **TRƯỚC khi bất kỳ module nào import `@prisma/client`** là thắng.
2. **`src/index.ts` tạo app + `listen()` + `initWebSocket` + `initReminderJob` (node-cron) trong cùng một file.** Không thể supertest trực tiếp — phải tách `app.ts` (bước A1). `initReminderJob` tạo cron job sẽ giữ process test sống mãi nếu lỡ import.
3. **`lib/jwt.ts` ném lỗi ngay lúc import nếu thiếu `JWT_SECRET`** (hàm `requireEnv` chạy ở top-level). Setup test phải set biến này trước.
4. **`lib/prisma.ts` là singleton** (`global.__prisma`), khởi tạo lúc import đầu tiên — thêm một lý do env phải set trước mọi import.
5. **Login có rate limiter 10 lần/15 phút/IP** (`loginRateLimiter` trong `routes/auth.ts`). Test KHÔNG được đăng nhập qua API nhiều lần. Giải pháp: mint token trực tiếp bằng `signToken(userId)` từ `lib/jwt.ts` rồi set header `Cookie: eapproval_token=<token>` trong supertest. Tên cookie: `process.env.COOKIE_NAME || "eapproval_token"`.
6. **`UPLOAD_DIR` hardcode `path.join(__dirname, "..", "..", "uploads")`** trong `lib/upload.ts` — không đọc từ env. Test sinh PDF sẽ ghi file uuid vào `backend/uploads/` thật. Chấp nhận được (file nhỏ, tên uuid, không đè gì); KHÔNG sửa `UPLOAD_DIR` thành env trong đợt này để tránh phình phạm vi.
7. **Fonts cho PDF nghỉ phép** đọc bằng `readFileSync` lúc import `lib/leavePdf.ts` từ `backend/assets/fonts/DejaVuSans*.ttf` — đã tồn tại, không cần làm gì, chỉ cần biết import module này có side effect đọc file.
8. **Authorize theo permission string**, không theo tên role: `role.permissions: String[]`, wildcard `"*"` cho Admin. Fixtures test phải gán đúng permissions (xem A2).
9. **Optimistic concurrency:** update document luôn kèm `where: {id, currentStep, status}` — mismatch → Prisma ném `P2025` → error handler trong `index.ts` map thành **409**. Test race sẽ dựa vào đây.
10. **Thứ tự trong transaction là bất biến quan trọng:** `tx.documentLog.create()` PHẢI chạy trước `tx.document.update({include: {logs}})` (fix R08 — nếu đảo lại, response thiếu log vừa tạo). Khi tách file ở giai đoạn B, tuyệt đối giữ nguyên thứ tự này.
11. **Lỗi PDF không được chặn action chính:** `generateLeavePdfAttachment` và `autoStampApprovedPdfs` nuốt lỗi (try/catch + console.error). Giữ nguyên hợp đồng này khi di chuyển.
12. **`skipReasonText()` được gọi ở 3 chỗ** trong `documents.ts` (dòng ~222 tạo văn bản, ~778 approve, ~964 resubmit) — cả 3 chỗ này là điểm ghi `STEP_SKIPPED`, giai đoạn C phải sửa đủ cả 3.
13. Postgres chạy trong container `etool-postgres-1`, user `eapproval`. `backend/prisma/seed.ts` có guard chặn `NODE_ENV=production` — test KHÔNG dùng seed.ts, tự tạo fixtures.

---

## GIAI ĐOẠN A — Bộ test integration API

### A1. Tách `app.ts` khỏi `index.ts` (điều kiện để supertest được)

Tạo `backend/src/app.ts`: chuyển TOÀN BỘ phần tạo app từ `index.ts` sang — `const app = express()`, helmet, `express.json()`, cookieParser, 12 dòng `app.use("/api/...", ...)`, và **error handler cuối cùng** (khối `app.use((err, ...) => ...)` với AppError/MulterError/P2025). Kết thúc bằng `export default app;`.

`backend/src/index.ts` còn lại đúng phần side effect:

```ts
import app from "./app";
import { initWebSocket } from "./lib/ws";
import { initReminderJob } from "./lib/reminder";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const server = app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
initWebSocket(server);
initReminderJob();
```

Kiểm chứng A1: `cd backend && npx tsc --noEmit` sạch; chạy `npm run dev` rồi `curl http://localhost:4000/api/health` (hoặc login) vẫn hoạt động. Đây là refactor thuần cơ học — diff của `app.ts` phải là copy nguyên văn từ `index.ts`, không "tiện tay" sửa gì.

### A2. Hạ tầng test

**Cài đặt:** `cd backend && npm i -D vitest supertest @types/supertest`.

**Tạo test DB** (idempotent — bỏ qua lỗi nếu đã tồn tại):

```bash
docker exec etool-postgres-1 psql -U eapproval -d eapproval -c 'CREATE DATABASE eapproval_test' || true
```

**`backend/.env.test`** — copy `DATABASE_URL` từ `backend/.env` nhưng đổi tên DB cuối chuỗi thành `eapproval_test` (giữ nguyên password thật trong đó; file này thêm vào `.gitignore`, commit kèm một `.env.test.example` không chứa secret). Thêm `JWT_SECRET` (giá trị bất kỳ đủ dài cho test, KHÔNG copy secret thật), `NODE_ENV=test`.

**`backend/vitest.config.ts`:**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false, // các file test dùng chung 1 DB — chạy tuần tự
    testTimeout: 20000,     // có test sinh PDF thật
  },
});
```

**`backend/tests/setup.ts`** — chạy trước mỗi file test, TRƯỚC khi test file import bất kỳ module app nào:

```ts
import { config } from "dotenv";
import path from "node:path";
// override:true để thắng cả khi shell đã có sẵn DATABASE_URL trỏ DB thật
config({ path: path.join(__dirname, "..", ".env.test"), override: true });
if (!process.env.DATABASE_URL?.includes("eapproval_test")) {
  throw new Error("DATABASE_URL không trỏ vào eapproval_test — dừng để không phá DB thật");
}
```

(`dotenv` đã có sẵn transitively, nhưng thêm hẳn vào devDependencies cho tường minh: `npm i -D dotenv`.)

**Migrate test DB** — thêm script vào `backend/package.json`:

```json
"test:prepare": "dotenv -e .env.test -- prisma migrate deploy",
"test": "npm run test:prepare && vitest run"
```

(cần `npm i -D dotenv-cli` cho cú pháp `dotenv -e`; hoặc thay bằng `DATABASE_URL=$(grep ...) prisma migrate deploy` — chọn dotenv-cli cho sạch.)

**`backend/tests/helpers/fixtures.ts`** — tạo dữ liệu chuẩn cho mọi test:

- `resetDb()`: xoá sạch theo thứ tự FK (deleteMany: DocumentLog → Attachment → Document → WorkflowStep → Workflow → Delegation → Notification → PushSubscription → AuditLog → User → Department → Role). Gọi trong `beforeEach` của từng file test.
- `createFixtures()` trả về object gồm:
  - Roles: `Admin` (permissions `["*"]`), `Staff`, `Dept_Head`, `Director` — **đọc đúng danh sách permissions cho từng role từ `backend/prisma/seed.ts` hiện tại và copy nguyên văn** (đừng bịa; seed.ts là nguồn sự thật về permission strings).
  - Departments: `Phòng Kỹ thuật`, `Ban Giám đốc`.
  - Users (đủ trường bắt buộc theo model `User`, password hash bằng bcryptjs từ chuỗi cố định): `staff1` (Staff, Kỹ thuật), `depthead1` (Dept_Head, Kỹ thuật), `director1` (Director, Ban Giám đốc), `admin1` (Admin), `staff2` (Staff, Kỹ thuật — để test "không phải người duyệt").
  - Workflow `GENERAL` 2 bước theo model mới (`WorkflowStep.kind`): bước 1 `CREATOR_DEPT_HEAD`, bước 2 `DEPARTMENT` (departmentId = Ban Giám đốc, approverUserId = director1). Workflow `LEAVE` tương tự.
- `authCookie(userId)`: trả `["eapproval_token=" + signToken(userId)]` để `.set("Cookie", ...)`. Import `signToken` từ `../../src/lib/jwt` (an toàn vì setup.ts đã nạp env trước).

### A3. Các test case (2 file, ~12 test)

**`backend/tests/documents.actions.test.ts`** — file chính:

1. **Tạo văn bản GENERAL** (POST `/api/documents`, JSON không file): 201, `status=PENDING`, `currentStep=1`, log `SUBMIT`.
2. **Duyệt bước 1 đúng người** (depthead1): 200, `currentStep=2`, có log `APPROVE`, response.logs chứa log vừa tạo (bất biến R08).
3. **Duyệt bước cuối** (director1): 200, `status=APPROVED`. (GENERAL không có attachment PDF → autoStamp no-op — đã kiểm chứng hành vi này bằng tay trước đây.)
4. **Sai người duyệt** (staff2 duyệt bước 1): 403.
5. **Duyệt văn bản không ở PENDING** (duyệt lại doc đã APPROVED): 400.
6. **OCC 409:** tạo doc, duyệt bước 1 thành công, rồi giả lập request cũ bằng cách gọi thẳng `prisma.document.update({where: {id, currentStep: 1, status: "PENDING"}})` — expect Prisma ném P2025; HOẶC đơn giản hơn ở mức API: sau khi duyệt bước 1 xong, dùng lại chính endpoint approve với user bước 1 → giờ là 403/400. Chọn cách API-level; test P2025→409 riêng bằng cách duyệt đồng thời 2 lần bởi 2 approver hợp lệ của cùng bước nếu dựng được — nếu phức tạp quá thì chấp nhận bỏ test này, ghi chú lại.
7. **Reject** (depthead1, có comment bắt buộc): 200 `status=REJECTED`; thiếu comment → 400.
8. **Request-change → resubmit:** request-change bởi depthead1 → `CHANGE_REQUESTED`; resubmit bởi staff1 (đúng creator) → `PENDING`, `currentStep` quay về bước thật đầu tiên; resubmit bởi staff2 → 403.
9. **Withdraw** bởi creator khi PENDING chưa ai duyệt: 200; sau khi đã có người duyệt: 400 (đọc handler withdraw hiện tại để khớp điều kiện chính xác trước khi viết assert).
10. **Auto-skip ONLY_CREATOR:** depthead1 tự tạo văn bản GENERAL (workflow bước 1 = CREATOR_DEPT_HEAD — người duyệt duy nhất là chính mình) → bước 1 bị skip ngay lúc tạo, `currentStep=2`, có log `STEP_SKIPPED` với comment bắt đầu `"Bỏ qua bước 1"`.
11. **Auto-skip EMPTY:** tạo workflow có bước trỏ vào department không có user active nào → bước bị skip với lý do EMPTY.
12. **LEAVE tự sinh PDF:** staff1 tạo doc LEAVE (formData hợp lệ theo schema trong `lib/documentForms.ts`: `tuNgay`, `denNgay`, `soNgay`, `loaiNghi`, `lyDo`) → 201 và tồn tại Attachment `kind="ORIGINAL"` mimeType pdf; duyệt hết chuỗi → xuất hiện thêm Attachment `kind="APPROVED"`. Đây là test chậm nhất (sinh PDF thật, ghi `backend/uploads/`).

**`backend/tests/workflows.guard.test.ts`:**

13. **R20 guard:** tạo doc PENDING trên workflow X → `PATCH /api/workflows/:id` (admin1) → bị chặn (đọc `routes/workflows.ts` để lấy đúng status code + message hiện tại, khớp assert theo đó); sau khi doc chuyển APPROVED → PATCH thành công.

**Nguyên tắc viết assert:** đọc handler thật trước khi viết từng expect — status code và message tiếng Việt phải khớp code hiện tại, KHÔNG khớp theo tài liệu này nếu có lệch.

Kiểm chứng A: `cd backend && npm test` — toàn bộ pass, chạy lại lần 2 vẫn pass (chứng minh resetDb đúng).

**Commit A** (2 commit: "A1 tách app.ts" và "A2-A3 bộ test integration").

---

## GIAI ĐOẠN B — Tách `documents.ts` (chỉ sau khi A xanh)

Quy tắc chung cho cả B1, B2: **thuần di chuyển code (mechanical move), không đổi một dòng logic, không "nhân tiện" đổi tên biến/format**. Sau mỗi bước: `npx tsc --noEmit` + `npm test` phải xanh y nguyên. Nếu một test đỏ sau khi tách → lỗi nằm ở việc tách, sửa việc tách chứ không sửa test.

### B1. `backend/src/lib/documentPdf.ts`

Chuyển 2 hàm từ `documents.ts` sang (kèm nguyên comment tiếng Việt của chúng):

- `generateLeavePdfAttachment(document, kind)` — giữ nguyên chữ ký.
- `autoStampApprovedPdfs(req, document)` — giữ nguyên chữ ký (tham số `req` chỉ dùng cho `audit()`; giữ nguyên, không tối ưu vội).

Mang theo các import chỉ 2 hàm này dùng: `buildLeavePdf`/`buildLeaveStepRows` (leavePdf), `stampApprovedPdf`/`ApproverInfo` (stamp), `UPLOAD_DIR`, `audit`, `prisma`, `fs`, `path`, `crypto`. Trong `documents.ts` thay bằng `import { generateLeavePdfAttachment, autoStampApprovedPdfs } from "../lib/documentPdf";` và dọn các import không còn dùng (tsc sẽ không báo unused import — dùng mắt hoặc eslint; tối thiểu kiểm tra `stamp`/`leavePdf` không còn được import ở `documents.ts`).

### B2. `backend/src/lib/documentActions.ts`

**Chống over-engineering — đây là chỉ dẫn quan trọng nhất giai đoạn B:** KHÔNG xây pipeline/abstraction tổng quát cho 5 action. Chỉ làm "route mỏng, action dày":

- Chuyển sang `documentActions.ts`: `loadDocumentForAction`, `skipReasonText`, và phần THÂN của 5 handler thành 5 hàm export:
  - `approveDocument(user, documentId, comment, approvedFile | undefined)` → trả `{document, canApprove}` hoặc ném `AppError`
  - `rejectDocument(user, documentId, comment)`
  - `requestChangeDocument(user, documentId, comment)`
  - `resubmitDocument(user, documentId, body)`
  - `withdrawDocument(user, documentId)`
- Route handler trong `documents.ts` còn lại: parse/validate schema từ `req.body`, gọi hàm action, `res.json(...)`, và riêng approve giữ lại khối `catch` dọn file mồ côi (`fs.unlink(approvedFile.path)`) ở tầng route vì nó gắn với multer.
- `notify(...)` + `audit(...)` đi theo vào trong hàm action (chúng là nghiệp vụ, không phải HTTP). Tham số `req` của `audit({req, ...})`: xem chữ ký `audit` trong `lib/audit.ts` — nếu nó cần `req` để lấy IP thì cho phép truyền `req` xuyên qua hàm action (chấp nhận phụ thuộc này, ghi chú lại; KHÔNG refactor audit trong đợt này).
- Hai bất biến phải giữ nguyên khi di chuyển: (a) log-create trước document-update trong transaction (sự thật #10); (b) `where: {id, currentStep, status}` trong update (sự thật #9).

Đích: `documents.ts` còn < 500 dòng (routes + parse + GET list/detail/export giữ nguyên tại chỗ — KHÔNG di chuyển các GET).

Kiểm chứng B: tsc sạch + `npm test` xanh + smoke tay 1 vòng duyệt trên trình duyệt (login → tạo → duyệt 2 bước → thấy APPROVED). **Commit B** (2 commit: B1, B2).

---

## GIAI ĐOẠN C — `DocumentLog.meta Json?` (chỉ sau khi B xanh)

### C1. Schema + migration

Trong `backend/prisma/schema.prisma`, model `DocumentLog` thêm:

```prisma
meta Json? // STEP_SKIPPED: { skippedStepOrder: number, reason: "EMPTY" | "ONLY_CREATOR" }
```

Chạy `npx prisma migrate dev --name add_document_log_meta` (DB dev). Migration chỉ ADD COLUMN nullable — không đụng dữ liệu cũ.

### C2. Điểm ghi (3 chỗ — sự thật #12)

Tại cả 3 chỗ tạo log `STEP_SKIPPED` (tạo văn bản / approve / resubmit — sau B2 chúng đều nằm trong `documentActions.ts`), thêm vào `data`:

```ts
meta: { skippedStepOrder: s.stepOrder, reason: s.reason },
```

Giữ nguyên `comment: skipReasonText(...)` — comment giờ chỉ để hiển thị timeline, không còn là nguồn dữ liệu.

### C3. Điểm đọc

`backend/src/lib/leavePdf.ts`:

- Type `LogWithUser`: thêm `meta` vào Pick (`Pick<DocumentLog, "action" | "comment" | "createdAt" | "meta">`).
- Trong `buildLeaveStepRows`, sửa cách tính `skippedOrders`: đọc `log.meta?.skippedStepOrder` (ép kiểu qua zod hoặc kiểm tra `typeof === "number"`) **trước**, fallback về `extractSkippedStepOrder(log.comment)` cho log cũ ghi trước migration. Giữ hàm regex làm fallback, thêm comment giải thích nó chỉ phục vụ dữ liệu lịch sử.
- Kiểm tra nơi gọi `buildLeaveStepRows` (trong `documentPdf.ts` sau B1): query `documentLog.findMany` phải select được `meta` (mặc định Prisma trả mọi scalar — dùng `include` chứ không `select` thì tự có; xác nhận lại).

Rà thêm toàn repo: `grep -rn "Bỏ qua bước" backend/src frontend/src` — nếu frontend có parse chuỗi này ở đâu (ngoài hiển thị nguyên văn) thì xử lý tương tự; theo khảo sát 2026-07-18 thì frontend chỉ hiển thị nguyên văn comment, không parse.

### C4. Test bổ sung

Trong test auto-skip (case 10, 11): assert thêm `log.meta` đúng `{skippedStepOrder, reason}`. Thêm 1 unit test nhỏ cho `buildLeaveStepRows`: log có `meta` → dùng meta; log `meta=null` comment `"Bỏ qua bước 2 — ..."` → fallback regex vẫn nhận ra bước 2.

Kiểm chứng C: tsc sạch + `npm test` xanh + smoke tay: tạo LEAVE có bước bị skip, mở PDF sinh ra, khu PHẦN PHÊ DUYỆT hiển thị "(Bỏ qua — không cần duyệt)" đúng cột. **Commit C** (1 commit, gồm cả migration).

---

## Hoàn tất

1. `cd backend && npx tsc --noEmit && npm test` — xanh toàn bộ.
2. `cd frontend && npx tsc --noEmit` — xác nhận không vô tình đụng frontend.
3. Push toàn bộ lên `origin/main`.
4. Cập nhật `EXISTING-BUG.md`: thêm ghi chú vào R08/R20 rằng đã có test tự động bảo vệ; cân nhắc thêm mục mới ghi nhận "đã có bộ test integration".
5. Cập nhật `IMPLEMENTATION_PLAN.md` nếu đang theo dõi tiến độ ở đó.

## Bẫy đã biết — đọc lại lần cuối trước khi bắt đầu

- **Đừng để test chạy vào DB thật.** Guard trong `tests/setup.ts` (throw nếu URL không chứa `eapproval_test`) là bắt buộc, viết đầu tiên.
- **Đừng import `src/index.ts` trong test** — nó `listen()` + cron. Chỉ import `src/app.ts`.
- **Đừng login qua API trong test** (rate limit 10/15min) — mint token bằng `signToken`.
- **Đừng sửa logic khi di chuyển code** ở giai đoạn B — kể cả chỗ "nhìn thấy rõ là xấu". Ghi chú lại để đợt sau.
- **Đừng đổi/xoá chuỗi comment `"Bỏ qua bước N — ..."`** ở giai đoạn C — dữ liệu cũ và fallback regex phụ thuộc nó.
- Message lỗi tiếng Việt trong assert: copy từ code, không gõ lại theo trí nhớ (dễ lệch dấu).
