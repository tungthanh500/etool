# Kế hoạch triển khai e-Approval Workflow — Bước 1: Khởi tạo dự án & Database

> ✅ **TRẠNG THÁI: Bước 1 đã hoàn thành và kiểm thử (2026-07-15).** Xem mục "Kết quả thực thi" ở cuối file để biết chi tiết những gì đã làm, phát sinh thực tế so với kế hoạch, và bước tiếp theo.

## Context
`PLAN.md` là bản thiết kế hệ thống (tổng quan, ranh giới kiến trúc Thin Client/Fat Server, và Prisma schema) — không phải danh sách các bước triển khai đã đánh số sẵn. Thư mục làm việc hiện đang trống (không phải git repo). Người dùng yêu cầu triển khai tuần tự, bắt đầu từ bước 1, nên cần tự chia lộ trình MVP thành các bước thực thi cụ thể và bắt đầu với bước nền tảng nhất: khởi tạo cấu trúc dự án + database schema.

Người dùng đã chốt các lựa chọn kỹ thuật:
- Backend: **Express + TypeScript**
- Postgres: **Docker Compose** (không cài trực tiếp lên server)
- Cấu trúc: **Monorepo 2 thư mục** `/backend` và `/frontend`, mỗi bên có `package.json` riêng (không dùng npm workspaces)

## Lộ trình tổng thể (để tham chiếu, chỉ thực thi Bước 1 trong lượt này)
1. **Khởi tạo dự án & Database** (bước này)
2. Xác thực JWT HTTP-Only Cookie + middleware phân quyền RBAC
3. Module Văn bản/Yêu cầu (CRUD + JSONB formData + upload file .docx/.pdf → UUID)
4. Workflow Engine (định nghĩa bước duyệt, approve/reject/request-change, tính bước kế tiếp)
5. Comment & Logs (thảo luận trên hồ sơ, timeline)
6. Thông báo realtime (WebSocket) & Web Push

## Bước 1 — Chi tiết công việc

### 1. Cấu trúc thư mục gốc
```
/etool
  /backend
  /frontend
  docker-compose.yml
  .gitignore
```
- Chạy `git init` tại gốc repo (hiện chưa là git repo).
- `.gitignore` gốc: `node_modules/`, `dist/`, `.env`, `uploads/`, `*.log`.

### 2. Docker Compose cho PostgreSQL
`docker-compose.yml` ở gốc: service `postgres` (image `postgres:16-alpine`), map cổng `5432`, volume đặt tên để dữ liệu bền vững, biến môi trường `POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB` đọc từ `.env` (có `.env.example` mẫu).

### 3. Backend scaffold (`/backend`)
- `npm init` + TypeScript (`typescript`, `@types/node`, `tsx` cho dev reload).
- Express + `@types/express`, cấu trúc thư mục:
  ```
  backend/
    src/
      index.ts        # bootstrap Express app
      routes/health.ts
    prisma/
      schema.prisma    # đúng theo Section 3 của PLAN.md
      seed.ts           # seed Role + Department cơ bản
    .env.example        # DATABASE_URL, PORT, JWT_SECRET, COOKIE_NAME
    package.json         # scripts: dev, build, start, prisma:generate, prisma:migrate, prisma:seed
    tsconfig.json
  ```
- `prisma/schema.prisma`: copy nguyên schema trong PLAN.md (User, Role, Department, Document, Attachment, Workflow, WorkflowStep, DocumentLog) — đây là nguồn chuẩn hóa toàn vẹn dữ liệu, không chỉnh sửa logic nghiệp vụ ở bước này.
- `prisma/seed.ts`: seed 4 Role (`Staff`, `Dept_Head`, `Director`, `Accountant`) và 1-2 Department mẫu — dữ liệu tra cứu nền tảng cần có trước khi làm auth/workflow ở bước sau. Không seed User/Workflow (sẽ làm ở Bước 2/4 khi có logic tương ứng).
- `src/index.ts`: Express app tối giản, route `GET /api/health` trả JSON `{status: "ok"}` — chỉ để xác nhận server chạy được, chưa có business logic (đúng nguyên tắc Fat Server sẽ được xây dần ở các bước sau).

### 4. Frontend scaffold (`/frontend`)
- Khởi tạo bằng Vite template `react-ts`.
- Cấu hình `vite.config.ts` proxy `/api` → `http://localhost:<BACKEND_PORT>` để chuẩn bị cho gọi API thật ở các bước sau.
- Giữ nguyên trang mặc định tối giản (chưa xây UI nghiệp vụ) — đúng tinh thần "Thin Client" của thiết kế, UI thực sự sẽ được xây khi có API tương ứng ở các bước sau.

### 5. Migration
- Chạy `npx prisma migrate dev --name init` trong `/backend` để tạo migration đầu tiên và áp dụng lên Postgres đang chạy trong Docker.
- Chạy seed (`npx prisma db seed` hoặc script `prisma:seed`).

## Kiểm thử / Verification
- `docker compose up -d postgres` → `docker compose ps` container `postgres` ở trạng thái `running`/`healthy`.
- `cd backend && npx prisma migrate dev --name init` chạy thành công, tạo đủ 7 bảng theo schema.
- `npx prisma db seed` chạy thành công, không lỗi.
- `npm run dev` (backend) → `curl http://localhost:<PORT>/api/health` trả về `{"status":"ok"}`.
- `npm run build` (frontend) compile không lỗi TypeScript; `npm run dev` khởi động Vite dev server thành công.

## Lưu ý
- Sau khi Bước 1 hoàn tất và được xác nhận, các bước 2-6 (auth, document module, workflow engine, comment/logs, realtime) sẽ được lên kế hoạch và triển khai riêng ở các lượt tiếp theo.

---

## Kết quả thực thi (2026-07-15)

### Những gì đã tạo ra thực tế
- Git repo khởi tạo tại gốc (`git init`, branch mặc định `master`, **chưa commit** — chỉ `git add -A` để rà soát, chờ người dùng yêu cầu mới commit).
- `.gitignore`, `.env.example` ở gốc; `docker-compose.yml` với service `postgres` (image `postgres:16-alpine`), volume `postgres_data`, healthcheck `pg_isready`.
- `/backend`: Express + TypeScript + Prisma đúng theo thiết kế mục 3.
  - `prisma/schema.prisma`: copy nguyên schema từ `PLAN.md` (7 model: User, Role, Department, Document, Attachment, Workflow, WorkflowStep, DocumentLog).
  - `prisma/seed.ts`: seed 4 Role (`Staff`, `Dept_Head`, `Director`, `Accountant`) + 2 Department (`Ban Giám đốc`, `Phòng Hành chính - Kế toán`).
  - `src/index.ts` + `src/routes/health.ts`: route `GET /api/health`.
  - `backend/.env.example`: `DATABASE_URL`, `PORT=4000`, `JWT_SECRET`, `COOKIE_NAME`.
  - Migration đầu tiên: `prisma/migrations/20260715155438_init/`.
- `/frontend`: scaffold bằng `npm create vite@latest -- --template react-ts`, cấu hình `vite.config.ts` proxy `/api` → `http://localhost:4000`.

### Phát sinh thực tế so với kế hoạch ban đầu
Môi trường Ubuntu Server ban đầu **chưa có Node.js/npm/Docker** sẵn trong PATH của shell không tương tác, và không có sudo không-mật-khẩu:
- **Node.js**: có sẵn qua `nvm` (v26.5.0) nhưng không tự load trong shell non-interactive → mọi lệnh `node`/`npm`/`npx` phải chạy sau khi `source "$HOME/.nvm/nvm.sh"`.
- **Docker**: chưa cài. Đã hỏi người dùng và người dùng tự chạy lệnh cài Docker Engine + Compose plugin (có sudo) trong terminal riêng.
- **Nhóm `docker`**: sau khi cài, user được thêm vào group `docker` nhưng phiên shell hiện tại của Claude Code chưa refresh group membership (không đăng nhập lại được) → mọi lệnh Docker phải chạy qua `sg docker -c "docker ..."` thay vì gọi `docker` trực tiếp.
- **npm install scripts**: npm 11 chặn install script của `@prisma/client`, `prisma`, `@prisma/engines`, `esbuild` theo mặc định (`allowScripts`) — đã chạy `npx prisma generate` trực tiếp để xác nhận Prisma Client vẫn generate đúng dù cờ này chưa "approve" hẳn qua `npm approve-scripts`.

Các quyết định kỹ thuật khác (Express, Docker Compose, monorepo 2 thư mục) giữ nguyên như kế hoạch, không đổi.

### Kết quả kiểm thử
- `sg docker -c "docker compose up -d postgres"` → container `etool-postgres-1` ở trạng thái `Up ... (healthy)`.
- `npx prisma migrate dev --name init` chạy thành công, tạo đủ 7 bảng.
- `npx prisma db seed` chạy thành công; xác nhận qua `psql`: 4 Role + 2 Department đúng như seed.
- Backend: `npm run dev` rồi `curl http://localhost:4000/api/health` → `{"status":"ok"}`; đã dừng server sau khi xác nhận (không để chạy nền).
- Frontend: `npm run build` compile sạch, không lỗi TypeScript.

### Bước tiếp theo
Bước 2 (Xác thực JWT HTTP-Only Cookie + middleware phân quyền RBAC) chưa bắt đầu — sẽ lên kế hoạch riêng khi được yêu cầu tiếp tục.

---

# Bước 2 — Xác thực JWT HTTP-Only Cookie + Middleware RBAC

## Context
Đã khảo sát lại `/home/tung/etool/backend` (qua Explore agent): mới chỉ có Express app tối giản (`src/index.ts`, `src/routes/health.ts`) và Prisma schema/migration đầy đủ. **Chưa có bất kỳ code auth/jwt/cookie/bcrypt nào**, chưa cài các gói liên quan. `.env`/`.env.example` đã có sẵn `JWT_SECRET` và `COOKIE_NAME` (chuẩn bị trước ở Bước 1) nhưng chưa được dùng. `prisma/seed.ts` mới seed Role + Department, chưa có User nào để test login.

Mục tiêu Bước 2: hiện thực hoá đúng bảng phân chia nhiệm vụ ở mục 2 của `PLAN.md` — Backend (Fat Server) xác thực bằng JWT nhúng vào `Set-Cookie` (`HttpOnly`, `SameSite=Strict`), và **mọi kiểm tra quyền phải truy vấn DB tại thời điểm request** (không tin tưởng claim quyền hạn nhúng sẵn trong token) — đúng nguyên văn PLAN.md mục 2: *"Giải mã Cookie để định danh User. Truy vấn Database để xác minh User có đủ quyền ở bước hiện tại không."* Vì vậy JWT chỉ mang `userId`, mọi thông tin role/permissions được middleware load lại từ Postgres mỗi request.

### Quyết định kỹ thuật (mặc định hợp lý, không cần hỏi lại)
- **Hash mật khẩu: `bcryptjs`** (pure JS) thay vì `bcrypt` native — tránh rủi ro cần `node-gyp`/build tool (python3, g++) mà môi trường server hiện chưa xác nhận có sẵn, từng gặp vướng mắc install-script ở Bước 1.
- **JWT**: thư viện `jsonwebtoken`, payload tối giản `{ sub: userId }`, hết hạn sau `8h` (một ca làm việc), ký bằng `JWT_SECRET` đã có sẵn trong `.env`.
- **Cookie**: `httpOnly: true`, `sameSite: "strict"`, `secure: NODE_ENV === "production"`, `maxAge` khớp thời hạn JWT, tên cookie lấy từ `COOKIE_NAME` đã có sẵn.
- **Không cần CORS/helmet ở bước này**: frontend Vite dev server proxy `/api` → backend (đã cấu hình Bước 1) nên request luôn same-origin từ góc nhìn trình duyệt, cookie hoạt động bình thường không cần CORS. Có thể bổ sung `helmet` như một bước hardening riêng sau này, không thuộc phạm vi Bước 2.
- **Validation input**: dùng `zod` cho body `POST /auth/login`.

## Kế hoạch triển khai

### 1. Cài dependencies mới trong `/backend`
`jsonwebtoken`, `bcryptjs`, `cookie-parser`, `zod` + `@types/jsonwebtoken`, `@types/bcryptjs`, `@types/cookie-parser` (devDependencies).

### 2. Cấu trúc file mới
```
backend/src/
  lib/
    prisma.ts          # PrismaClient singleton (tránh multi-instance khi tsx watch reload)
    password.ts         # hashPassword(), comparePassword() dùng bcryptjs
    jwt.ts               # signToken(userId), verifyToken(token) dùng jsonwebtoken
  middlewares/
    authenticate.ts      # đọc cookie -> verify JWT -> query User (kèm role, department) từ Prisma -> gắn vào req.user; 401 nếu thiếu/hết hạn/không tồn tại user
    authorize.ts          # authorize(permission: string) -> kiểm tra req.user.role.permissions.includes(permission); 403 nếu thiếu quyền
  types/
    express.d.ts          # augment Express.Request thêm field `user`
  routes/
    auth.ts                # POST /login, POST /logout, GET /me
    documents.ts            # stub GET / (authenticate + authorize("document:read:own")) trả [] — điểm neo để Bước 3 mở rộng thành CRUD thật, đồng thời dùng để kiểm thử middleware authorize ở bước này
  index.ts                  # thêm cookie-parser(), mount /api/auth, /api/documents, error handler tối giản
```

### 3. `src/routes/auth.ts`
- `POST /api/auth/login`: validate body bằng zod (`email`, `password`) → tìm `User` theo email (kèm `role`, `department`) → so khớp `passwordHash` bằng `comparePassword` → nếu sai, trả `401` thông điệp chung chung (không tiết lộ email hay sai ở đâu) → nếu đúng, `signToken(user.id)`, set cookie, trả về JSON user đã lược field nhạy cảm (không trả `passwordHash`) kèm `role.name`, `role.permissions`, `department.name`.
- `POST /api/auth/logout`: `res.clearCookie(...)` với cùng options đã dùng khi set, trả `204`.
- `GET /api/auth/me`: yêu cầu `authenticate`, trả lại thông tin user hiện tại (không có `passwordHash`).

