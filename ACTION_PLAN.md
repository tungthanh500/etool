# ACTION PLAN — Đợt bổ sung tính năng (lập 2026-07-16, GMT+7)

> **Cách dùng tài liệu này:** Làm tuần tự theo Giai đoạn 0 → 4. Mỗi mục có tiêu chí nghiệm thu riêng.
> **Quy trình bắt buộc sau khi HOÀN THÀNH mỗi mục:** (1) đánh dấu `[x]` tại đây, (2) ghi kết quả chi tiết vào `IMPLEMENTATION_PLAN.md` như mọi khi (đã làm gì, file nào, kết quả test), (3) nếu mục đó fix một R-item thì cập nhật trạng thái `[ĐÃ FIX — ngày, commit]` trong `EXISTING-BUG.md`.
> Nguồn gốc: chốt với người dùng ngày 2026-07-16 — gộp Nhóm 1 + Nhóm 2 (đánh số văn bản **không dùng dấu "/"**, chỉ số liền hoặc dấu `-`) + Nhóm 3 (bỏ mục email notification) + Nhóm 4 (bảo mật) + đóng dấu PDF (phương án 1).

---

## Giai đoạn 0 — Bảo mật trước go-live (fix các R-item trong EXISTING-BUG.md)

### [x] 0.1 — JWT_SECRET mạnh (R01) — HOÀN THÀNH 2026-07-16
- Sinh `openssl rand -hex 64`, thay vào `backend/.env`; cập nhật `.env.example` ghi chú cách sinh.
- **Nghiệm thu:** đăng nhập lại hoạt động; token ký bằng secret cũ bị 401.

### [x] 0.2 — Mật khẩu Postgres + bind localhost (R02) — HOÀN THÀNH 2026-07-16
- Làm ĐÚNG THỨ TỰ đã ghi trong EXISTING-BUG.md (ALTER USER trên container đang chạy → sửa 2 file .env → đổi port mapping `127.0.0.1:5432:5432` → `docker compose up -d`).
- **Nghiệm thu:** backend kết nối lại OK; từ máy khác trong LAN không telnet được cổng 5432.

### [x] 0.3 — Guard seed script (R03) — HOÀN THÀNH 2026-07-16
- Đầu `main()` của `backend/prisma/seed.ts`: nếu `NODE_ENV === "production"` và không có `FORCE_SEED=1` → in lỗi, exit 1.
- **Nghiệm thu:** `NODE_ENV=production npm run prisma:seed` bị chặn; có `FORCE_SEED=1` thì chạy.

### [x] 0.4 — Rate limiting login (R04) — HOÀN THÀNH 2026-07-16
- Cài `express-rate-limit`, áp riêng cho `POST /api/auth/login` (vd. 10 lần / 15 phút / IP). Trả 429 message tiếng Việt.
- **Nghiệm thu:** curl sai mật khẩu 11 lần liên tiếp → lần 11 nhận 429; audit vẫn ghi LOGIN_FAILED cho các lần trước đó.

### [x] 0.5 — Helmet (R05) — HOÀN THÀNH 2026-07-16
- Cài `helmet`, `app.use(helmet())` trước các route. Kiểm tra không phá WebSocket/download file.
- **Nghiệm thu:** response có các header bảo mật; toàn bộ luồng cũ (login, download, WS) vẫn chạy.

### [x] 0.6 — Kiểm tra MIME theo magic bytes (R07) — HOÀN THÀNH 2026-07-16
- Dùng gói `file-type` đọc buffer đầu file sau khi multer ghi xong; loại file có nội dung không khớp danh sách cho phép (xoá file + 400). Giữ nguyên check phần mở rộng hiện có làm lớp 1.
- **Nghiệm thu:** đổi tên file `.exe` thành `.pdf` rồi upload → bị 400 và không còn file rác trong UPLOAD_DIR.

### [ ] 0.7 — HTTPS (R06) — GHI NHẬN, làm lúc triển khai
- Không code trong đợt này. Khi go-live: đặt reverse proxy (Caddy/nginx) cấp TLS, bật `secure: true` cookie qua `NODE_ENV=production`. Ghi hướng dẫn vào IMPLEMENTATION_PLAN khi đến bước triển khai.

---

## Giai đoạn 1 — Tài khoản cá nhân

### [x] 1.1 — Tự đổi mật khẩu + trang "Tài khoản của tôi" — HOÀN THÀNH 2026-07-16
- **Backend:** `POST /api/auth/change-password` (authenticate; body `{oldPassword, newPassword}` — zod min 8; verify oldPassword bằng `comparePassword`, sai → 400 "Mật khẩu hiện tại không đúng"). Audit `AUTH / PASSWORD_CHANGE`.
- **Frontend:** trang `/account` (route mới) hiển thị thông tin bản thân (họ tên, email, vai trò, phòng ban — chỉ đọc) + form đổi mật khẩu (mật khẩu cũ, mới, nhập lại). Link từ AppLayout (menu user).
- **Nghiệm thu:** đổi thành công → đăng xuất/đăng nhập bằng mật khẩu mới OK; mật khẩu cũ sai → báo lỗi; audit có entry.

### [x] 1.2 — Buộc đổi mật khẩu lần đầu (`mustChangePassword`) — HOÀN THÀNH 2026-07-16
- **Migration:** cột `User.mustChangePassword Boolean @default(false)`.
- **Backend:** set `true` khi Admin tạo user hoặc Admin reset mật khẩu người khác (users.ts POST/PATCH); seed users cũng `true` (trừ khi đang dev). `change-password` thành công → set `false`. Trả cờ này trong safe user (login + /me).
- **Frontend:** sau đăng nhập nếu `mustChangePassword` → redirect cưỡng bức về `/account?force=1`, chặn điều hướng sang trang khác tới khi đổi xong.
- **Nghiệm thu:** Admin tạo user mới → user đó đăng nhập bị ép đổi mật khẩu, đổi xong mới vào được danh sách văn bản.

### [x] 1.3 — Admin sửa email user — HOÀN THÀNH 2026-07-16
- `updateUserSchema` (users.ts) thêm `email: z.string().email().optional()`; PATCH bắt P2002 → 409 "Email đã tồn tại" (như POST). UserFormPage mở khoá ô email khi sửa.
- **Nghiệm thu:** sửa email OK, đăng nhập bằng email mới; sửa trùng email → 409.

### [x] 1.4 — Vô hiệu hoá tài khoản (`isActive`) (R11) — HOÀN THÀNH 2026-07-16
- **Migration:** `User.isActive Boolean @default(true)`.
- **Backend:** login từ chối user `isActive=false` (401 cùng message chung, audit `LOGIN_FAILED` kèm detail "tài khoản bị vô hiệu hoá"); middleware `authenticate` cũng chặn (user bị khoá giữa phiên → 401). users.ts PATCH nhận `isActive`; audit `USER / USER_DISABLE` / `USER_ENABLE`. Không cho tự khoá chính mình.
- **Frontend:** UserListPage hiện badge trạng thái + nút Khoá/Mở khoá; UserFormPage toggle.
- **Nghiệm thu:** khoá user → user đó đăng nhập bị 401, phiên đang mở gọi API bị 401; lịch sử duyệt/log cũ của user vẫn hiển thị bình thường.

### [ ] 1.5 — Quên mật khẩu qua email (PHỤ THUỘC SMTP — làm cuối giai đoạn, có thể hoãn) — HOÃN 2026-07-16
- Vì đã bỏ mục "thông báo qua email" (Nhóm 3 cũ), đây là chỗ DUY NHẤT cần SMTP. Nếu chưa có tài khoản SMTP nội bộ → **hoãn mục này** (fallback hiện có: Admin reset mật khẩu + cờ 1.2 ép đổi lại), ghi rõ vào IMPLEMENTATION_PLAN.
- Khi làm: `nodemailer` + env `SMTP_*`; model `PasswordResetToken(id, userId, tokenHash, expiresAt, usedAt)`; `POST /api/auth/forgot-password` (luôn trả 200 để không lộ email tồn tại) + `POST /api/auth/reset-password`; token 1 lần, hạn 30 phút; audit đủ. Trang `/forgot-password`, `/reset-password`.
- **Đã chốt hoãn ở đợt Giai đoạn 1 này** — chưa có tài khoản SMTP nội bộ. Fallback đang dùng: Admin reset mật khẩu qua `PATCH /api/users/:id` (đã tự động set `mustChangePassword=true` từ mục 1.2) — đủ dùng cho vận hành nội bộ hiện tại.

### [x] 1.6 — Chữ ký mẫu: upload & quản lý (chuẩn bị cho mục 2.5) — HOÀN THÀNH 2026-07-16
- **Migration:** `User.signatureUrl String?` (đường dẫn file ảnh chữ ký trong UPLOAD_DIR, null = chưa có).
- **Backend:** `POST /api/auth/signature` (authenticate, multipart 1 ảnh) — chỉ nhận `image/png` / `image/jpeg`, kiểm magic bytes (dùng chung `file-type` của mục 0.6), giới hạn kích thước (vd. 1MB); ghi đè chữ ký cũ (xoá file cũ). `DELETE /api/auth/signature` gỡ chữ ký. Trả `signatureUrl` (hoặc cờ `hasSignature`) trong safe user. Audit `USER / SIGNATURE_SET|SIGNATURE_CLEAR`.
- **Frontend:** trong trang `/account` (mục 1.1) thêm mục "Chữ ký mẫu": preview ảnh hiện tại, nút Tải lên / Xoá, ghi chú khuyến nghị **PNG nền trong suốt** để không che nội dung khi đóng vào PDF.
- **Ghi chú xác thực (QUYẾT ĐỊNH — chốt 2026-07-16):** ảnh chữ ký + con dấu chỉ là dấu hiệu trực quan, KHÔNG chống giả mạo. Người dùng xác nhận **chấp nhận điều này** vì phê duyệt nội bộ — nguồn xác thực là bản ghi hệ thống (`DocumentLog` + `AuditLog`: user ID + timestamp), không phải con dấu trên file. **Bỏ hẳn phương án 2 (QR + SHA-256) và phương án 3 (chữ ký số PAdES)** — không xét lại trừ khi có nhu cầu pháp lý với bên ngoài. **Đánh đổi:** độ tin của "tên người duyệt hệ thống trả ra" phụ thuộc vào bảo mật đăng nhập → **Giai đoạn 0 (nhất là 0.1 JWT_SECRET) là điều kiện tiên quyết**. Lưu ý vận hành: PDF đã tải về/in ra rời hệ thống thì sửa được — luôn coi app là nơi tra cứu cuối cùng khi cần chắc chắn.
- **Nghiệm thu:** upload PNG → preview đúng; upload file không phải ảnh → 400; xoá → mất preview; `/me` phản ánh trạng thái có/không chữ ký.

---

## Giai đoạn 2 — Luồng văn bản