### 4. `prisma/seed.ts` — bổ sung seed User mẫu
Thêm 4 user test (1 user/role), mật khẩu dev mặc định giống nhau (vd. `ChangeMe123!`, hash bằng `bcryptjs` ngay trong seed script), gán `departmentId` vào department đã seed sẵn. Dùng `upsert` theo `email` để seed idempotent (an toàn khi chạy lại trên DB đã có dữ liệu, không tạo trùng).

### 5. `src/index.ts`
Thêm `cookie-parser` middleware, mount `authRouter` tại `/api/auth`, mount `documentsRouter` (stub) tại `/api/documents`, thêm error-handling middleware tối giản (bắt lỗi ném từ route, trả JSON `{ error: message }` với status code phù hợp thay vì để Express trả HTML mặc định).

## Kiểm thử / Verification
1. `npx tsc --noEmit` — type-check sạch.
2. `npm run prisma:seed` (chạy lại, idempotent) → xác nhận qua `psql` có đủ 4 user với email tương ứng từng role.
3. `npm run dev`, dùng `curl` với cookie jar:
   - `POST /api/auth/login` sai mật khẩu → `401`.
   - `POST /api/auth/login` đúng (vd. user role `Staff`) → `200`, có `Set-Cookie` `httpOnly`; response JSON không chứa `passwordHash`.
   - `GET /api/auth/me` kèm cookie vừa nhận → `200`, đúng thông tin user.
   - `GET /api/auth/me` **không** kèm cookie → `401`.
   - `GET /api/documents` kèm cookie user `Staff` (có quyền `document:read:own`) → `200`, `[]`.
   - `GET /api/documents` kèm cookie user `Dept_Head` (không có quyền `document:read:own`) → `403`.
   - `POST /api/auth/logout` kèm cookie → cookie bị xoá; gọi lại `GET /api/auth/me` bằng cookie cũ → `401`.
4. Dừng backend dev server sau khi xác nhận xong (không để chạy nền), giữ Postgres container tiếp tục chạy cho Bước 3.

## Lưu ý
- Frontend **chưa** có màn hình login ở bước này — theo đúng ranh giới "Thin Client", UI đăng nhập sẽ được xây khi có nhu cầu tích hợp thực tế (có thể gộp vào Bước 3 khi làm màn hình danh sách văn bản, hoặc làm riêng nếu người dùng yêu cầu).
- Route `GET /api/documents` chỉ là stub xác minh middleware `authorize`, sẽ được thay bằng CRUD thật ở Bước 3.

---

## Kết quả thực thi Bước 2 (2026-07-15)

> ✅ **TRẠNG THÁI: Bước 2 đã hoàn thành và kiểm thử.**

### Những gì đã tạo ra thực tế
- Cài mới trong `/backend`: `jsonwebtoken`, `bcryptjs`, `cookie-parser`, `zod` (dependencies) + `@types/jsonwebtoken`, `@types/cookie-parser` (devDependencies). `bcryptjs` tự bundle type definitions nên không cần `@types/bcryptjs` riêng.
- `src/lib/prisma.ts`: PrismaClient singleton (cache qua `global.__prisma`, tránh multi-instance khi `tsx watch` reload).
- `src/lib/password.ts`: `hashPassword`/`comparePassword` dùng `bcryptjs`.
- `src/lib/jwt.ts`: `signToken`/`verifyToken`; dùng helper `requireEnv()` để đọc `JWT_SECRET` (bắt buộc, throw nếu thiếu) và `JWT_EXPIRES_IN` (mặc định `8h`).
- `src/types/express.d.ts`: augment `Express.Request.user` thành `User & { role: Role; department: Department }`.
- `src/middlewares/authenticate.ts`: đọc cookie theo `COOKIE_NAME`, verify JWT, query lại `User` (kèm `role`, `department`) từ Postgres qua Prisma mỗi request — đúng nguyên tắc Fat Server không tin token claims.
- `src/middlewares/authorize.ts`: `authorize(permission)` kiểm tra `req.user.role.permissions`.
- `src/routes/auth.ts`: `POST /login` (zod validate, bcrypt compare, set cookie `httpOnly/sameSite=strict/secure theo NODE_ENV`), `POST /logout` (clearCookie cùng options), `GET /me` (yêu cầu `authenticate`). Response luôn loại bỏ `passwordHash` qua `toSafeUser()`.
- `src/routes/documents.ts`: stub `GET /` yêu cầu `authenticate` + `authorize("document:read:own")`, trả `[]`.
- `src/index.ts`: thêm `cookie-parser`, mount `/api/auth`, `/api/documents`, error-handling middleware trả JSON thay vì HTML mặc định của Express.
- `prisma/seed.ts`: thêm seed 4 user test (1 user/role: `staff@example.com`, `depthead@example.com`, `director@example.com`, `accountant@example.com`), mật khẩu dev dùng chung `ChangeMe123!` (hash bằng bcryptjs), `upsert` theo email nên seed idempotent.
- `.env` / `.env.example` (backend): thêm `NODE_ENV=development`, `JWT_EXPIRES_IN="8h"`.

### Phát sinh / điều chỉnh so với kế hoạch
- `src/lib/jwt.ts`: TypeScript strict mode không tự narrow `JWT_SECRET` từ `string | undefined` sang `string` khi biến module-level được dùng trong hàm export riêng (dù đã `if (!JWT_SECRET) throw`) → phải đổi sang hàm `requireEnv(name)` trả kiểu `string` tường minh để `tsc --noEmit` pass sạch. Không đổi hành vi runtime, chỉ đổi cách viết để thoả type-checker.
- Các quyết định kỹ thuật khác (bcryptjs, JWT payload tối giản `{sub}`, cookie 8h, không CORS/helmet) giữ nguyên như kế hoạch.

### Kết quả kiểm thử (toàn bộ PASS)
- `npx tsc --noEmit` sạch sau khi sửa `jwt.ts`.
- `npx prisma db seed` chạy lại thành công (idempotent), xác nhận 4 user qua `psql`.
- `curl` end-to-end (dùng cookie jar riêng cho từng user):
  - Login sai mật khẩu → `401`.
  - Login đúng (`staff`) → `200`, `Set-Cookie` có `HttpOnly; SameSite=Strict`; body JSON không chứa `passwordHash`.
  - `GET /me` kèm cookie → `200` đúng thông tin; không cookie → `401 {"error":"Chưa đăng nhập"}`.
  - `GET /documents` với cookie `staff` (có `document:read:own`) → `200 []`.
  - `GET /documents` với cookie `depthead` (không có quyền đó) → `403 {"error":"Không đủ quyền thực hiện thao tác này"}` — xác nhận middleware `authorize` hoạt động đúng, RBAC truy vấn DB theo thời gian thực.
  - `POST /logout` → `204`, cookie bị clear; gọi lại `/me` bằng cookie cũ → `401` — xác nhận session bị vô hiệu hoá ngay sau logout.
- Đã dừng backend dev server sau khi test xong; Postgres container (`etool-postgres-1`) vẫn giữ `Up ... (healthy)` cho Bước 3.

### Bước tiếp theo
Bước 3 (Module Văn bản/Yêu cầu — CRUD, JSONB `formData`, upload `.docx`/`.pdf` → UUID) chưa bắt đầu, sẽ lên kế hoạch riêng khi được yêu cầu tiếp tục. Route `GET /api/documents` hiện là stub, cần thay bằng CRUD thật ở bước này. Cũng là lúc phù hợp để cân nhắc xây màn hình login ở frontend nếu muốn có UI thử nghiệm end-to-end.

---

# Bước 3 — Module Văn bản/Yêu cầu (Tạo, Xem, Upload file)

## Context
`src/routes/documents.ts` hiện chỉ là stub `GET /` trả `[]` (tạo ở Bước 2 để xác minh middleware). Backend đã có sẵn `authenticate`/`authorize`, Prisma schema đầy đủ (Document, Attachment, Workflow, WorkflowStep, DocumentLog), 4 user test theo 4 role.

**Phát hiện một ràng buộc quan trọng khi lên kế hoạch:** `Document.workflowId` là khóa ngoại **bắt buộc** (`NOT NULL`) tới `Workflow`. Workflow Engine thật sự (định nghĩa quy trình động, chuyển bước duyệt) là phạm vi Bước 4 — nhưng nếu không có ít nhất một bản ghi `Workflow`/`WorkflowStep` nào, Bước 3 **không thể tạo được Document nào cả** (vi phạm FK ngay từ INSERT đầu tiên). Vì vậy Bước 3 sẽ seed sẵn dữ liệu quy trình duyệt tối thiểu (khai báo tĩnh, không phải logic engine) để Document có `workflowId` hợp lệ; việc *thực thi* chuyển bước (approve/reject/tính bước kế tiếp) vẫn để dành cho Bước 4.

**Điều chỉnh phạm vi so với roadmap ban đầu:** roadmap ở đầu file ghi Bước 3 là "CRUD" — sau khi thiết kế chi tiết, quyết định thu hẹp còn **Create + Read (list/detail) + Upload file**, chưa làm Update/Delete. Lý do: với model trạng thái `DRAFT/PENDING/APPROVED/REJECTED/CHANGES_REQUESTED`, việc "sửa văn bản" có ý nghĩa nghiệp vụ rõ ràng nhất khi gắn với luồng `CHANGES_REQUESTED` (người duyệt yêu cầu chỉnh sửa) — đó là hành vi thuộc Workflow Engine (Bước 4), làm trước sẽ phải sửa lại. MVP hiện tại: tạo văn bản sẽ đi thẳng vào trạng thái `PENDING` (bỏ qua giai đoạn `DRAFT` có thể sửa nháp), đồng thời ghi 1 `DocumentLog` action `SUBMIT` để có sẵn audit trail cho Bước 5.

**Cũng thu hẹp phạm vi "ai xem được gì":** Bước 3 chỉ làm góc nhìn người **tạo** văn bản (Staff xem hồ sơ của chính mình — đúng permission `document:read:own` đã seed). Góc nhìn người **duyệt** (danh sách hồ sơ đang chờ duyệt của tôi, cờ `canApprove`) phụ thuộc vào logic so khớp `WorkflowStep.approverRole` với `currentStep` — đây chính là nội dung cốt lõi PLAN.md giao cho Workflow Engine (Bước 4), làm ở đây sẽ trùng lặp/phải viết lại. Route duyệt hồ sơ (`approve`/`reject`) cũng thuộc Bước 4.

### Quyết định kỹ thuật
- **Seed Workflow tối thiểu**: 3 `Workflow` đặt tên **trùng với `Document.type`** (`"PURCHASE"`, `"PAYMENT"`, `"GENERAL"`) để route tạo document tra cứu bằng `workflow.findFirst({ where: { name: type } })` — quy ước đơn giản, không cần đổi schema. Mỗi workflow có sẵn `WorkflowStep` hợp lý (GENERAL/PURCHASE: `Dept_Head` → `Director`; PAYMENT: `Dept_Head` → `Accountant` → `Director`) để Bước 4 có dữ liệu thật để vận hành, không phải placeholder rỗng. `Workflow.name` không có ràng buộc `@unique` trong schema hiện tại → seed dùng `findFirst` rồi tạo/cập nhật thủ công (không dùng `upsert`), chấp nhận được vì seed chạy tuần tự, không có concurrency.
- **Upload file**: dùng `multer` (`diskStorage`), lưu vào `backend/uploads/` (đã nằm trong `.gitignore` gốc qua pattern `uploads/`). Tên file lưu trên đĩa = `crypto.randomUUID() + extname` (dùng `crypto` built-in của Node, không thêm dependency `uuid`). Kiểm tra đuôi file `.pdf`/`.docx` qua `path.extname()` (đúng theo PLAN.md mục 2: "Kiểm tra đuôi file... đổi tên sang UUID"), giới hạn dung lượng 15MB/file, tối đa 10 file/request. File không hợp lệ bị từ chối qua `fileFilter` với thông báo lỗi rõ ràng.
- **Route tải file đính kèm**: thêm `GET /api/documents/:id/attachments/:attachmentId/download` để stream file về (kiểm tra quyền xem trước khi trả), phục vụ cả nhu cầu thực tế lẫn việc kiểm thử vòng đời upload → download đầy đủ.
- **Quyền tạo văn bản**: giữ nguyên như đã seed ở Bước 1 (chỉ `Staff` có `document:create`) — không mở rộng thêm, nếu người dùng muốn role khác cũng tạo được thì chỉ cần sửa data seed, không cần đổi code.
- **An toàn dữ liệu trả về**: khi include quan hệ `creator` trong response Document, dùng Prisma `select` tường minh (`id, fullName, email`) thay vì `include` toàn bộ để không vô tình lộ `passwordHash` — cùng nguyên tắc đã áp dụng ở `auth.ts` (Bước 2).

## Kế hoạch triển khai

### 1. `prisma/seed.ts` — bổ sung seed Workflow + WorkflowStep
Thêm sau phần seed User: tạo 3 Workflow (`PURCHASE`, `PAYMENT`, `GENERAL`) kèm các `WorkflowStep` như mô tả ở trên (dùng `findFirst` theo `name`, tạo mới nếu chưa có; nếu đã có thì xoá `WorkflowStep` cũ và tạo lại theo danh sách mới — đảm bảo idempotent khi chạy lại seed nhiều lần trong quá trình dev).

### 2. Cấu trúc file mới trong `/backend/src`
```
lib/
  upload.ts          # cấu hình multer (diskStorage, fileFilter đuôi .pdf/.docx, limits)
routes/
  documents.ts         # thay stub bằng CRUD thật: POST /, GET /, GET /:id, GET /:id/attachments/:attachmentId/download
```
`backend/uploads/` được tạo tự động lúc khởi động server nếu chưa tồn tại (`fs.mkdirSync(UPLOAD_DIR, { recursive: true })` trong `lib/upload.ts`).

### 3. `POST /api/documents` (multipart/form-data)
- Middleware: `authenticate`, `authorize("document:create")`, `upload.array("attachments", 10)`.
- Body (text fields của multipart): `title` (string), `type` (`"PURCHASE" | "PAYMENT" | "GENERAL"`, validate bằng zod enum), `formData` (chuỗi JSON tự do, `JSON.parse` rồi validate là object — không ép schema cụ thể, đúng tinh thần JSONB linh hoạt của PLAN.md).
- Logic: tra `Workflow` theo `name = type` → nếu không thấy, `500` (dữ liệu seed thiếu, không phải lỗi người dùng) → tạo `Document` (status `"PENDING"`, `currentStep: 1`, `creatorId: req.user.id`) trong 1 transaction Prisma cùng với tạo các `Attachment` (từ file đã lưu qua multer) và 1 `DocumentLog` (`action: "SUBMIT"`, `userId: req.user.id`).
- Response `201`: Document kèm `attachments`, `creator` (select an toàn), tên `workflow`.

### 4. `GET /api/documents`
- Middleware: `authenticate`, `authorize("document:read:own")`.
- Trả danh sách Document có `creatorId = req.user.id`, sắp theo `createdAt desc`, kèm `attachments`, `workflow` (chỉ `name`).

### 5. `GET /api/documents/:id`
- Middleware: `authenticate`, `authorize("document:read:own")`.
- Tìm Document theo `id`; nếu không tồn tại → `404`; nếu `creatorId !== req.user.id` → `403` (chưa hỗ trợ góc nhìn người duyệt ở bước này). Trả về kèm `attachments`, `logs`, `creator` (select an toàn), `workflow` (kèm `steps` để phục vụ debug/Bước 4 sau này).

### 6. `GET /api/documents/:id/attachments/:attachmentId/download`
- Middleware: `authenticate`, `authorize("document:read:own")`.
- Kiểm tra Document tồn tại + thuộc quyền sở hữu như mục 5, kiểm tra Attachment thuộc đúng Document, stream file từ `backend/uploads/<fileUrl>` về với `Content-Disposition: attachment; filename="<tên file gốc>"`.

## Kiểm thử / Verification
1. `npx tsc --noEmit` sạch.
2. Chạy seed → xác nhận qua `psql` có 3 Workflow + đủ WorkflowStep tương ứng.
3. `npm run dev`, login bằng `staff@example.com`, dùng cookie jar:
   - `POST /api/documents` (multipart, có 1 file `.pdf` giả và 1 file `.docx` giả, `type=GENERAL`, `formData={"note":"test"}`) → `201`, response có `id`, `attachments` đúng 2 file, `status: "PENDING"`.
   - `POST /api/documents` với file đuôi `.exe` → bị từ chối (400) bởi `fileFilter`.
   - `POST /api/documents` với `type` không hợp lệ (vd. `"FOO"`) → `400`.
   - `GET /api/documents` → thấy đúng document vừa tạo.
   - `GET /api/documents/:id` → chi tiết đầy đủ, có `attachments`, `logs` chứa 1 entry `SUBMIT`.
   - `GET /api/documents/:id/attachments/:attachmentId/download` → tải về đúng nội dung file đã upload (so khớp byte/hash với file gốc).
   - Login bằng `director@example.com` (khác creator) → `GET /api/documents/:id` của document trên → `403` (đúng vì chưa có góc nhìn người duyệt ở Bước 3).
4. Kiểm tra thư mục `backend/uploads/` có file được lưu với tên dạng UUID, không trùng tên gốc.
5. Dừng backend dev server sau khi test; giữ Postgres container chạy tiếp cho Bước 4.

## Lưu ý
- Update/Delete Document, góc nhìn "hồ sơ chờ tôi duyệt", cờ `canApprove`, và các route `approve`/`reject`/`request-change` đều **chưa làm ở bước này** — thuộc Bước 4 (Workflow Engine).
- Comment (action `COMMENT` trong `DocumentLog`) thuộc Bước 5, chưa có endpoint riêng ở Bước 3 (chỉ có log `SUBMIT` tự động khi tạo).

---

## Kết quả thực thi Bước 3 (2026-07-15)

> ✅ **TRẠNG THÁI: Bước 3 đã hoàn thành và kiểm thử.**

### Những gì đã tạo ra thực tế
- Cài mới: `multer` (dependency), `@types/multer` (devDependency).
- `prisma/seed.ts`: bổ sung seed 3 `Workflow` (`GENERAL`, `PURCHASE`, `PAYMENT`) + `WorkflowStep` tương ứng (GENERAL/PURCHASE: Dept_Head→Director; PAYMENT: Dept_Head→Accountant→Director), dùng `findFirst`+create/update thủ công (không `upsert`, vì `Workflow.name` không có `@unique`), xoá `WorkflowStep` cũ trước khi tạo lại để idempotent.
- `src/lib/upload.ts`: cấu hình `multer.diskStorage` lưu vào `backend/uploads/` (tự `mkdirSync recursive` lúc import), tên file = `crypto.randomUUID() + extname`, `fileFilter` chỉ nhận `.pdf`/`.docx`, giới hạn 15MB/file, tối đa 10 file/request.
- `src/lib/errors.ts`: thêm `AppError` (class `Error` có `status`) để route có thể `throw` lỗi nghiệp vụ với mã HTTP tường minh.
- `src/index.ts`: error handler nhận diện `AppError` → dùng đúng status/message; `multer.MulterError` (vượt size/số file) và lỗi từ `fileFilter` → `400`; còn lại → `500` (log ra console).
- `src/routes/documents.ts`: thay stub bằng 4 route thật:
  - `POST /` — multipart, `authenticate`+`authorize("document:create")`+`upload.array("attachments",10)`; validate `title`/`type` (zod enum) + `formData` (JSON string tự do, ép kiểu object); tra `Workflow` theo `name=type`; tạo `Document`+`Attachment[]`+1 `DocumentLog(action:"SUBMIT")` trong 1 `prisma.$transaction`; trả `201` kèm `attachments`, `logs`, `creator` (select an toàn), `workflow`.
  - `GET /` — liệt kê document của chính `req.user.id`.
  - `GET /:id` — chi tiết, 404 nếu không tồn tại, 403 nếu không phải chủ sở hữu (kèm `workflow.steps` để debug/chuẩn bị Bước 4).
  - `GET /:id/attachments/:attachmentId/download` — stream file qua `res.download()`, kiểm tra sở hữu document + attachment đúng thuộc document trước khi trả.

### Phát sinh / điều chỉnh so với kế hoạch
- Không có sai lệch kỹ thuật đáng kể so với thiết kế — toàn bộ quyết định trong mục "Quyết định kỹ thuật" và "Kế hoạch triển khai" được giữ nguyên khi code.
- Ghi nhận một điểm khi kiểm thử: kịch bản `GET /:id` bằng user khác (`director@example.com`) trả `403` — nhưng lý do thực tế là middleware `authorize("document:read:own")` chặn ngay từ đầu vì `Director` **hoàn toàn không có** quyền `document:read:own` (chỉ `Staff` có), chứ không phải do nhánh kiểm tra `creatorId !== req.user.id` bên trong handler được thực thi. Nhánh ownership-check đó hiện **chưa được test trực tiếp** vì trong dữ liệu seed hiện tại chỉ có role `Staff` sở hữu quyền `document:read:own` — cần ít nhất 2 user cùng role `Staff` để test đúng nhánh đó. Không phải bug, chỉ là giới hạn của bộ dữ liệu test hiện có; code logic vẫn đúng.

### Kết quả kiểm thử (toàn bộ PASS)
- `npx tsc --noEmit` sạch.
- Seed chạy lại thành công; xác nhận qua `psql`: đủ 3 Workflow, 7 WorkflowStep đúng thứ tự/role.
- `curl` end-to-end (login `staff@example.com`):
  - `POST /api/documents` (multipart, 2 file `.pdf`+`.docx` giả, `type=GENERAL`) → `201`, đúng cấu trúc `attachments`, `logs` (1 entry `SUBMIT`), `creator`, `workflow`.
  - `POST` với file `.exe` → `400 {"error":"Chỉ chấp nhận file .pdf hoặc .docx"}`.
  - `POST` với `type="FOO"` → `400`.
  - `GET /api/documents` → thấy đúng document vừa tạo.
  - `GET /api/documents/:id` → chi tiết đầy đủ kèm `workflow.steps`.
  - `GET /api/documents/:id/attachments/:attachmentId/download` → tải về, `Content-Disposition: attachment; filename="hoso.pdf"`, `diff` xác nhận nội dung byte-for-byte giống file gốc.
  - Cùng 2 request trên nhưng bằng cookie `director@example.com` → cả hai đều `403`.
- Thư mục `backend/uploads/` chứa đúng 2 file tên dạng UUID (`682b1e65-....pdf`, `0bba4030-....docx`), không trùng tên gốc.
- Đã dừng backend dev server và xoá toàn bộ file tạm (`/tmp/*cookie*`, `/tmp/test.*`) sau khi test; Postgres container vẫn `Up ... (healthy)` cho Bước 4.

### Bước tiếp theo
Bước 4 (Workflow Engine — approve/reject/request-change, tính bước kế tiếp, cờ `canApprove`, danh sách "hồ sơ chờ tôi duyệt") chưa bắt đầu, sẽ lên kế hoạch riêng khi được yêu cầu tiếp tục. Dữ liệu `Workflow`/`WorkflowStep` đã seed sẵn ở Bước 3 nên Bước 4 có thể tập trung hoàn toàn vào logic chuyển trạng thái, không cần seed lại.

---

# Bước 4 — Workflow Engine (approve/reject/request-change, hàng chờ duyệt)

## Context
`src/routes/documents.ts` (Bước 3) mới hỗ trợ góc nhìn **người tạo**: tạo, xem danh sách/chi tiết văn bản của chính mình. `Workflow`/`WorkflowStep` đã có sẵn dữ liệu seed (GENERAL/PURCHASE: Dept_Head→Director; PAYMENT: Dept_Head→Accountant→Director). Mục tiêu Bước 4: hiện thực góc nhìn **người duyệt** — đúng theo PLAN.md mục 2, hàng "Chuyển bước duyệt": *"Backend: Tính toán bước duyệt tiếp theo (bước hiện tại + 1), ghi nhận nhật ký (Log), thay đổi trạng thái... Giải mã Cookie để định danh User. Truy vấn Database để xác minh User có đủ quyền ở bước hiện tại không."*

**Phát hiện cần sửa lại code Bước 3 (không chỉ thêm mới):** `GET /:id` và `GET /:id/attachments/:attachmentId/download` hiện đang gate cứng bằng `authorize("document:read:own")` — permission này **chỉ role `Staff` có**. Nếu giữ nguyên, người duyệt (`Dept_Head`/`Director`/`Accountant`) sẽ không bao giờ gọi được các route này để xem hồ sơ trước khi ra quyết định → toàn bộ luồng duyệt bất khả thi. Cần nới lỏng: bỏ gate `authorize()` cố định, thay bằng kiểm tra tại handler cho phép xem nếu là **chủ sở hữu** HOẶC **người duyệt ở bước hiện tại** HOẶC **đã từng thao tác trên hồ sơ này** (tra trong `logs`, để người duyệt bước 1 vẫn xem lại được sau khi hồ sơ đã sang bước 2).

### Quyết định kỹ thuật
- **Không dùng `authorize(permission)` tĩnh cho approve/reject/request-change/resubmit** — thẩm quyền thật sự phụ thuộc vào `WorkflowStep.approverRole` khớp với `req.user.role.name` **tại bước hiện tại của từng hồ sơ cụ thể**, không phải một quyền cố định theo role. Đây là cách hiện thực đúng nguyên văn PLAN.md (định danh qua cookie, rồi truy vấn DB xác minh quyền theo bước). Các route này chỉ cần `authenticate`, phần còn lại do handler tự kiểm tra.
- **Helper dùng chung `src/lib/workflow.ts`**: tránh lặp logic so khớp step/role ở nhiều route.
  - `getCurrentWorkflowStep(document)`: tìm `WorkflowStep` có `stepOrder === document.currentStep`.
  - `isCurrentApprover(document, user)`: `document.status === "PENDING" && getCurrentWorkflowStep(document)?.approverRole === user.role.name`.
  - `canViewDocument(document, user)`: `document.creatorId === user.id || isCurrentApprover(document, user) || document.logs.some(l => l.userId === user.id)`.