### [x] 2.1 — Sửa nội dung khi CHANGES_REQUESTED (ưu tiên cao nhất về nghiệp vụ) — HOÀN THÀNH 2026-07-16
- **Backend:** `PATCH /api/documents/:id` — chỉ creator + chỉ khi `status === "CHANGES_REQUESTED"`; multipart cho phép: sửa `title`/`formData`, thêm file mới, xoá attachment cũ (danh sách `removeAttachmentIds`, chỉ xoá kind ORIGINAL, xoá cả file vật lý). Ghi `DocumentLog action="EDIT"` + audit `DOCUMENT / EDIT` và `FILE_UPLOAD`/`FILE_DELETE` tương ứng. Resubmit giữ nguyên là bước riêng (sửa xong bấm Nộp lại).
- **Frontend:** DocumentDetailPage — khi là creator và trạng thái CHANGES_REQUESTED, hiện nút "Chỉnh sửa" mở form (tái dùng form của CreateDocumentPage ở mức hợp lý). Timeline hiển thị action EDIT (thêm nhãn vào `lib/labels.ts`).
- **Nghiệm thu:** luồng đầy đủ: nộp → yêu cầu chỉnh sửa → creator sửa tiêu đề + thay file → nộp lại → người duyệt thấy nội dung mới, timeline có EDIT; người không phải creator PATCH → 403; PATCH khi PENDING → 400.

### [x] 2.2 — Thu hồi văn bản (WITHDRAWN) — HOÀN THÀNH 2026-07-16
- **Backend:** `POST /api/documents/:id/withdraw` — creator, chỉ khi PENDING; status → `"WITHDRAWN"`; log `WITHDRAW` + audit; notify người duyệt hiện tại. Cho phép creator nộp lại từ WITHDRAWN? **Không** — muốn trình lại thì tạo văn bản mới (đơn giản, tránh rối engine). Ghi rõ quyết định này khi làm.
- **Frontend:** nút "Thu hồi" (confirm) cho creator khi PENDING; badge trạng thái mới (labels + màu); WITHDRAWN không xuất hiện trong hàng chờ duyệt.
- **Nghiệm thu:** thu hồi OK, biến khỏi `/pending` của người duyệt; duyệt/từ chối văn bản đã thu hồi → 400.

### [x] 2.3 — Số văn bản tự động (docNo) — HOÀN THÀNH 2026-07-16
- **Định dạng đã chốt với người dùng: KHÔNG dùng dấu "/"** → dùng `VB-YYYY-NNNN` (vd. `VB-2026-0012`), sequence reset theo năm.
- **Migration:** `Document.docNo String? @unique` (nullable để văn bản cũ không vỡ) + model `DocCounter(year Int @id, seq Int)`.
- **Backend:** cấp số trong transaction tạo document: `tx.docCounter.upsert({where:{year}, create:{year, seq:1}, update:{seq:{increment:1}}})` rồi format — upsert increment là atomic, không đua số. Backfill văn bản cũ bằng script một lần (theo thứ tự createdAt).
- **Frontend:** hiện docNo ở danh sách + chi tiết + tiêu đề trang.
- **Nghiệm thu:** tạo 2 văn bản liên tiếp → số liền nhau, không trùng khi tạo đồng thời (test 5 request song song); văn bản cũ sau backfill có số.

### [x] 2.4 — Đóng dấu "ĐÃ PHÊ DUYỆT" lên PDF (phương án 1 — LÀM SAU 2.3 vì dấu in kèm docNo) — HOÀN THÀNH 2026-07-17
- **Cài:** `pdf-lib`, `@pdf-lib/fontkit` + font TTF Unicode (DejaVu Sans — có sẵn trên máy qua gói hệ thống `fonts-dejavu-core`, không cần tải, hỗ trợ đủ dấu tiếng Việt, đặt trong `backend/assets/fonts/`).
- **Backend:** `lib/stamp.ts` — hàm nhận buffer PDF gốc + thông tin (docNo, danh sách người duyệt theo thứ tự) → trả buffer PDF mới.
- **THAY ĐỔI THIẾT KẾ so với kế hoạch gốc (phát hiện qua test thật):** dự kiến ban đầu vẽ khung dấu đè lên góc trên-phải TRANG ĐẦU — khi test với PDF thật, chữ dấu **chồng lên nội dung gốc** của trang (không biết trước bố cục PDF người dùng upload để né chỗ trống). Đã sửa: dấu "ĐÃ PHÊ DUYỆT" đặt trên **1 trang bìa riêng chèn ở đầu tài liệu** (`insertPage(0, ...)`) thay vì vẽ đè — không bao giờ chồng lấn nội dung thật, nhất quán với cách làm an toàn đã dùng cho khối chữ ký (2.5).
- **Luồng:** trong route approve, khi `isFinalApproval` và người duyệt KHÔNG upload bản ký tay: với mỗi attachment ORIGINAL là `application/pdf`, sinh bản đóng dấu, lưu file mới vào UPLOAD_DIR, tạo `Attachment kind="APPROVED"` (fileName gốc + hậu tố `-da-duyet.pdf`). File không phải PDF: bỏ qua. Giữ nguyên file gốc. Đóng dấu lỗi → không chặn duyệt, chỉ log lỗi (`try/catch` bọc toàn bộ `autoStampApprovedPdfs`).
- Đóng dấu chạy SAU transaction duyệt; response route refetch document để trả về đủ attachment mới sinh.
- **Frontend:** không cần sửa — mục "Bản đã duyệt" đã tự hiển thị mọi attachment `kind="APPROVED"`.
- **Nghiệm thu:** đã test qua curl + render PDF thật ra ảnh (`pdftoppm`) để xem bằng mắt — xem chi tiết Bước 18 trong `IMPLEMENTATION_PLAN.md`.