- **Trường `canApprove`** (đúng PLAN.md mục 2, hàng "Phân quyền": *"Frontend chỉ đọc thuộc tính giao diện canApprove: true/false"*) — tính bằng `isCurrentApprover()`, gắn thêm vào JSON response (không phải cột DB) cho mọi endpoint trả về Document.
- **Danh sách "hồ sơ chờ tôi duyệt"**: `GET /api/documents/pending` — lấy tất cả Document `status="PENDING"`, include `workflow.steps`, rồi lọc bằng JS qua `isCurrentApprover()` (dữ liệu ít, không cần raw SQL phức tạp; đúng tinh thần Fat Server tự tính toán). **Phải đăng ký route này trước `GET /:id`** trong Express Router để tránh `:id` nuốt mất path `/pending`.
- **`resubmit`**: hoàn thiện vòng đời `CHANGES_REQUESTED` (nếu không có lối ra, trạng thái này sẽ là ngõ cụt). Phạm vi Bước 4 chỉ làm **chuyển trạng thái thuần** (`CHANGES_REQUESTED` → `PENDING`, giữ nguyên `currentStep` để quay lại đúng người vừa yêu cầu sửa), **chưa cho sửa nội dung/`formData`/đính kèm** trong cùng request — việc chỉnh sửa nội dung khi resubmit là phần mở rộng có thể làm sau nếu cần, nêu rõ trong "Lưu ý" để không ngộ nhận là đã đủ.
- **`comment` bắt buộc với reject/request-change`, tuỳ chọn với `approve`/`resubmit`** — hợp lý nghiệp vụ (từ chối/yêu cầu sửa phải nêu lý do).

## Kế hoạch triển khai

### 1. `src/lib/workflow.ts` (mới)
3 hàm thuần (`getCurrentWorkflowStep`, `isCurrentApprover`, `canViewDocument`) như mô tả trên, nhận vào Document đã `include: { workflow: { include: { steps: true } }, logs: true }` (logs optional cho các nơi không cần `canViewDocument`).

### 2. Sửa `src/routes/documents.ts`
- **`GET /:id`**: bỏ `authorize("document:read:own")`, chỉ còn `authenticate`. Sau khi fetch (kèm `logs`), thay điều kiện 403 cũ (`creatorId !== req.user.id`) bằng `!canViewDocument(document, req.user)`. Gắn thêm `canApprove` vào response.
- **`GET /:id/attachments/:attachmentId/download`**: áp dụng cùng thay đổi `canViewDocument`.
- **`GET /`** (danh sách của tôi): giữ nguyên `authorize("document:read:own")` + filter `creatorId`, gắn thêm `canApprove` (luôn `false` với dữ liệu seed hiện tại vì Staff không phải approver, nhưng để nhất quán field shape giữa các endpoint).
- **`POST /`** (tạo mới): không đổi logic, chỉ gắn thêm `canApprove: false` vào response cho nhất quán.
- **`GET /pending`** (mới, đăng ký **trước** `GET /:id`): `authenticate` only, filter bằng `isCurrentApprover`, trả kèm `canApprove: true` cho mọi item (vì đã lọc đúng điều kiện).
- **`POST /:id/approve`** (mới): `authenticate` → fetch document (kèm `workflow.steps`) → 404 nếu không có → 400 nếu `status !== "PENDING"` → 403 nếu `!isCurrentApprover` → tính `nextStep = steps.find(s => s.stepOrder === document.currentStep + 1)` → nếu có: `update({currentStep: currentStep+1})`; nếu không: `update({status: "APPROVED"})` → ghi `DocumentLog(action:"APPROVE", comment?)` cùng transaction → trả document đã cập nhật (include đầy đủ + `canApprove` tính lại).
- **`POST /:id/reject`** (mới): tương tự nhưng bắt buộc `comment` (zod `min(1)`), `update({status:"REJECTED"})`, log `action:"REJECT"`.
- **`POST /:id/request-change`** (mới): bắt buộc `comment`, `update({status:"CHANGES_REQUESTED"})` (giữ nguyên `currentStep`), log `action:"REQUEST_CHANGE"`.
- **`POST /:id/resubmit`** (mới): `authenticate` → 404 nếu không tồn tại → 403 nếu `document.creatorId !== req.user.id` → 400 nếu `status !== "CHANGES_REQUESTED"` → `update({status:"PENDING"})` (giữ `currentStep`) → log `action:"SUBMIT"` (comment tuỳ chọn).
- Thêm hằng `DOCUMENT_INCLUDE` dùng chung (đã có sẵn shape tương tự lặp ở nhiều route trong Bước 3 — gộp lại 1 nơi, giảm trùng lặp) gồm `attachments`, `creator: {select: SAFE_CREATOR_SELECT}`, `workflow: {include:{steps:{orderBy:{stepOrder:"asc"}}}}`; route chi tiết/hành động approve/reject/... thêm `logs` riêng.

## Kiểm thử / Verification
1. `npx tsc --noEmit` sạch.
2. `npm run dev`, dùng 4 cookie jar (staff/depthead/director/accountant), test luồng **GENERAL** đầy đủ:
   - `staff` tạo document `type=GENERAL` → `PENDING`, `currentStep=1`.
   - `depthead` gọi `GET /api/documents/pending` → thấy đúng document, `canApprove:true`.
   - `director`/`accountant` gọi `GET /api/documents/pending` → không thấy document này (chưa tới bước của họ).
   - `staff` (không phải approver bước hiện tại) gọi `POST /:id/approve` → `403`.
   - `depthead` gọi `POST /:id/approve` → `200`, `currentStep=2`, `status` vẫn `PENDING`.
   - `depthead` gọi lại `POST /:id/approve` lần 2 (đã qua bước của mình) → `403`.
   - `director` gọi `GET /api/documents/pending` → giờ thấy document (đến bước của mình).
   - `director` gọi `POST /:id/approve` → `200`, `status="APPROVED"` (hết bước).
   - `staff` gọi `GET /:id` (chủ sở hữu) → vẫn xem được, `canApprove:false` (đã APPROVED).
3. Luồng **reject**: tạo document mới, `depthead` gọi `POST /:id/reject` không kèm `comment` → `400`; kèm `comment` → `200`, `status="REJECTED"`.
4. Luồng **request-change + resubmit**: tạo document mới, `depthead` gọi `POST /:id/request-change` kèm `comment` → `200`, `status="CHANGES_REQUESTED"`, `currentStep` không đổi. `director` (không phải creator) gọi `POST /:id/resubmit` → `403`. `staff` (creator) gọi `POST /:id/resubmit` → `200`, `status="PENDING"`, `currentStep` giữ nguyên (quay lại đúng hàng chờ của `depthead`).
5. `GET /:id` bằng user hoàn toàn không liên quan (vd. `accountant` trên document GENERAL chưa từng tới bước của họ) → `403` (đúng `canViewDocument` trả `false`).
6. Dừng backend dev server sau khi test; giữ Postgres container chạy tiếp cho Bước 5.

## Lưu ý
- `resubmit` chỉ chuyển trạng thái, **chưa cho sửa nội dung** (`title`/`formData`/đính kèm) trong cùng lượt — nếu cần, sẽ bổ sung sau như một phần mở rộng riêng (không thuộc cam kết của Bước 4).
- Chưa có endpoint `COMMENT` riêng biệt (thảo luận qua lại nhiều lượt không gắn với chuyển trạng thái) — thuộc Bước 5 (Comment & Logs).
- Chưa có thông báo (email/push/realtime) khi trạng thái đổi — thuộc Bước 6.

---

## Kết quả thực thi Bước 4 (2026-07-15)

> ✅ **TRẠNG THÁI: Bước 4 đã hoàn thành và kiểm thử.**

### Những gì đã tạo/sửa ra thực tế
- `src/lib/workflow.ts` (mới): `getCurrentWorkflowStep`, `isCurrentApprover`, `canViewDocument` — đúng như thiết kế.
- `src/routes/documents.ts` (viết lại toàn bộ, không chỉ thêm mới):
  - Thêm hằng `DOCUMENT_INCLUDE` dùng chung (`attachments`, `creator` select an toàn, `workflow.steps`), giảm lặp code so với Bước 3.
  - `GET /:id` và `GET /:id/attachments/:attachmentId/download`: bỏ `authorize("document:read:own")`, chỉ còn `authenticate` + kiểm tra `canViewDocument()` trong handler — đúng như điều chỉnh đã nêu trong Context.
  - `GET /` và `POST /`: giữ nguyên gate cũ, gắn thêm field `canApprove` vào response.
  - `GET /pending` (mới, đăng ký trước `/:id`): liệt kê toàn bộ `PENDING`, lọc bằng `isCurrentApprover` trong JS.
  - 4 route hành động mới: `POST /:id/approve`, `/:id/reject`, `/:id/request-change`, `/:id/resubmit` — đúng logic đã thiết kế (tính bước kế tiếp, ghi `DocumentLog`, transaction).
- Không cần sửa `prisma/schema.prisma` hay seed — dữ liệu `Workflow`/`WorkflowStep` từ Bước 3 dùng lại nguyên vẹn.

### Phát sinh / điều chỉnh so với kế hoạch
- Không có sai lệch kỹ thuật so với thiết kế. Một chi tiết viết code: trong bản nháp đầu có sót lại một hàm `withCanApprove` + `declare const req` thử nghiệm không dùng tới (copy-paste sai) — đã phát hiện và xoá ngay trước khi type-check, không lọt vào code cuối cùng.

### Kết quả kiểm thử (toàn bộ PASS)
- `npx tsc --noEmit` sạch.
- Luồng **GENERAL** đầy đủ (4 cookie jar riêng biệt cho staff/depthead/director/accountant):
  - `staff` tạo document → `PENDING`, `currentStep=1`, `canApprove=false`.
  - `depthead` `GET /pending` → thấy document, `canApprove=true` (cùng 1 document tồn dư từ Bước 3 cũng xuất hiện — đúng vì vẫn `PENDING` ở bước Dept_Head, không phải lỗi).
  - `director`/`accountant` `GET /pending` → `count=0` (chưa tới bước của họ).
  - `staff` gọi `POST /:id/approve` → `403` (không phải approver bước hiện tại).
  - `depthead` `POST /:id/approve` → `200`, `currentStep=2`, `status` vẫn `PENDING`.
  - `depthead` gọi lại `approve` lần 2 → `403` (đã qua bước của mình, đúng thiết kế `isCurrentApprover` gắn với `status===PENDING` + step khớp).
  - `director` `GET /pending` → giờ thấy document.
  - `director` `POST /:id/approve` (bước cuối) → `200`, `status="APPROVED"`.
  - `staff` `GET /:id` sau khi APPROVED → vẫn xem được (chủ sở hữu), `canApprove=false`.
- Luồng **reject**: thiếu `comment` → `400 {"error":"Cần nêu lý do từ chối"}`; có `comment` → `200`, `status="REJECTED"`.
- Luồng **request-change + resubmit**: `depthead` request-change kèm comment → `200`, `status="CHANGES_REQUESTED"`, `currentStep` giữ nguyên `1`. `director` (không phải creator) gọi `resubmit` → `403`. `staff` (creator) gọi `resubmit` → `200`, `status="PENDING"`, `currentStep` vẫn `1` (quay đúng lại hàng chờ `depthead`).
- `accountant` (hoàn toàn không liên quan) `GET /:id` trên document GENERAL chưa từng tới bước của họ → `403` — xác nhận `canViewDocument` hoạt động đúng (không phải creator, không phải approver hiện tại, chưa từng có log nào).
- Đã dừng backend dev server và xoá toàn bộ cookie jar/file tạm sau khi test; Postgres container vẫn `Up ... (healthy)` cho Bước 5.

### Bước tiếp theo
Bước 5 (Comment & Logs — thảo luận qua lại trên hồ sơ, không gắn với chuyển trạng thái; xem timeline đầy đủ) chưa bắt đầu, sẽ lên kế hoạch riêng khi được yêu cầu tiếp tục. `DocumentLog` đã có sẵn action `SUBMIT`/`APPROVE`/`REJECT`/`REQUEST_CHANGE` từ Bước 3-4; Bước 5 chỉ cần bổ sung action `COMMENT` qua 1 endpoint riêng (không đổi trạng thái Document) và có thể cần endpoint xem timeline gộp nếu response hiện tại của `GET /:id` (đã có `logs`) chưa đủ.

---

# Bước 4.5 — Khắc phục các phát hiện từ báo cáo review (CONVERSATION.md)

## Context
Người dùng cung cấp `CONVERSATION.md` — báo cáo phân tích rủi ro 7 điểm trên code Bước 2-4 — và yêu cầu đánh giá. Kết quả đối chiếu với code thực tế: **#1, #2, #3, #4 là bug thật đã xác nhận; #6, #7 là cải thiện hợp lệ; #5 là quyết định vận hành** (không sửa trong đợt này — giữ 15MB, không chuyển S3/MinIO vì PLAN.md yêu cầu vận hành cục bộ; có thể hạ limit sau nếu người dùng muốn). Ngoài ra phát hiện thêm 1 điểm báo cáo bỏ sót: `resubmit` có cùng dạng race condition với #2.

## Các fix sẽ thực hiện

### Fix #1 — Phê duyệt chéo phòng ban (`src/lib/workflow.ts`, `src/routes/documents.ts`)
- Mở rộng type `DocumentWithWorkflow` thêm `creator: { departmentId }`.
- `isCurrentApprover`: sau khi khớp role, nếu `approverRole === "Dept_Head"` thì bắt buộc `document.creator.departmentId === user.departmentId` (theo đúng đề xuất của báo cáo — hardcode chấp nhận được cho MVP, đã cân nhắc phương án cờ `sameDepartmentRequired` trong schema nhưng không đổi schema ngoài phạm vi PLAN.md).
- `DOCUMENT_INCLUDE.creator` select thêm `departmentId` (vẫn không lộ `passwordHash`).

### Fix #2 + điểm bỏ sót — Race condition (`src/routes/documents.ts`)
- Trong transaction của `approve`/`reject`/`request-change`: `where: { id, currentStep: document.currentStep, status: "PENDING" }` (optimistic concurrency — Prisma 6 hỗ trợ extendedWhereUnique).
- `resubmit`: tương tự với `where: { id, status: "CHANGES_REQUESTED" }`.
- Bắt lỗi Prisma `P2025` (record không khớp điều kiện) trong error handler `src/index.ts` → trả `409 {"error":"Văn bản vừa được người khác xử lý, vui lòng tải lại"}`.

### Fix #3 — File mồ côi (`src/routes/documents.ts`)
- `POST /`: bọc toàn bộ thân handler (bao gồm cả các nhánh validate 400, không chỉ phần DB) trong `try/catch`; nhánh catch quét `req.files` và `fs.unlink` từng file (log lỗi unlink, không throw tiếp) trước khi `next(err)`.

### Fix #4 — try/catch trong authenticate (`src/middlewares/authenticate.ts`)
- Bọc call `prisma.user.findUnique` trong `try/catch`, catch gọi `next(err)`.

### Fix #6 — Index FK (`prisma/schema.prisma` + migration mới)
- Thêm `@@index` cho: `User.roleId`, `User.departmentId`, `Document.creatorId`, `Document.workflowId`, `Document.status` (bổ sung ngoài báo cáo — phục vụ `GET /pending`), `Attachment.documentId`, `WorkflowStep.workflowId`, `DocumentLog.documentId`, `DocumentLog.userId`.
- Chạy `npx prisma migrate dev --name add_indexes`.

### Fix #7 — Giới hạn field text multer (`src/lib/upload.ts`)
- Thêm `fieldSize: 2MB`, `fields: 20` vào `limits` (tường minh hoá — multer mặc định đã có fieldSize 1MB, đây là hardening chứ không phải vá lỗ hổng).

## Kiểm thử / Verification
1. `npx tsc --noEmit` sạch; migration mới apply thành công.
2. **Fix #1**: seed tạm user Dept_Head thuộc department khác (hoặc đổi department của depthead hiện có qua psql) → gọi `approve` trên document của staff khác phòng → `403`; cùng phòng → `200`. Khôi phục dữ liệu sau test.
3. **Fix #2**: bắn 2 request `approve` song song (`curl &` + `wait`) trên cùng document → 1 request `200`, request kia `409`; `currentStep` chỉ tăng đúng 1 nấc (xác nhận qua psql).
4. **Fix #3**: gửi `POST /` với file hợp lệ + `type` sai → `400` và `uploads/` không còn file mới (đếm file trước/sau).
5. **Fix #4**: khó test trực tiếp (cần DB rớt đúng lúc) — xác nhận bằng đọc code + type-check; luồng authenticate bình thường vẫn hoạt động (login + `/me` → `200`).
6. Chạy lại nhanh luồng approve GENERAL đầy đủ (smoke test) để xác nhận không regression.
7. Dừng dev server sau khi test; đồng bộ IMPLEMENTATION_PLAN.md.

---

## Kết quả thực thi Bước 4.5 (2026-07-15)

> ✅ **TRẠNG THÁI: Bước 4.5 đã hoàn thành và kiểm thử — tất cả 5 fix đúng như kế hoạch.**

### Những gì đã sửa ra thực tế
- `src/lib/workflow.ts`: `isCurrentApprover` nay so thêm `document.creator.departmentId === user.departmentId` khi `approverRole === "Dept_Head"`. Type `DocumentWithWorkflow` mở rộng field `creator: { departmentId }`.
- `src/routes/documents.ts`:
  - `SAFE_CREATOR_SELECT` thêm `departmentId` (vẫn không lộ `passwordHash`).
  - `POST /`: bọc toàn bộ thân handler trong `try/catch`, biến `files` khai báo trước try; catch quét `fs.unlink` từng file trước khi `next(err)`.
  - `approve`/`reject`/`request-change`: `where` của `tx.document.update` thêm `currentStep: document.currentStep, status: "PENDING"`.
  - `resubmit`: `where` thêm `status: "CHANGES_REQUESTED"`.
  - Bỏ import `getCurrentWorkflowStep` không dùng tới (dọn dẹp nhỏ nhân tiện).
- `src/index.ts`: import `Prisma` từ `@prisma/client`, thêm nhánh bắt `Prisma.PrismaClientKnownRequestError` code `P2025` → `409`.
- `src/middlewares/authenticate.ts`: bọc `prisma.user.findUnique` trong `try/catch`, catch gọi `next(err)`.
- `prisma/schema.prisma`: thêm 9 `@@index` (`User.roleId`, `User.departmentId`, `Document.creatorId`, `Document.workflowId`, `Document.status`, `Attachment.documentId`, `WorkflowStep.workflowId`, `DocumentLog.documentId`, `DocumentLog.userId`) → migration `20260715234806_add_indexes`.
- `src/lib/upload.ts`: thêm `fieldSize: 2MB`, `fields: 20` vào `limits`.

### Phát sinh / điều chỉnh so với kế hoạch
Không có sai lệch — toàn bộ 5 fix áp dụng đúng như thiết kế trong Context/kế hoạch. Một phát hiện thú vị khi kiểm thử #2: với 2 request đồng thời, cả 2 lớp bảo vệ (application-level `isCurrentApprover` check và DB-level optimistic `where`) đều có thể là lớp chặn request thua cuộc tùy thời điểm đọc — test với 5 request song song cho thấy cả `403` (thua ở application check vì đọc snapshot sau khi request khác đã cập nhật) và `409` (thua ở DB vì `where` không còn khớp) đều xuất hiện. Đây là hành vi đúng, không phải lỗi — cả hai đường đều ngăn double-approve thành công.

### Kết quả kiểm thử (toàn bộ PASS)
- `npx tsc --noEmit` sạch. Migration `add_indexes` áp dụng thành công; xác nhận qua `psql` đủ 9 index (`pg_indexes`).
- **Fix #1**: đổi tạm `depthead` sang phòng "Ban Giám đốc" (khác `staff`) → `approve` → `403`; khôi phục về đúng phòng "Phòng Hành chính - Kế toán" → `approve` → `200`, `currentStep=2`.
- **Fix #2**: 2 request song song trên 1 document → 1×`200` + 1×`403`, `currentStep` tăng đúng 1 nấc, đúng 1 log `APPROVE`. Test lại với 5 request song song trên document khác → 1×`200`, 2×`403`, 2×`409` — vẫn chỉ 1 log `APPROVE`, trạng thái cuối đúng tuyệt đối (`PENDING`, `currentStep=2`).
- **Fix #3**: `POST /` với file `.pdf` hợp lệ + `type="INVALID_TYPE"` → `400`; đếm file trong `uploads/` trước/sau: không đổi (2→2) — xác nhận file rác đã được `unlink` tự động.
- **Fix #4**: xác nhận qua type-check + luồng đăng nhập/`/me` vẫn hoạt động bình thường (không regression); nhánh try/catch không thể kích hoạt trực tiếp qua black-box test (cần giả lập DB rớt kết nối).
- **Smoke test**: luồng GENERAL đầy đủ (staff tạo → depthead duyệt bước 1 → director duyệt bước cuối → `APPROVED`) chạy lại không lỗi, không regression từ Bước 4.
- Đã dừng backend dev server và xoá toàn bộ cookie jar/file tạm sau khi test; Postgres container vẫn `Up ... (healthy)`.

### Bước tiếp theo
Bước 5 (Comment & Logs) vẫn là hạng mục kế tiếp theo lộ trình gốc, chưa bắt đầu.

---

# Bước 5 — Comment & Logs (thảo luận trên hồ sơ, timeline)

## Context
`GET /api/documents/:id` (Bước 3-4) đã trả về `logs` (toàn bộ `DocumentLog`: `SUBMIT`/`APPROVE`/`REJECT`/`REQUEST_CHANGE` tự động ghi khi chuyển trạng thái), nhưng **chưa có endpoint nào để người dùng chủ động thêm bình luận** (`action: "COMMENT"`) — đúng theo mô tả PLAN.md mục 1: *"Cho phép người duyệt và người nộp thảo luận, trao đổi ý kiến trực tiếp trên từng hồ sơ vụ việc."* Ngoài ra, `logs` hiện tại chỉ trả `userId` thô (không có tên người dùng) vì include `logs: true` không join quan hệ `user` — cần bổ sung để hiển thị "ai đã nói gì" trong khung thảo luận.

Đây là mảnh ghép cuối cùng còn thiếu để `GET /:id` thực sự đóng vai trò **timeline gộp** (submit → approve/reject/request-change → comment qua lại), nên **không cần thêm endpoint xem timeline riêng** — chỉ cần bổ sung khả năng ghi comment và join thêm thông tin người viết vào `logs` đã có sẵn.

### Quyết định kỹ thuật
- **Tái sử dụng `canViewDocument()`** (đã có từ Bước 4) làm điều kiện duy nhất để được phép bình luận — không thêm khái niệm quyền mới. Điều này tự nhiên khớp đúng "người duyệt và người nộp": chủ sở hữu, người duyệt ở bước hiện tại, và bất kỳ ai đã từng có hành động trên hồ sơ (kể cả người duyệt bước trước đã xong việc) đều xem/bình luận được; người hoàn toàn không liên quan vẫn bị `403` như đã kiểm chứng ở Bước 4.
- **Tái sử dụng `commentRequiredSchema`** (đã có sẵn trong `documents.ts` từ Bước 4, dùng cho reject/request-change) cho validate body `{ comment: string, min 1 }` — không tạo schema trùng lặp.
- **Join `user` vào `logs`**: thay mọi chỗ đang dùng `logs: true` bằng một hằng `LOGS_INCLUDE` dùng chung (`{ orderBy: { createdAt: "asc" }, include: { user: { select: SAFE_CREATOR_SELECT } } }`) — áp dụng nhất quán cho `POST /`, `GET /:id`, download route, `loadDocumentForAction`, và 4 route hành động, để mọi response có `logs` đều kèm tên người thực hiện.
- **Không đổi trạng thái Document** khi comment — chỉ `INSERT` vào `DocumentLog`, không cần transaction.

## Kế hoạch triển khai

### 1. `backend/src/routes/documents.ts`
- Thêm hằng `LOGS_INCLUDE` như mô tả trên, thay thế toàn bộ `logs: true` hiện có (7 vị trí: `POST /`, `GET /:id`, download route, `loadDocumentForAction`, và bên trong transaction của `approve`/`reject`/`request-change`/`resubmit`).
- Thêm route mới: `POST /:id/comments`
  - Middleware: `authenticate`.
  - Validate body bằng `commentRequiredSchema`.
  - Fetch document qua `loadDocumentForAction` (đã có sẵn, giờ trả kèm `logs` join `user`).
  - Nếu `!canViewDocument(document, req.user!)` → `403`.
  - `prisma.documentLog.create({ data: { documentId, userId: req.user!.id, action: "COMMENT", comment } , include: { user: { select: SAFE_CREATOR_SELECT } } })`.
  - Trả `201` với log vừa tạo.

## Kiểm thử / Verification
1. `npx tsc --noEmit` sạch.
2. `npm run dev`, login 4 user, tạo 1 document GENERAL bằng `staff`:
   - `staff` (chủ sở hữu) `POST /:id/comments` `{"comment":"..."}` → `201`, response có `user.fullName`.
   - `depthead` (approver bước hiện tại) comment → `201`.
   - `director` (chưa tới bước của mình, doc còn ở bước 1) comment → `403`.
   - `accountant` (hoàn toàn không liên quan) comment → `403`.
   - `POST /:id/comments` thiếu `comment` hoặc chuỗi rỗng → `400`.
3. `depthead` approve để hồ sơ sang bước `director` → gọi lại `POST /:id/comments` bằng `depthead` (đã từng thao tác, dù không còn là approver hiện tại) → vẫn `201` (đúng theo `canViewDocument` tính cả log cũ).
4. `GET /:id` → xác nhận `logs` trả về đầy đủ theo thứ tự thời gian gồm `SUBMIT`, `APPROVE`, các `COMMENT` xen kẽ, mỗi entry có `user.fullName`/`email` (không có `passwordHash`).
5. Dừng backend dev server sau khi test; giữ Postgres container chạy tiếp cho Bước 6.

## Lưu ý
- Không làm chỉnh sửa/xoá comment (không có trong phạm vi PLAN.md, chỉ nói "thảo luận trao đổi") — nếu cần, coi là mở rộng riêng sau này.
- Bước 6 (Thông báo realtime/Web Push) sẽ là bước cuối theo lộ trình gốc.

---

## Kết quả thực thi Bước 5 (2026-07-16)

> ✅ **TRẠNG THÁI: Bước 5 đã hoàn thành và kiểm thử.**

### Những gì đã sửa ra thực tế
- `src/routes/documents.ts`: thêm hằng `LOGS_INCLUDE` (`orderBy createdAt asc` + `include user select an toàn`), thay thế toàn bộ 7 chỗ dùng `logs: true`/`logs: { orderBy... }` cũ (POST /, GET /:id, download route, `loadDocumentForAction`, và bên trong `approve`/`reject`/`request-change`/`resubmit`).
- Thêm route mới `POST /:id/comments`: `authenticate` + `commentRequiredSchema` (tái dùng từ Bước 4) + `canViewDocument()` (tái dùng từ Bước 4) + `prisma.documentLog.create({action:"COMMENT"})`, trả `201` kèm `user` (fullName/email/departmentId, không `passwordHash`).
- Không cần đổi schema, không cần migration mới — `DocumentLog.action` đã là `String` tự do từ đầu.

### Phát sinh / điều chỉnh so với kế hoạch
Không có sai lệch — đúng như thiết kế trong Context/kế hoạch, tái sử dụng 100% hạ tầng đã có từ Bước 4 (`canViewDocument`, `commentRequiredSchema`), không phát sinh khái niệm quyền mới.

### Kết quả kiểm thử (toàn bộ PASS)
- `npx tsc --noEmit` sạch.
- `staff` (chủ sở hữu) comment → `201`. `depthead` (approver bước hiện tại) comment → `201`. `director` (chưa tới bước) comment → `403`. `accountant` (không liên quan) comment → `403`. Thiếu `comment` → `400`.
- `depthead` approve (chuyển sang bước `director`) → sau đó `depthead` comment lại dù không còn là approver hiện tại → vẫn `201` (đúng vì `canViewDocument` tính cả "đã từng có log") — xác nhận đúng ý PLAN.md "người duyệt và người nộp" được thảo luận, kể cả sau khi đã hành động xong.
- `GET /:id` trả `logs` đầy đủ theo timeline: `SUBMIT` (staff) → `COMMENT` (staff) → `COMMENT` (depthead) → `APPROVE` (depthead) → `COMMENT` (depthead), mỗi entry đều có `user.fullName` rõ ràng.
- Đã dừng backend dev server và xoá file tạm sau khi test; Postgres container vẫn `Up ... (healthy)` cho Bước 6.

### Bước tiếp theo
Bước 6 (Thông báo realtime qua WebSocket & Web Push) là hạng mục cuối cùng theo lộ trình gốc, chưa bắt đầu. Việc đồng bộ code lên GitHub (tạo repo private qua `gh`) cũng đang tạm hoãn theo yêu cầu người dùng — `gh auth login` chưa hoàn tất xác thực, 5 commit Bước 1→4.5 đã sẵn sàng ở local, chờ push khi được yêu cầu tiếp tục.

---

# Bước 6 — Thông báo Realtime (WebSocket)

## Context
Người dùng xác nhận muốn tiếp tục Bước 6 theo đúng lộ trình gốc, **chưa xây frontend UI thật** (đã hỏi và người dùng chọn không xây UI lúc này). Roadmap gốc ghi Bước 6 gồm 2 phần: "Realtime (WebSocket)" và "Web Push".

**Phát hiện cần điều chỉnh phạm vi:** Web Push (theo chuẩn W3C Push API) **về bản chất không thể triển khai lẫn kiểm thử có ý nghĩa nếu không có một trang trình duyệt thật** — nó đòi hỏi: Service Worker chạy trên origin của frontend, người dùng cấp quyền `Notification` qua UI trình duyệt, và trình duyệt tự đăng ký `PushSubscription` với dịch vụ đẩy của Google/Mozilla. Không có cách nào để tôi (Claude Code, chạy lệnh qua Bash) tạo hộ một "browser subscription" hợp lệ bằng curl/Node script — đây là giới hạn kỹ thuật cứng, không phải lựa chọn tuỳ ý. Vì người dùng vừa chủ động hoãn xây frontend, Web Push chưa có "nơi" để tồn tại một cách có ý nghĩa (giống hệt lý do trước đó đã hoãn màn hình login ở Bước 2-3).

→ **Bước 6 lần này chỉ làm WebSocket** (thông báo tức thời khi tab đang mở — phần hoàn toàn có thể xây và kiểm thử bằng backend/script, không cần trình duyệt thật). Web Push sẽ để dành làm cùng lúc với khi frontend UI thật được xây (đặt tên "Bước 6b" khi đó), nêu rõ trong "Lưu ý" để không ngộ nhận đã xong toàn bộ Bước 6 theo PLAN.md.

### Quyết định kỹ thuật
- **Thư viện: `ws`** (không dùng `socket.io`) — không cần room/namespace/reconnection phức tạp, giữ đúng tinh thần tối giản đã áp dụng xuyên suốt dự án (không thêm abstraction khi chưa cần).
- **Xác thực kết nối WebSocket**: dùng `verifyClient` (callback bất đồng bộ của `ws`) để từ chối handshake **trước khi upgrade** nếu cookie JWT không hợp lệ — đọc cookie thô từ header (parser tự viết 3 dòng cho đúng 1 cookie cần dùng, không thêm dependency `cookie`), tái dùng `verifyToken()` (`lib/jwt.ts`) + `prisma.user.findUnique` (cùng logic với `authenticate` middleware nhưng viết lại cho ngữ cảnh non-Express). UserId xác thực được gắn tạm vào `req` (đối tượng handshake) để đọc lại ở sự kiện `connection`.
- **Registry kết nối trong bộ nhớ**: `Map<userId, Set<WebSocket>>` (1 user có thể mở nhiều tab/thiết bị) — đủ dùng cho MVP một tiến trình Node duy nhất, không cần Redis pub/sub (chỉ cần nếu chạy nhiều instance sau này).
- **Helper dùng chung `getNotifiableUserIds(document)`** (`src/lib/notifications.ts`): trả về danh sách `userId` cần báo — luôn gồm `creator.id` + tất cả `userId` đã từng xuất hiện trong `logs` (tái dùng đúng tinh thần "đã từng thao tác" của `canViewDocument`), và nếu `status === "PENDING"` thì cộng thêm toàn bộ user có `role.name` khớp `approverRole` ở bước hiện tại (nếu là `Dept_Head`, lọc thêm đúng `departmentId` của người tạo — nhất quán với `isCurrentApprover`). Loại trừ chính người vừa thực hiện hành động (không cần tự báo cho mình).
- **Payload sự kiện tối giản**: `{ type, documentId, title, actorName }` — đủ để một client tương lai quyết định hiển thị gì, không thiết kế trước cấu trúc UI cụ thể vì chưa có frontend.

## Kế hoạch triển khai

### 1. Cài dependency
`ws` (dependency), `@types/ws` (devDependency).

### 2. `src/lib/ws.ts` (mới)
- `initWebSocket(server: http.Server)`: tạo `WebSocketServer({ server, verifyClient })`; `verifyClient` parse cookie → `verifyToken` → `prisma.user.findUnique` → `callback(true)`/`callback(false, 401, "Unauthorized")`.
- Sự kiện `connection`: lấy `userId` đã xác thực, thêm socket vào registry; `close` thì gỡ khỏi registry.
- `notifyUsers(userIds: string[], event: object)`: với mỗi `userId` có socket đang mở, `ws.send(JSON.stringify(event))`.

### 3. `src/lib/notifications.ts` (mới)
- `getNotifiableUserIds(document, excludeUserId)` như mô tả ở "Quyết định kỹ thuật".

### 4. Sửa `src/index.ts`
- Đổi `app.listen(...)` để giữ lại biến `server` (`http.Server`), gọi `initWebSocket(server)` ngay sau đó.

### 5. Sửa `src/routes/documents.ts`
Sau khi mỗi hành động thành công (trước khi `res.json`/`res.status().json`), gọi `notifyUsers(getNotifiableUserIds(document, req.user!.id), { type: "...", documentId, title, actorName: req.user!.fullName })` cho: tạo mới (`document:created`), approve (`document:approved` hoặc `document:step_advanced` tuỳ còn bước hay hết), reject (`document:rejected`), request-change (`document:changes_requested`), resubmit (`document:resubmitted`), comment (`document:commented`).

## Kiểm thử / Verification
1. `npx tsc --noEmit` sạch.
2. Viết script test tạm (`/tmp/ws-test.js`, dùng package `ws` làm client — không phải phần code chính thức của dự án) để mô phỏng trình duyệt:
   - Login qua HTTP lấy cookie → kết nối `ws://localhost:4000` kèm header `Cookie` → xác nhận kết nối thành công.
   - Kết nối **không kèm cookie** → xác nhận bị từ chối (đóng kết nối, không upgrade thành công).