### [x] 2.5 — Đóng khối chữ ký của người duyệt vào PDF (mở rộng 2.4, phụ thuộc 1.6) — HOÀN THÀNH 2026-07-17
- **Ý tưởng:** luồng duyệt nhiều bước → không phải 1 chữ ký mà là chữ ký của TỪNG người đã duyệt. Gộp vào **một lần sinh file** ở bước duyệt cuối (không sửa PDF ở từng bước — tránh file rác/độ phức tạp).
- **Backend (`lib/stamp.ts`):** dựng **trang phụ lục chữ ký riêng** ở cuối tài liệu (không cố chèn vào đáy trang cuối có sẵn — cùng lý do an toàn chồng lấn như 2.4): duyệt các log `APPROVE` theo thứ tự, mỗi người vẽ ảnh chữ ký (`embedPng`/`embedJpg`, scale giữ tỉ lệ) nếu `signatureUrl` có, ngược lại khung "(Chưa có chữ ký mẫu)" — kèm họ tên + vai trò (dịch tiếng Việt) + "Duyệt lúc: ..." GMT+7. Tự thêm trang phụ lục kế tiếp nếu danh sách người duyệt dài hơn 1 trang.
- **Quyết định thiết kế:** stamp toàn bộ chữ ký một lần ở bước cuối (không tăng dần từng bước). Người duyệt chưa có chữ ký mẫu → vẫn duyệt được bình thường, chỉ hiện dạng chữ trên PDF. Người duyệt cuối tự upload bản ký tay → bỏ qua toàn bộ auto-stamp (2.4 lẫn 2.5).
- **Nghiệm thu (qua curl thật + xem PDF render ra ảnh):** flow GENERAL 2 bước, 1 người có chữ ký PNG + 1 người chưa có → trang phụ lục hiện đúng 2 dòng, đúng thứ tự, đúng giờ GMT+7, người có chữ ký hiện ảnh, người chưa có hiện khung fallback; tên có dấu tiếng Việt đầy đủ (font DejaVu). Case bổ sung: người duyệt cuối tự upload bản ký tay → không sinh bản auto-stamp (chỉ 1 file APPROVED, đúng file thủ công); văn bản có cả PDF + docx → chỉ PDF được đóng dấu, docx giữ nguyên không lỗi.

---

## Giai đoạn 3 — Quản trị & tra cứu

### [x] 3.1 — CRUD Phòng ban — HOÀN THÀNH 2026-07-17
- **Backend:** `routes/departments.ts` (authenticate + authorize `user:manage`): GET, POST, PATCH đổi tên, DELETE (chặn 409 nếu còn user thuộc phòng ban qua bắt lỗi Prisma P2003). Audit dùng chung category `USER` (không thêm category riêng — nhất quán với `USER_CREATE`/`USER_UPDATE` đã có, tránh phình `AuditCategory` cho một entity phụ): `DEPT_CREATE`/`DEPT_UPDATE`/`DEPT_DELETE`. Route `GET /departments` cũ ở `meta.ts` đã bị xoá, chuyển hẳn về router riêng.
- **Frontend:** trang `/departments` (bảng + modal tạo/sửa dùng `Input` một dòng, `ConfirmDialog` khi xoá), menu trong `AppLayout` cạnh "Quản lý user" (cùng điều kiện hiển thị `canManageUsers`).
- **Nghiệm thu (qua curl thật):** tạo OK; tạo trùng tên → 409 "Tên phòng ban đã tồn tại"; sửa tên OK; xoá phòng ban trống → 204; xoá phòng ban còn user (`Ban Giám đốc`) → 409 "Không thể xoá: vẫn còn user thuộc phòng ban này"; Staff gọi API → 403.

### [x] 3.2 — Tìm kiếm + lọc + phân trang danh sách văn bản (R10, kèm R09 một phần) — HOÀN THÀNH 2026-07-17
- **Backend:** helper dùng chung `parseListQuery()` trong `routes/documents.ts` đọc `q`/`status`/`from`/`to`/`page`/`limit` từ query string. `GET /api/documents` (danh sách của tôi): lọc + phân trang **thật ở DB** (`prisma.document.count()` cùng `where`), `q` tìm `title` OR `docNo` (insensitive), `status` khớp 1 trong 6 giá trị enum hợp lệ (giá trị lạ bị bỏ qua, không lỗi), `from`/`to` là ngày `YYYY-MM-DD` hiểu theo lịch GMT+7 (helper mới `dayStartVN`/`dayEndVN` trong `lib/dateUtils.ts`, ghép thẳng offset `+07:00` vào chuỗi ISO). `GET /api/documents/pending`: đẩy xuống DB được phần lọc thô "role của mình xuất hiện ở workflow" (`workflow.steps.some({approverRole})`) để giảm tập cần tải, nhưng điều kiện chính xác (đúng bước hiện tại + Dept_Head cùng phòng ban — xem `lib/workflow.ts`) **không thể diễn đạt trong Prisma `where`** vì so sánh 2 cột khác bảng (`currentStep` của Document với `stepOrder` của WorkflowStep) → vẫn hậu kiểm bằng `isCurrentApprover()` ở app layer, `total`/phân trang của riêng route này tính trên mảng đã lọc trong bộ nhớ (không phải `COUNT(*)` DB thật như route "/"). **Giới hạn đã ghi rõ trong code comment** — chấp nhận được ở quy mô nội bộ hiện tại, chưa đủ số liệu để cần tối ưu thêm.
- **Frontend:** `DocumentListPage.tsx` thêm thanh lọc (`list-filters`): ô tìm kiếm có icon, `Select` trạng thái (dùng `STATUS_LABELS` có sẵn), 2 `Input type="date"` cho khoảng ngày; đổi bất kỳ lọc nào (trừ nút phân trang) tự reset về trang 1. Toàn bộ state lọc lưu trong `useSearchParams` (URL) — tái dùng đúng pattern phân trang của `AuditLogPage.tsx`. Response shape đổi từ mảng thô sang `{items, total, page, limit}` (`types.ts` thêm `DocumentListResponse`) — đã rà soát, không còn nơi nào khác trong frontend tiêu thụ shape mảng cũ của 2 endpoint này.
- **Nghiệm thu (qua curl thật, có tạo/xoá document test):** tạo văn bản `GENERAL` → tìm theo tiêu đề (`q`) ra đúng 1 kết quả; tìm theo `docNo` (`VB-2026-0001`) ra đúng; lọc `status=PENDING` đúng total; lọc theo ngày hôm nay ra đúng, lọc từ ngày mai → 0 (đúng biên GMT+7); `status=FOO` (giá trị không hợp lệ) → không lỗi, trả về không lọc; `depthead` thấy hồ sơ trong `/pending`, duyệt xong (`currentStep` sang 2) → không còn thấy trong `/pending` của chính mình; `director` duyệt bước cuối → `status=APPROVED`; `staff` lọc lại `status=APPROVED` ra đúng 1. Dọn document test khỏi DB bằng `psql` thủ công sau khi test xong (không có endpoint xoá document theo đúng thiết kế nghiệp vụ — chỉ có `withdraw`).