3. Mở đồng thời 2 kết nối WS đã xác thực (`depthead`, `director`), rồi qua `curl` (shell khác):
   - `staff` tạo document `GENERAL` → xác nhận `depthead` (đang kết nối) nhận được message `document:created` ngay lập tức; `director` không nhận (chưa tới bước).
   - `depthead` approve → xác nhận `director` nhận `document:approved`/tương đương; `depthead` (người vừa hành động) không tự nhận lại.
   - `staff` comment → xác nhận `depthead` (đã từng thao tác) nhận `document:commented`.
4. Dừng backend dev server và các script test tạm sau khi xong; giữ Postgres container chạy.

## Lưu ý
- **Web Push (Bước 6b) chưa làm** — cần frontend UI thật (Service Worker + xin quyền Notification) mới có ý nghĩa và kiểm thử được; sẽ làm cùng lúc khi xây frontend nếu người dùng yêu cầu.
- Registry kết nối chỉ ở bộ nhớ tiến trình hiện tại — nếu sau này chạy nhiều instance backend (scale ngang), cần chuyển sang pub/sub tập trung (Redis) để các instance đồng bộ được ai đang online ở đâu; không cần thiết cho MVP một server.

---

## Kết quả thực thi Bước 6 (2026-07-16)

> ✅ **TRẠNG THÁI: Bước 6 (WebSocket) đã hoàn thành và kiểm thử. Web Push (6b) hoãn lại, chờ frontend.**

### Những gì đã tạo ra thực tế
- Cài mới: `ws` (dependency), `@types/ws` (devDependency).
- `src/lib/ws.ts` (mới): `initWebSocket(server)` tạo `WebSocketServer({server, verifyClient})` — `verifyClient` tự parse cookie thô từ header, `verifyToken` + `prisma.user.findUnique`, gắn `authenticatedUserId` vào `req` handshake để đọc lại ở `connection`. Registry `Map<userId, Set<WebSocket>>`, tự dọn khi `close`. `notifyUsers(userIds, event)` gửi JSON tới mọi socket đang mở của các user đó.
- `src/lib/notifications.ts` (mới): `getNotifiableUserIds(document, excludeUserId)` — hợp `creatorId` + toàn bộ `userId` trong `logs` + (nếu `PENDING`) toàn bộ user khớp `approverRole` ở bước hiện tại (lọc thêm `departmentId` nếu là `Dept_Head`), loại trừ actor.
- `src/index.ts`: giữ lại biến `server` từ `app.listen(...)`, gọi `initWebSocket(server)`.
- `src/routes/documents.ts`: gọi `notifyUsers(await getNotifiableUserIds(...), {...})` ở đúng 6 điểm — tạo (`document:created`), approve (`document:approved`/`document:step_advanced`), reject (`document:rejected`), request-change (`document:changes_requested`), resubmit (`document:resubmitted`), comment (`document:commented`).

### Phát sinh / điều chỉnh so với kế hoạch
Không có sai lệch kỹ thuật — đúng thiết kế. Việc thu hẹp phạm vi (bỏ Web Push khỏi lượt này) đã được quyết định và nêu rõ ngay trong giai đoạn lập kế hoạch (không phải phát sinh giữa chừng).

### Kết quả kiểm thử (toàn bộ PASS)
- `npx tsc --noEmit` sạch.
- Viết script test tạm `/tmp/ws-test.js` (client `ws`, không phải code chính thức, đã xoá sau khi test) để mô phỏng trình duyệt:
  - Kết nối **không kèm cookie** → `ERROR: Unexpected server response: 401`, `CLOSED code=1006` — xác nhận `verifyClient` chặn đúng trước khi upgrade thành công.
  - Kết nối kèm cookie hợp lệ (`depthead`) → `CONNECTED` thành công.
- Luồng thông báo đầy đủ (3-4 kết nối WS mở song song + hành động qua `curl` ở shell khác):
  - `staff` tạo document `GENERAL` → `depthead` (đang kết nối) nhận `document:created` ngay lập tức; `director` (chưa tới bước) không nhận gì; `staff` (chính actor) không tự nhận lại.
  - `depthead` approve (chuyển bước) → `director` nhận `document:step_advanced`; `depthead` (actor) không tự nhận.
  - `director` comment → `depthead` (đã từng thao tác — approve trước đó) và `staff` (chủ sở hữu) đều nhận `document:commented`; `director` (actor) không tự nhận.
- Đã dừng backend dev server, xoá script test tạm và toàn bộ file tạm sau khi test; Postgres container vẫn `Up ... (healthy)`.

### Bước tiếp theo
Đây là bước cuối cùng theo lộ trình 6 bước gốc trong `PLAN.md` (trừ Web Push — 6b, chờ frontend). Còn lại 2 hạng mục mở, tuỳ người dùng chọn khi muốn tiếp tục:
1. **Xây frontend UI thật** (login, danh sách văn bản, duyệt hồ sơ, kết nối WebSocket nhận thông báo, và làm luôn Web Push/6b khi đó).
2. **Đồng bộ code lên GitHub** — `gh auth login` vẫn chưa hoàn tất xác thực từ phía người dùng; hiện có 7 commit sẵn sàng ở local (Bước 1→6), chưa push.

---

# Frontend UI — Login, danh sách, tạo văn bản, chi tiết/duyệt, WebSocket

## Context
Người dùng chọn xây frontend UI thật, đúng lúc phù hợp vì toàn bộ API backend (Bước 1-6) đã hoàn thiện và kiểm thử. `frontend/` hiện vẫn là scaffold Vite mặc định (logo React/Vite, nút đếm số) — chưa có route, chưa có thư viện routing/state, chỉ có `react`+`react-dom`. `vite.config.ts` đã proxy `/api` → `http://localhost:4000` từ Bước 1.

**Điều chỉnh phạm vi:** giữ Web Push (6b) làm **tăng riêng tiếp theo sau khi frontend core này chạy được** — không gộp vào cùng lượt. Lý do: Web Push cần Service Worker + VAPID keys + model `PushSubscription` mới + endpoint subscribe riêng, là một khối công việc độc lập với kiểm thử khác hẳn (cần trình duyệt thật cấp quyền Notification); gộp chung sẽ làm plan quá tải và khó kiểm chứng từng phần. Đúng tinh thần từng bước nhỏ, kiểm thử được đã áp dụng suốt dự án.

### Quyết định kỹ thuật
- **Thêm `react-router-dom`** (dependency mới duy nhất ngoài các gói UI phụ) — app có 4 màn hình rõ ràng (login/danh sách/tạo mới/chi tiết), cần URL thật để bookmark/back button, hợp lý hơn tự quản lý state chuyển màn hình tay.
- **Không thêm thư viện fetch/state (react-query, zustand...)** — quy mô app nhỏ, `fetch` thuần + `useState`/`useEffect` + 1 `AuthContext` (React Context) là đủ, giữ đúng tinh thần tối giản đã dùng suốt backend.
- **Không thêm UI kit (MUI/Tailwind)** — CSS thuần tối giản, đủ dùng được (form, bảng, badge trạng thái), không phải là mục tiêu thẩm mỹ của dự án nội bộ này.
- **`formData` nhập bằng textarea JSON tự do** — đúng tinh thần JSONB linh hoạt của PLAN.md; PLAN.md không cho danh sách field cụ thể theo từng loại văn bản (PURCHASE cần field gì, PAYMENT cần field gì...) nên xây form động theo từng loại là việc chưa đủ thông tin để làm đúng — giữ nguyên dạng JSON thô cho MVP, dễ mở rộng sau khi có yêu cầu field cụ thể.
- **Đọc `user.role.permissions`/`canApprove` chỉ để ẩn/hiện nút** — đúng nguyên văn PLAN.md mục 2 ("Frontend chỉ đọc thuộc tính giao diện... để ẩn/hiện nút"), không tự quyết định quyền ở client; mọi enforcement thật vẫn ở backend (đã có từ Bước 2-6).
- **WebSocket kết nối thẳng tới backend** (`ws://<hostname>:4000`, tự suy ra `wss://` khi trang chạy HTTPS), không qua Vite dev proxy — vì `WebSocketServer` đã gắn vào toàn bộ `http.Server` không phân biệt path, nên kết nối thẳng đơn giản hơn cấu hình `ws: true` cho Vite proxy. Cookie `SameSite=Strict` vẫn được gửi vì `localhost:5173` và `localhost:4000` cùng site (khác cổng không tính là khác site).