### [x] 3.3 — Dashboard + xuất Excel — HOÀN THÀNH 2026-07-17
- **Backend:** `routes/dashboard.ts` mới — `GET /api/dashboard` (authenticate): `myByStatus` (groupBy status của hồ sơ mình tạo, chuẩn hoá đủ 6 khoá), `myTotal`, `pendingForMe` (lọc thô theo role ở DB + hậu kiểm `isCurrentApprover`), `monthly` (6 tháng gần nhất GMT+7 qua helper mới `lastSixMonthsVN`; Admin đếm toàn hệ thống, user thường đếm của mình). Chỉ Admin (quyền `*`) nhận thêm `allByStatus`/`allTotal`/`byDepartment`. `GET /api/documents/export` (authorize `document:read:own`, đăng ký TRƯỚC `/:id`): dùng lại `parseListQuery` nên xuất đúng phạm vi (`creatorId`) + đúng bộ lọc `q/status/from/to` đang áp, KHÔNG phân trang; sinh `.xlsx` bằng `exceljs` với cột Số VB / Tiêu đề / Loại / Trạng thái / Người tạo / Ngày tạo / Ngày duyệt cuối (nhãn tiếng Việt qua `lib/labels.ts` mới của backend, ngày GMT+7 qua `formatDateTimeVN`). Audit `FILE / EXPORT`.
- **Frontend:** trang `/dashboard` (`DashboardPage.tsx`) làm trang chủ sau đăng nhập (đổi redirect ở `LoginPage` + `App.tsx` catch-all → `/dashboard`): 6 stat card (Chờ tôi duyệt / Văn bản của tôi / Đã duyệt / Đang chờ / Cần chỉnh sửa / Bị từ chối), biểu đồ cột theo tháng bằng **CSS thuần** (không thêm thư viện chart), khối "Thống kê toàn hệ thống" (badge theo trạng thái + bảng theo phòng ban) chỉ hiện với Admin. Menu "Tổng quan" (icon `LayoutDashboard`) ở đầu sidebar. Nút "Xuất Excel" ở `DocumentListPage` (tab "Của tôi"), tải file qua helper mới `apiDownload` trong `client.ts` (fetch→blob→anchor, đọc filename từ `Content-Disposition`, ném `ApiError` nếu lỗi để toast).
- **Nghiệm thu (curl + trình duyệt thật):** dashboard số liệu khớp DB cho 3 role — Staff (myTotal đúng, pendingForMe=0), Dept_Head (pendingForMe=3 khi có 3 hồ sơ chờ ở bước của mình), Admin (allTotal + byDepartment đúng, monthly gom đúng tháng hiện tại GMT+7). File Excel: parse lại bằng `exceljs` OK, đúng 7 cột + nhãn tiếng Việt, "Ngày duyệt cuối" chỉ điền cho hồ sơ APPROVED, lọc `q` truyền vào export ra đúng tập con. **Đã đăng nhập thật bằng admin trên trình duyệt** (192.168.10.9:5173): dashboard render đúng, luồng sửa hồ sơ cá nhân (edit→lưu→context cập nhật→revert) chạy trọn vẹn, trang Phòng ban + danh sách văn bản (lọc + Xuất Excel) hiển thị đúng.

### [x] 3.4 — Backup database tự động (R15) — HOÀN THÀNH 2026-07-17
- **Bối cảnh:** ngày 2026-07-16, lệnh `prisma migrate dev` chạy trong môi trường non-interactive đã tự ý reset (xoá sạch) toàn bộ DB dev mà không có backup để khôi phục — xem chi tiết "SỰ CỐ NGHIÊM TRỌNG" trong `IMPLEMENTATION_PLAN.md`. Đây là bằng chứng thực tế cho thấy R15 (EXISTING-BUG.md) là rủi ro có thật, không phải lý thuyết.
- **Đã làm:** `scripts/backup-db.sh` (trong repo, versioned) — `pg_dump -Fc` qua `docker exec` (không cần mật khẩu, chạy trong container), dump vào file `.tmp` rồi mới rename (tránh file cụt khi lỗi giữa chừng), xoay vòng giữ 7 bản mới nhất, ghi `backup.log`. Lưu tại `/home/tung/etool-backups/` (ngoài repo + ngoài container). **Cron hệ điều hành** (crontab user `tung`, `0 2 * * *` — giờ server đã là GMT+7), KHÔNG dùng node-cron trong backend để backup chạy được cả khi backend chết. Tài liệu khôi phục: `scripts/RESTORE.md` (5 bước kèm restore thử vào DB tạm trước, quy tắc an toàn migrate schema bằng `--create-only` + `migrate deploy`).
- **Nghiệm thu (đã chạy thật):** backup tay thành công (28K dump); **restore thật vào DB tạm** `eapproval_restore_test` → đủ 12 bảng, 5 user, 3 workflow khớp DB gốc, xoá DB tạm sau khi xác nhận; test xoay vòng với 10 file → giữ đúng 7 bản mới nhất; crontab đã cài và xác nhận qua `crontab -l`.