## Kế hoạch triển khai

### 1. Cài dependency
`react-router-dom` (dependency, `frontend/`).

### 2. Cấu trúc file mới trong `frontend/src`
```
api/
  client.ts            # wrapper fetch: credentials include, parse JSON, throw kèm message lỗi backend khi !res.ok
context/
  AuthContext.tsx       # gọi GET /api/auth/me lúc mount; expose {user, loading, login, logout}
hooks/
  useWebSocket.ts        # kết nối ws khi đã đăng nhập; expose lastEvent (message mới nhất đã parse)
components/
  ProtectedRoute.tsx      # redirect /login nếu chưa đăng nhập
  Toast.tsx                # banner nhỏ hiển thị lastEvent, tự ẩn sau vài giây
pages/
  LoginPage.tsx
  DocumentListPage.tsx      # 2 tab: "Của tôi" (GET /api/documents) và "Chờ tôi duyệt" (GET /api/documents/pending)
  CreateDocumentPage.tsx     # title/type/formData(JSON textarea)/file input nhiều file -> multipart POST /api/documents
  DocumentDetailPage.tsx      # chi tiết + attachments (link download) + timeline logs + nút hành động theo canApprove/creatorId + ô comment
```
Viết lại `App.tsx`, `App.css`, `index.css`, `main.tsx` (bỏ toàn bộ boilerplate Vite mặc định: `assets/react.svg`, `vite.svg`, `hero.png`, nút đếm số); `App.tsx` dựng `<AuthProvider><BrowserRouter><Routes>...</Routes></BrowserRouter></AuthProvider>`.

### 3. Luồng trang chi tiết (`DocumentDetailPage.tsx`) — trọng tâm UI
- Fetch `GET /api/documents/:id`; nếu `403`/`404` hiển thị thông báo rõ ràng (không crash).
- Hiển thị: `title`, `type`, `status` (badge màu theo trạng thái), `currentStep`/tổng số bước (`workflow.steps.length`), danh sách `attachments` (link `<a href="/api/documents/:id/attachments/:attachmentId/download">`), timeline `logs` (action + `user.fullName` + `comment` + thời gian, sắp theo thứ tự đã có sẵn từ backend).
- Nút hành động: nếu `canApprove === true` → hiện `Duyệt`/`Từ chối`/`Yêu cầu chỉnh sửa` (2 nút sau mở prompt nhập lý do trước khi gọi API, đúng validate `commentRequiredSchema` backend đã có). Nếu `status === "CHANGES_REQUESTED" && creatorId === user.id` → hiện `Nộp lại`.
- Ô nhập bình luận + nút gửi → `POST /:id/comments`, refetch lại document sau khi gửi thành công.
- `useWebSocket().lastEvent` nếu `documentId` khớp trang đang mở → tự động refetch document (cập nhật timeline/trạng thái theo thời gian thực mà không cần F5).

### 4. `DocumentListPage.tsx`
- 2 tab đơn giản (state cục bộ, không cần route con riêng). Bảng: `title`, `type`, `status`, `currentStep`, link vào chi tiết. Nút "+ Tạo văn bản" chỉ hiện nếu `user.role.permissions.includes("document:create")`.
- `useWebSocket().lastEvent` bất kỳ → refetch lại danh sách đang xem (đơn giản, không cần diff thông minh).

## Kiểm thử / Verification
1. `npx tsc -b` (build check) + `npm run build` (frontend) sạch, không lỗi TypeScript.
2. Chạy song song `npm run dev` (backend, port 4000) và `npm run dev` (frontend, port 5173).
3. Xác nhận bằng `curl http://localhost:5173/` trả về HTML gốc (200) trước khi kiểm thử tương tác.
4. Nếu có công cụ trình duyệt khả dụng (Chrome MCP) trong phiên làm việc: dùng nó để thực sự click qua luồng — đăng nhập bằng `staff@example.com`/`ChangeMe123!`, tạo văn bản, mở bằng `depthead@example.com` ở tab khác để duyệt, xác nhận toast/thông báo thời gian thực xuất hiện không cần F5. Nếu công cụ trình duyệt không khả dụng/không kết nối: báo rõ cho người dùng đây là giới hạn của phiên làm việc và đề nghị người dùng tự mở `http://<server-ip>:5173` để xác nhận bằng mắt, không tự nhận là "đã kiểm thử UI" nếu chỉ dừng ở build-check.
5. Dừng cả 2 dev server sau khi xong; giữ Postgres container chạy.

## Lưu ý
- Web Push (6b) **chưa làm ở lượt này** — sẽ lên kế hoạch riêng ngay sau khi frontend core này chạy ổn, gồm: cài `web-push`, model `PushSubscription`, endpoint subscribe, Service Worker phía frontend, và nút "Bật thông báo" trong UI.
- Không tự thiết kế lại kiến trúc phân quyền — mọi nút ẩn/hiện chỉ là UX, quyền thật vẫn được backend kiểm tra lại như đã có.

---

## Kết quả thực thi Frontend UI (2026-07-16)

> ✅ **TRẠNG THÁI: Frontend core đã hoàn thành và kiểm thử thật qua trình duyệt (không chỉ build-check).**

### Những gì đã tạo ra thực tế
- Cài `react-router-dom` (dependency duy nhất mới).
- `frontend/src/`:
  - `types.ts`: type TypeScript khớp chính xác shape response backend (`User`, `SafeUser`, `Document(Summary|Detail)`, `DocumentLog`, `WorkflowStep`, `WsEvent`).
  - `api/client.ts`: `apiGet`/`apiPost`/`apiPostForm` + `ApiError` (parse `{error}` từ backend).
  - `context/AuthContext.tsx`: gọi `GET /api/auth/me` lúc mount, expose `user/loading/login/logout`.
  - `hooks/useWebSocket.ts`: kết nối thẳng `ws://<hostname>:4000`, expose `lastEvent`.
  - `components/ProtectedRoute.tsx`, `components/Toast.tsx`.
  - `pages/LoginPage.tsx`, `DocumentListPage.tsx` (2 tab + nút tạo có điều kiện theo permission), `CreateDocumentPage.tsx`, `DocumentDetailPage.tsx` (meta + attachments + nút hành động theo `canApprove`/`creatorId` + timeline + ô comment).
  - Viết lại `App.tsx` (router shell), `App.css`, `index.css`; xoá boilerplate Vite mặc định (`assets/react.svg`, `vite.svg`, `hero.png`, `public/icons.svg`, nút đếm số).

### Phát sinh / điều chỉnh so với kế hoạch
- **Phát hiện 1 bug nhỏ có sẵn từ Bước 4** (không liên quan frontend): response JSON trả về ngay từ `POST /:id/approve` (và reject/request-change/resubmit) có `logs` **thiếu đúng entry hành động vừa tạo** — do `tx.document.update({include: {..., logs}})` chạy **trước** `tx.documentLog.create()` trong cùng transaction, nên snapshot `logs` trả về bị "chậm 1 nhịp". Dữ liệu trong DB vẫn đúng tuyệt đối (xác nhận qua `GET /:id` ngay sau đó luôn đầy đủ) — đây chỉ là độ trễ hiển thị trong duy nhất response tức thời của chính hành động đó. Không ảnh hưởng frontend vì `DocumentDetailPage` luôn `fetchDoc()` lại (gọi `GET /:id` mới) sau mỗi hành động thay vì dùng trực tiếp response của action. Không sửa trong lượt này (ngoài phạm vi frontend, để dành sửa riêng nếu cần).
- **Môi trường test đặc biệt**: trình duyệt Chrome MCP kết nối chạy trên máy Windows của người dùng (không phải server) — phải khởi động lại Vite dev server với `--host` để lắng nghe toàn bộ interface, dùng IP LAN thực (`192.168.10.9`) thay vì `localhost`.
- **Sự cố công cụ trình duyệt**: chụp ảnh màn hình (`screenshot`) liên tục timeout ("renderer may be frozen"); mô phỏng click bằng toạ độ/`ref` **không** focus được input trên trang `CreateDocumentPage` (dù `document.elementFromPoint()` xác nhận đúng element nằm đúng vị trí, không bị che — chứng minh đây là lỗi dispatch sự kiện phía trình duyệt từ xa, không phải lỗi code/CSS). Bỏ qua bước giả lập click cho trang này, chuyển sang gọi `fetch()` thật ngay trong console của trang (cùng cookie, cùng origin) để xác nhận `apiPostForm`/multipart hoạt động đúng — vẫn là kiểm thử thật qua trình duyệt, chỉ khác cách kích hoạt request.

### Kết quả kiểm thử (qua trình duyệt Chrome thật, không chỉ build-check)
- `npm run build` (frontend) sạch, không lỗi TypeScript.
- **Login**: điền form thật (click + type qua trình duyệt) → đăng nhập `staff@example.com` thành công → redirect `/documents`.
- **Route guard**: truy cập `/` khi chưa đăng nhập → tự động redirect `/login` (xác nhận `ProtectedRoute` hoạt động).
- **Danh sách văn bản**: hiển thị đúng toàn bộ dữ liệu thật từ các bước test trước (10 văn bản, đúng title/type/status/currentStep); nút "+ Tạo văn bản" hiện đúng (Staff có `document:create`).
- **Chi tiết văn bản**: mở 1 văn bản → hiển thị đúng meta, `attachments` (tên file thật), timeline (`SUBMIT`).
- **Bình luận**: gõ + gửi bình luận qua UI thật → `201`, xuất hiện ngay trong timeline không cần F5.
- **WebSocket real-time (quan trọng nhất)**: trong khi tab trình duyệt của `staff` đang mở trang chi tiết, gọi `POST /:id/approve` bằng `depthead` qua `curl` (mô phỏng một người dùng khác) → tab của `staff` **tự động cập nhật** "Bước 2/2" và thêm dòng "Duyệt" vào timeline **không cần reload thủ công** — xác nhận tích hợp `useWebSocket` + refetch hoạt động đúng thật sự qua trình duyệt, không chỉ qua script giả lập.
- **Tạo văn bản (multipart)**: `fetch()` thật từ trình duyệt (cùng cookie session) → `201`, điều hướng sang trang chi tiết → hiển thị đúng "Không có file đính kèm" (vì không gửi kèm file trong test này) và log `SUBMIT`.
- Đã dừng cả 2 dev server sau khi test xong; Postgres container vẫn `Up ... (healthy)`.

### Bước tiếp theo
1. **Web Push (6b)** — giờ đã có frontend thật, có thể triển khai: `web-push` + VAPID keys + model `PushSubscription` + Service Worker + nút "Bật thông báo".
2. **Đồng bộ code lên GitHub** — vẫn đang chờ `gh auth login` hoàn tất từ phía người dùng.
3. (Tuỳ chọn, không bắt buộc) Sửa bug nhỏ "logs chậm 1 nhịp" trong response tức thời của action endpoints, phát hiện khi test frontend.

---

# Roadmap hoàn thiện dự án (Bước 7-10)

## Context
Người dùng yêu cầu rà soát lại toàn bộ plan và thiết kế các bước còn lại tới khi hoàn thiện theo đúng phạm vi MVP của `PLAN.md`. Đối chiếu `PLAN.md` với thực tế đã làm:

| Hạng mục PLAN.md | Trạng thái |
| :--- | :--- |
| Xác thực JWT HTTP-Only Cookie | ✅ Xong (Bước 2) |
| Mô-đun Văn bản/Yêu cầu (JSONB, upload) | ✅ Xong (Bước 3) |
| Workflow Engine | ✅ Xong (Bước 4, vá lỗi ở 4.5) |
| Comment & Logs | ✅ Xong (Bước 5) |
| Thông báo Realtime (WebSocket) | ✅ Xong (Bước 6) |
| Thông báo Web Push | ⬜ Chưa làm (6b) |
| "Thêm tính năng phân quyền user" (dòng dở trong PLAN.md) | ⬜ Chưa làm — đã hỏi lại, người dùng xác nhận: **trang quản trị user** (tạo/sửa user, gán role+phòng ban qua web, hiện chỉ làm được qua seed script) |
| Đồng bộ code lên GitHub | ⬜ Đang chờ `gh auth login` từ người dùng |

Còn phát hiện thêm 1 bug nhỏ khi test frontend (đã ghi trong "Kết quả thực thi Frontend UI"): response tức thời của `approve`/`reject`/`request-change`/`resubmit` thiếu đúng entry log vừa tạo (do thứ tự transaction), không ảnh hưởng dữ liệu DB, chỉ ảnh hưởng nhất thời phần hiển thị nếu có nơi nào dựa trực tiếp vào response đó — nên sửa dứt điểm cùng đợt.

**Thứ tự thực hiện đề xuất:** Bước 7 (Quản trị user) → Bước 8 (Web Push) → Bước 9 (fix bug logs) → Bước 10 (GitHub, khi người dùng sẵn sàng). Mỗi bước vẫn theo đúng khuôn mẫu đã dùng suốt dự án: thiết kế → code → `tsc`/build → test thật (curl + browser) → cập nhật "Kết quả thực thi" → commit.