---

## Giai đoạn 4 — Nâng cao (làm cuối)

### [x] 4.1 — Uỷ quyền duyệt (delegation) — HOÀN THÀNH 2026-07-17
- **Migration:** model `Delegation(id, fromUserId, toUserId, startDate, endDate, createdAt)` + 2 quan hệ trên User; áp theo đúng quy trình an toàn mới (backup thủ công → `migrate dev --create-only` → đọc SQL xác nhận chỉ CREATE → `migrate deploy`). Chồng lấn khoảng ngày kiểm ở app layer.
- **Backend:** `routes/delegations.ts` — GET (của tôi: đã cấp + được nhận; Admin `?all=1` xem tất cả), GET `/candidates` (user active trừ chính mình — cho ô chọn, vì user thường không gọi được `/api/users`), POST (chặn tự uỷ quyền/khoảng ngày ngược/khoảng đã qua/người nhận bị vô hiệu/chồng lấn → 409), DELETE (chỉ người cấp hoặc Admin). `lib/workflow.ts` viết lại: `matchesCurrentStep` (logic gốc, ràng buộc phòng ban của Dept_Head tính theo NGƯỜI UỶ QUYỀN), `getActiveDelegators(userId)` (uỷ quyền đang hiệu lực + fromUser còn active), `isCurrentApprover(doc, user, delegators?)`, `findActingDelegator` (ưu tiên quyền bản thân — chỉ tính "duyệt thay" khi không có quyền riêng). **Điểm quan trọng:** lọc thô ở DB của `/pending` + dashboard mở rộng thành `approverRole IN [role mình, ...role người uỷ quyền]` — thiếu là hồ sơ chỉ-duyệt-qua-uỷ-quyền bị bỏ sót trước bước hậu kiểm. Log duyệt/từ chối/yêu cầu sửa ghi "(duyệt thay — uỷ quyền bởi X)" vào comment. `GET /:id` trả thêm `approvingVia` cho banner. Audit `USER / DELEGATION_CREATE|DELEGATION_DELETE`.
- **Frontend:** card "Uỷ quyền duyệt" trong trang Tài khoản (bảng uỷ quyền kèm badge Đang hiệu lực/Sắp hiệu lực/Đã hết hạn, nút Thu hồi cho uỷ quyền mình cấp, form tạo với select người nhận + khoảng ngày); banner info trên trang chi tiết văn bản khi `approvingVia` có giá trị. Nhãn audit mới trong `labels.ts`.
- **Nghiệm thu (curl + UI trình duyệt thật):** depthead uỷ quyền accountant → accountant thấy hồ sơ GENERAL bước Dept_Head trong hàng chờ (trước đó 0), `canApprove:true` + `approvingVia` đúng tên; duyệt qua UI → timeline ghi "Phạm Thị Kế Toán — Duyệt — (duyệt thay — uỷ quyền bởi Trần Thị Trưởng Phòng)", hồ sơ sang bước 2. Validation: tự uỷ quyền → 400; chồng lấn → 409; ngày ngược → 400; người khác thu hồi → 403; người cấp thu hồi → 204 và hồ sơ mới biến khỏi hàng chờ người nhận ngay. Tạo/thu hồi qua UI trang Tài khoản hoạt động (bảng + badge + toast).

### [x] 4.2 — Nhắc hạn hồ sơ PENDING quá hạn — HOÀN THÀNH 2026-07-17
- **Migration:** cột `Document.lastRemindedAt DateTime?` (theo quy trình an toàn: backup → `--create-only` → đọc SQL chỉ có ADD COLUMN → `migrate deploy`).
- **Backend:** `lib/reminder.ts` mới — `node-cron` v4 chạy `REMIND_CRON` (mặc định `0 8 * * *`, timezone Asia/Ho_Chi_Minh; validate, sai thì cảnh báo + dùng mặc định): tìm hồ sơ PENDING có `updatedAt` quá `REMIND_PENDING_AFTER_DAYS` ngày (mặc định 3, 0 = nhắc mọi PENDING cho dev) chưa nhắc hôm nay (so `lastRemindedAt` với 00:00 GMT+7 qua `todayVN()` mới trong `dateUtils.ts`) → `notify()` (WS + Web Push) event `document:reminder` tới người duyệt bước hiện tại **kể cả người đang nhận uỷ quyền hiệu lực** (helper mới `getCurrentStepApproverIds` trong `notifications.ts`, tái dùng cho cả `getNotifiableUserIds`). **Điểm mấu chốt:** ghi `lastRemindedAt` phải set tường minh `updatedAt` cũ (Prisma `@updatedAt` tự bump là reset đồng hồ quá hạn — hồ sơ sẽ không được nhắc hằng ngày nữa) + guard `updatedAt` trong where chống ghi đè khi có người vừa xử lý. Job bọc try/catch, lỗi chỉ log.
- **Frontend:** chỉ thêm nhãn `document:reminder` ("văn bản chờ duyệt đã quá hạn", tone orange) — toast/service-worker dùng chung hạ tầng có sẵn.
- **Nghiệm thu (chạy thật với N=0 + cron mỗi phút):** người duyệt + người nhận uỷ quyền cùng nhận WS event đúng payload; Web Push gửi thật qua `web-push` tới push-service giả HTTPS (nhận POST mã hoá 242 bytes, trả 201); `updatedAt` không đổi sau khi nhắc; tick thứ 2 trong ngày không nhắc trùng; `lastRemindedAt` = hôm qua → hôm nay nhắc lại (đúng 1 lần/ngày). Chi tiết Bước 25 trong `IMPLEMENTATION_PLAN.md`.

---

## Giai đoạn 5 — Form động theo loại văn bản (đóng R14) + tinh chỉnh giao diện

> Nguồn gốc: đề xuất của người dùng 2026-07-18. Đã chốt qua hỏi đáp: (1) số ngày nghỉ **trừ cả T7 và CN** (công ty làm T2–T6); (2) luồng duyệt nghỉ phép **Trưởng phòng → HR** (cần role Nhân sự mới; flow sửa được sau qua Workflow Builder); (3) hoá đơn **giữ PDF/DOCX**, không nhận ảnh; (4) **giữ** "Văn bản chung" nhưng thêm ô tóm tắt/ghi chú.
>
> Bổ sung 2026-07-18 (sau thảo luận "người tạo chức danh cao hơn người duyệt"): (5) áp dụng **quy tắc tự động bỏ qua bước** khi bước không có người duyệt hợp lệ hoặc người duyệt duy nhất là chính người tạo; (6) **mô hình bước duyệt mới** — bước kiểu "Trưởng phòng cùng phòng ban người nộp" giữ như hiện hữu; các bước còn lại cấu hình bằng **Phòng ban + user tuỳ chọn**: chọn đích danh user thì CHỈ người đó duyệt được, **bỏ trống user thì BẤT KỲ thành viên nào của phòng ban đó** đều duyệt được — chi tiết mục 5.6. Hệ quả: KHÔNG cần role HR mới (quyền duyệt đến từ vị trí trong flow, không từ role) — 5.1 điều chỉnh tương ứng.

### [x] 5.1 — Nền tảng: chọn loại trước, form theo loại + Phòng Nhân sự — HOÀN THÀNH 2026-07-18
- **Seed:** phòng ban "Phòng Nhân sự" + user mẫu `hr` (role Nhân viên), workflow `LEAVE` (Trưởng phòng của người nộp → Phòng Nhân sự-bất kỳ thành viên).
- **Frontend `CreateDocumentPage` 2 bước:** bước 1 chọn loại (4 card icon + mô tả), bước 2 form riêng theo loại. Bỏ hẳn ô JSON nâng cao. 4 component (`components/documentForms/`) tái dùng cho cả panel chỉnh sửa.
- **Backend `lib/documentForms.ts`:** zod schema theo type, validate POST+PATCH, trường dẫn xuất server tự tính lại.
- **Trang chi tiết:** `DocumentFormSummary` renderer theo loại, fallback key-value cho loại tuỳ biến.
- Nhãn: thêm `LEAVE`, đổi `PURCHASE` → "Đơn hàng".
- **Phạm vi thực tế mở rộng hơn dự kiến:** làm luôn cả PAYMENT (bảng chi phí động) và PURCHASE+GENERAL trong cùng đợt vì đơn giản — xem 5.3/5.4 bên dưới đã gộp vào đây. Chi tiết + kết quả kiểm thử: Bước 36, `IMPLEMENTATION_PLAN.md`.

### [x] 5.2 — Đơn xin nghỉ phép (LEAVE): PDF tự sinh + đóng dấu khi duyệt — HOÀN THÀNH 2026-07-18
- Form + tính số ngày (trừ T7+CN, 0.5 khi trùng ngày, tiêu đề tự sinh) **đã xong ở 5.1**, kiểm thử qua UI thật PASS (ví dụ thật: T6→T2 = 1 ngày, khớp đúng ví dụ đã chốt với người dùng).
- **CÒN LẠI — việc thật của 5.2:** PDF tự sinh khi nộp đơn (`lib/leavePdf.ts`, pdf-lib + font DejaVu sẵn có) — 1 trang A4, quốc hiệu tiêu ngữ, thông tin đơn, chữ ký người làm đơn, chừa sẵn khu "PHẦN PHÊ DUYỆT" cuối trang. Khi duyệt bước cuối: **regenerate PDF** điền chữ ký + dấu ĐÃ DUYỆT của từng người vào đúng khu đó (không sinh trang phụ lục như 2.5, khác với luồng GENERAL/PAYMENT/PURCHASE). Người duyệt cuối tự upload bản ký tay → bỏ qua auto-generate. `autoStampApprovedPdfs` rẽ nhánh theo type.

### [x] 5.3 — Đề nghị thanh toán (PAYMENT) — HOÀN THÀNH 2026-07-18 (làm gộp trong 5.1, xem trên + Bước 36)
- Bảng chi phí động (tự sinh dòng khi gõ dòng cuối, nút xoá dòng), tổng tự tính (client hiển thị realtime + server tính lại độc lập, đối chiếu khớp qua kiểm thử thật). Tiêu đề tự sinh "Đề nghị thanh toán — <tên dự án>".

### [x] 5.4 — Đơn hàng (PURCHASE) + Văn bản chung (GENERAL) — HOÀN THÀNH 2026-07-18 (làm gộp trong 5.1, xem trên + Bước 36)
- PURCHASE: Tiêu đề + Ghi chú tuỳ chọn + file **bắt buộc ≥1** (validate cả client lẫn server, cả lúc tạo lẫn lúc sửa). GENERAL: Tiêu đề + Tóm tắt/ghi chú + file tuỳ chọn.

### [ ] 5.5 — Tinh chỉnh giao diện chung (làm đầu tiên — nhỏ, độc lập)
- Theme mặc định **SÁNG**: đổi default `"system"` → `"light"` trong `theme.tsx` (người dùng vẫn toggle được, lựa chọn cá nhân lưu localStorage được tôn trọng).
- Topbar góc phải: **bỏ dòng chức danh** dưới tên ở nút user menu — chỉ còn "Nguyễn Văn A". (Trong dropdown vẫn giữ email + vai trò · phòng ban.)