---

## Bước 7 — Trang quản trị User

### Quyết định kỹ thuật
- **Không tạo role "Admin" mới** — tái dùng role `Director` đã có (hợp lý nghiệp vụ: cấp cao nhất quản lý nhân sự), chỉ thêm permission mới `"user:manage"` vào `Role.permissions` của `Director` trong seed. Giữ đúng mô hình RBAC hiện có, không phát sinh khái niệm quyền song song.
- **Phạm vi: Create + Read + Update, không làm Delete** — xoá user sẽ vi phạm ràng buộc khoá ngoại với `Document.creatorId`/`DocumentLog.userId` (Prisma mặc định `Restrict`, không cho xoá nếu còn tham chiếu) và cần xử lý side-effect phức tạp (soft-delete, vô hiệu hoá thay vì xoá cứng) — nằm ngoài phạm vi MVP, giữ nhất quán với quyết định "không làm Delete" đã áp dụng ở Document (Bước 3).
- **Email không đổi được sau khi tạo** (MVP) — tránh phức tạp hoá việc kiểm tra trùng lặp khi update; nếu cần đổi email sau này có thể bổ sung riêng.
- **Mật khẩu**: khi tạo user, admin nhập mật khẩu ban đầu trực tiếp (validate tối thiểu 8 ký tự qua zod); khi sửa, trường mật khẩu để trống nghĩa là giữ nguyên, có giá trị thì hash lại và ghi đè.

### Kế hoạch triển khai
**Backend:**
1. `prisma/seed.ts`: thêm `"user:manage"` vào mảng permissions của `Director`.
2. `src/routes/users.ts` (mới): `authenticate` + `authorize("user:manage")` cho toàn bộ route.
   - `GET /` — danh sách user (select loại bỏ `passwordHash`, kèm `role`, `department`).
   - `GET /:id` — chi tiết 1 user.
   - `POST /` — zod validate (`email`, `fullName`, `password` min 8, `roleId`, `departmentId`) → `hashPassword` → `prisma.user.create` → bắt lỗi Prisma `P2002` (email trùng) → `409`.
   - `PATCH /:id` — validate các field tuỳ chọn (`fullName`, `roleId`, `departmentId`, `password?`) → nếu có `password` thì hash lại → `prisma.user.update`.
3. `src/routes/meta.ts` (mới): `GET /api/roles`, `GET /api/departments` — danh sách tra cứu cho dropdown trong form (cùng gate `authorize("user:manage")`, vì hiện chỉ trang admin dùng).
4. Mount `/api/users`, `/api/roles`, `/api/departments` trong `src/index.ts`.

**Frontend:**
5. `src/pages/UserListPage.tsx` — bảng user (fullName/email/role/department), nút "+ Thêm user".
6. `src/pages/UserFormPage.tsx` — dùng chung cho tạo mới (`/users/new`) và sửa (`/users/:id/edit`), dropdown role/department fetch từ `/api/roles`, `/api/departments`.
7. `App.tsx`: thêm route `/users`, `/users/new`, `/users/:id/edit` (đều `ProtectedRoute`).
8. `DocumentListPage.tsx`: thêm link "Quản lý user" trong header, chỉ hiện nếu `user.role.permissions.includes("user:manage")`.

### Kiểm thử / Verification
1. `tsc --noEmit` (backend) + `npm run build` (frontend) sạch.
2. `curl`: `staff` gọi `GET /api/users` → `403`. `director` gọi → `200`, danh sách đúng, không có `passwordHash`.
3. `director` tạo user mới qua `POST /api/users` → `201` → login thử bằng tài khoản vừa tạo → thành công.
4. Tạo trùng email → `409`.
5. `director` sửa role của 1 user qua `PATCH /api/users/:id` → xác nhận qua `psql`/GET lại.
6. Test qua Chrome MCP thật (đã kết nối sẵn trong phiên): login `director`, vào `/users`, tạo user mới qua form, xác nhận xuất hiện trong danh sách.
7. Dừng dev server, cập nhật "Kết quả thực thi", commit.

---

## Bước 8 — Web Push (6b)

### Quyết định kỹ thuật
- **`web-push`** (thư viện chuẩn Node cho Push API/VAPID) — sinh cặp khoá VAPID một lần (`web-push generate-vapid-keys`), lưu vào `.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) — không commit khoá thật vào `.env.example` (chỉ để placeholder).
- **Model mới `PushSubscription`** (`userId`, `endpoint` @unique, `p256dh`, `auth`, `createdAt`) — migration mới, không đổi model khác.
- **Gộp WS + Push vào 1 điểm gọi**: refactor `notifyUsers()` thành `notify()` trong `src/lib/notifications.ts` (hoặc file mới `src/lib/notify.ts`) gọi cả `notifyUsers` (WS, đã có) và `sendPushToUsers` (mới) — tránh phải sửa lặp lại cả 6 điểm gọi trong `documents.ts` thêm lần nữa.
- **Tự dọn subscription hỏng**: nếu `webpush.sendNotification` trả lỗi `statusCode` 404/410 (subscription hết hạn/bị thu hồi), xoá luôn record đó khỏi DB — tránh tích rác theo thời gian.
- **Frontend**: `public/service-worker.js` (lắng nghe `push`, gọi `showNotification`; `notificationclick` focus lại tab), hook `usePushNotifications()` đăng ký Service Worker + xin quyền + subscribe, nút "Bật thông báo" (chỉ hiện nếu `Notification.permission !== "granted"`).
- **Khoá công khai VAPID lấy qua API** (`GET /api/push/public-key`, không cần đăng nhập) thay vì hardcode vào build frontend — đơn giản hoá quản lý cấu hình.

### Kế hoạch triển khai
**Backend:**
1. Cài `web-push` (+ chạy CLI sinh cặp khoá VAPID, lưu vào `.env`/`.env.example` của backend).
2. `prisma/schema.prisma`: thêm model `PushSubscription`, `npx prisma migrate dev --name add_push_subscription`.
3. `src/routes/push.ts` (mới): `GET /public-key` (không cần auth), `POST /subscribe` (`authenticate`, upsert theo `endpoint`), `DELETE /subscribe` (`authenticate`, xoá theo `endpoint`).
4. `src/lib/notify.ts` (mới, hoặc mở rộng `notifications.ts`): `sendPushToUsers(userIds, payload)` dùng `web-push`, tự xoá subscription hỏng.
5. Sửa 6 điểm gọi `notifyUsers(...)` trong `documents.ts` thành gọi hàm `notify()` gộp cả WS+Push.

**Frontend:**
6. `public/service-worker.js`.
7. `src/hooks/usePushNotifications.ts`: đăng ký SW, xin quyền, subscribe, POST subscription lên backend.
8. Nút "Bật thông báo" trong `DocumentListPage.tsx` (hoặc header chung).

### Kiểm thử / Verification
1. `tsc --noEmit` + build frontend sạch. Migration áp dụng thành công.
2. Test qua Chrome MCP thật (đã xác nhận khả dụng trong phiên này): đăng nhập, bấm "Bật thông báo", xác nhận trình duyệt hiện prompt xin quyền, chấp nhận, xác nhận `POST /subscribe` thành công (kiểm qua `psql` có record `PushSubscription`).
3. Kích hoạt 1 sự kiện (vd. duyệt hồ sơ qua `curl` từ user khác) → xác nhận `web-push` gọi thành công (log phía server hoặc absence của lỗi) gửi tới subscription vừa tạo.
4. **Giới hạn khách quan cần nêu rõ**: xác nhận toast/notification **hệ điều hành** thật sự hiện trên desktop Windows của người dùng nằm ngoài khả năng quan sát của tôi (notification hệ điều hành không nằm trong viewport trình duyệt) — sẽ báo rõ đã test được tới đâu (subscribe thành công + server gọi API push không lỗi) và đề nghị người dùng tự xác nhận phần hiển thị notification cuối cùng.
5. Dừng dev server, cập nhật "Kết quả thực thi", commit.

---

## Bước 9 — Fix bug nhỏ: logs thiếu entry vừa tạo trong response tức thời

### Nguyên nhân & cách sửa
Trong `approve`/`reject`/`request-change`/`resubmit`, thứ tự hiện tại là `tx.document.update({include: {logs}})` **rồi mới** `tx.documentLog.create(...)` — nên `include.logs` trong kết quả trả về bị chụp ảnh trước khi log mới tồn tại. Sửa: đảo thứ tự — gọi `tx.documentLog.create(...)` **trước**, rồi mới `tx.document.update({include: {logs}})`, để `include` phản ánh đúng log vừa tạo (dữ liệu trong DB vốn đã đúng, chỉ là thứ tự đọc/ghi trong transaction).

### Kiểm thử / Verification
1. `tsc --noEmit` sạch.
2. `curl`: gọi `approve` → kiểm tra ngay response JSON trả về có chứa entry `APPROVE` vừa tạo trong mảng `logs` (trước đây thiếu). Lặp lại tương tự cho `reject`/`request-change`/`resubmit`.
3. Smoke test lại luồng GENERAL đầy đủ để đảm bảo không regression.
4. Cập nhật "Kết quả thực thi", commit.

---

## Bước 10 — Đồng bộ code lên GitHub

Không đổi kế hoạch — vẫn chờ người dùng hoàn tất `gh auth login` (đã cài `gh` CLI, đã dựng sẵn lịch sử commit theo từng bước ở local). Khi người dùng xác nhận đăng nhập xong, chỉ cần: `gh repo create --private`, thêm remote, `git push`.

## Lưu ý chung
- Sau khi xong Bước 7-9, roadmap MVP theo đúng `PLAN.md` coi như **hoàn thiện toàn bộ** (trừ việc đồng bộ GitHub phụ thuộc hành động của người dùng).
- Không mở rộng thêm phạm vi ngoài những gì `PLAN.md` và người dùng đã xác nhận (vd. không tự thêm tính năng deactivate user, không tự thêm self-service đổi mật khẩu) — nếu cần, coi là yêu cầu mới, sẽ lên kế hoạch riêng.

---

## Kết quả thực thi Bước 7 (2026-07-16)

> ✅ **TRẠNG THÁI: Bước 7 (Trang quản trị User) đã hoàn thành và kiểm thử.**

### Những gì đã tạo ra thực tế
**Backend:**
- `prisma/seed.ts`: thêm `"user:manage"` vào permissions của `Director`.
- `src/routes/users.ts` (mới): `router.use(authenticate, authorize("user:manage"))` áp cho toàn bộ route. `GET /`, `GET /:id`, `POST /` (zod validate + `hashPassword` + bắt `P2002` → `409` "Email đã tồn tại"), `PATCH /:id` (field tuỳ chọn, `password` có thì hash lại; bắt `P2025` → `404` cục bộ, không để lọt xuống error handler chung vốn trả message dành riêng cho Document).
- `src/routes/meta.ts` (mới): `GET /api/roles`, `GET /api/departments`, cùng gate `user:manage`.
- Mount `/api/users`, `/api/roles`, `/api/departments` trong `src/index.ts`.

**Frontend:**
- `src/pages/UserListPage.tsx`: bảng user + nút "+ Thêm user" + link "Sửa" từng dòng.
- `src/pages/UserFormPage.tsx`: dùng chung tạo/sửa; tự thêm hàm `apiPatch` cục bộ (chỉ dùng ở đây, không mở rộng `api/client.ts` cho 1 verb dùng 1 nơi); email khoá khi sửa; mật khẩu bắt buộc khi tạo, tuỳ chọn khi sửa.
- `App.tsx`: thêm route `/users`, `/users/new`, `/users/:id/edit`.
- `DocumentListPage.tsx`: thêm link "Quản lý user" trong header, chỉ hiện nếu `user.role.permissions.includes("user:manage")`.

### Phát sinh / điều chỉnh so với kế hoạch
Không có sai lệch kỹ thuật. Gặp lại đúng sự cố môi trường đã ghi nhận ở Frontend UI trước đó: mô phỏng click trên trang `/login` (tab trình duyệt cũ tái sử dụng từ phiên trước) không focus được input — xác nhận lại đây là vấn đề dispatch sự kiện phía trình duyệt từ xa (không phải lỗi code, đã từng điều tra kỹ ở bước trước). Dùng lại giải pháp gọi `fetch()` thật trong console trang để đăng nhập `director`, sau đó điều hướng bằng URL trực tiếp để xem các trang — vẫn là kiểm thử qua trình duyệt thật (đúng cookie, đúng origin), chỉ khác cách kích hoạt request/điều hướng thay vì click.

### Kết quả kiểm thử (toàn bộ PASS)
- `tsc --noEmit` (backend) + `npm run build` (frontend) sạch.
- `curl`: `staff` (không có `user:manage`) → `403`. `director` → `200`, danh sách đầy đủ, không có `passwordHash`.
- `director` tạo user mới → `201` → login thử bằng tài khoản đó → `200` thành công.
- Tạo trùng email → `409 {"error":"Email đã tồn tại"}`.
- `director` `PATCH` đổi role user vừa tạo (Staff → Dept_Head) → `200`, phản ánh đúng ngay trong response.
- Qua Chrome MCP thật: login `director` (qua `fetch()` do click bị lỗi môi trường) → `/documents` hiện đúng link "Quản lý user" → `/users` hiển thị đúng 5 user (kể cả user vừa tạo/sửa role qua curl) → `/users/new` render đúng dropdown role/department từ API → `/users/:id/edit` tự điền đúng dữ liệu hiện có, email bị khoá đúng thiết kế.
- Đã dừng cả 2 dev server sau khi test; Postgres container vẫn `Up ... (healthy)`.

### Bước tiếp theo
Bước 8 (Web Push — 6b) chưa bắt đầu, sẽ triển khai tiếp theo đúng lộ trình đã duyệt.