### [x] 5.6 — Mô hình bước duyệt mới (Phòng ban + user tuỳ chọn) + tự động bỏ qua bước + mở quyền tạo văn bản — HOÀN THÀNH 2026-07-18

**A. Mô hình bước duyệt mới (đã chốt với người dùng):**
- `WorkflowStep` đổi cấu trúc: `kind` (`CREATOR_DEPT_HEAD` | `DEPARTMENT`) + `departmentId?` + `approverUserId?`; **bỏ cột `approverRole`** sau khi chuyển đổi.
  - `CREATOR_DEPT_HEAD` — "Trưởng phòng của người nộp": người duyệt là user role Trưởng phòng CÙNG phòng ban người tạo (giữ nguyên hành vi hiện hữu, thường là bước 1).
  - `DEPARTMENT` — chọn phòng ban; `approverUserId` có giá trị → **CHỈ đích danh người đó** duyệt được; null → **BẤT KỲ thành viên active nào của phòng ban** đều duyệt được.
- **Migration viết tay** (bảng đang có dữ liệu; DB hiện 0 document nên chỉ cần chuyển WorkflowStep): bước `Dept_Head` → `CREATOR_DEPT_HEAD`; bước role khác (Director/Accountant) → `DEPARTMENT` đích danh đúng user đang giữ role đó (mỗi role hiện đúng 1 người → GIỮ NGUYÊN hành vi thực tế; nếu chuyển thành "bất kỳ thành viên Ban Giám đốc" thì Admin cũng duyệt được — sai ngữ nghĩa cũ). Backup trước, soát SQL, `migrate deploy`.
- `lib/workflow.ts` viết lại `matchesCurrentStep` theo kind (uỷ quyền vẫn tính theo NGƯỜI UỶ QUYỀN như 4.1); `notifications.ts getCurrentStepApproverIds` + lọc thô DB của `/pending`/dashboard viết lại theo mô hình mới (kind DEPARTMENT giờ diễn đạt được trong Prisma where; CREATOR_DEPT_HEAD vẫn hậu kiểm app layer).
- **Workflow Builder UI:** mỗi bước chọn kiểu — "Trưởng phòng của người nộp" hoặc "Phòng ban chỉ định" (select phòng ban + select thành viên với mục đầu "— Bất kỳ thành viên nào —"). Hiển thị bước (builder, danh sách flow, stepper trang chi tiết): "Trưởng phòng (phòng người nộp)" / "Phòng Nhân sự — bất kỳ thành viên" / "Ban Giám đốc — Lê Văn Giám Đốc". Payload API đổi tương ứng, validate: DEPARTMENT phải có phòng ban tồn tại, user đích danh (nếu có) phải thuộc phòng ban đó.
- **Tiện thể đóng R20:** PATCH flow có `steps` khi đang có văn bản PENDING dùng flow đó → 409 (vẫn cho sửa mô tả).
- **Lưu ý hệ quả:** điều kiện ẩn card Uỷ quyền/Chữ ký (R25) đổi lại thành hiện cho MỌI user — vì với mô hình mới ai cũng có thể được chỉ định duyệt, không suy được từ permission nữa.

**B. Quy tắc tự động bỏ qua bước (đã chốt):**
- Helper "người duyệt hợp lệ của bước" (user active): CREATOR_DEPT_HEAD → Trưởng phòng cùng phòng người tạo; DEPARTMENT đích danh → chính user đó (nếu còn active); DEPARTMENT bất kỳ → mọi thành viên active của phòng.
- **Bỏ qua bước** nếu danh sách rỗng HOẶC chỉ gồm đúng người tạo (chặn tự duyệt). Đánh giá lúc: tạo văn bản, sau mỗi lần duyệt, và khi nộp lại. Mỗi bước bị bỏ qua ghi `DocumentLog` action mới `STEP_SKIPPED` (comment nêu lý do) — timeline minh bạch.
- Tạo mới mà bỏ qua HẾT mọi bước → chặn 400 "Luồng duyệt không có người duyệt hợp lệ". Giữa chừng mà các bước còn lại đều bị bỏ qua → văn bản sang APPROVED (đã qua đủ người duyệt thực).

**C. Mở quyền tạo văn bản cho mọi role** (Trưởng phòng/Giám đốc/Kế toán... cũng xin nghỉ phép được): thêm `document:create` + `document:read:own` vào các role còn thiếu trong seed. An toàn nhờ quy tắc B (không ai tự duyệt đơn mình).

**Thứ tự đề xuất (cập nhật):** 5.5 → 5.1 → 5.6 → 5.2 → 5.3 → 5.4 (5.6 phải xong trước 5.2 vì flow LEAVE dùng mô hình bước mới). Mỗi mục xong DỪNG CHỜ PHÊ DUYỆT theo quy trình hiện hành.

---

## Thứ tự & phụ thuộc (tóm tắt)

```
GĐ0 (0.1→0.6, 0.7 ghi nhận) → GĐ1 (1.1 → 1.2 → 1.3 → 1.4 → 1.6, 1.5 hoãn nếu chưa có SMTP)
→ GĐ2 (2.1 → 2.2 → 2.3 → 2.4 → 2.5 ⚠ 2.4 cần docNo từ 2.3; 2.5 cần chữ ký từ 1.6, dùng chung lib/stamp.ts với 2.4)
→ GĐ3 (3.1 → 3.2 → 3.3 ⚠ 3.2 nên xong trước 3.3 để tái dùng query phạm vi)
→ GĐ4 (4.1 → 4.2)
```

Quy ước chung cho MỌI mục: `tsc --noEmit` (backend) + `npm run build` (frontend) sạch; test luồng thật (curl/trình duyệt) như các bước trước; thời gian hiển thị luôn GMT+7; message lỗi tiếng Việt; hành động ghi audit đầy đủ.
