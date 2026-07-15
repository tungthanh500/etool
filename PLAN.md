# BẢN THIẾT KẾ & KẾ HOẠCH PHÁT TRIỂN HỆ THỐNG
## Hệ thống Quản lý Trình duyệt Văn bản và Phê duyệt Yêu cầu (e-Approval Workflow)
*Môi trường vận hành: Ubuntu Server (Local) | Công cụ thực hiện: Claude Code*

---

## 1. Tổng quan Dự án & Yêu cầu Hệ thống
Hệ thống hướng tới việc số hóa toàn bộ quy trình đề xuất, trình ký và phê duyệt chứng từ hành chính nội bộ của doanh nghiệp (Yêu cầu mua sắm vật tư, Đề xuất thanh toán, Trình duyệt văn bản chung). Dự án được thiết kế để vận hành độc lập, bảo mật tuyệt đối trên hạ tầng máy chủ cục bộ (Ubuntu Server) và được triển khai tự động hoàn toàn thông qua công cụ phát triển AI **Claude Code**.

### Phạm vi tính năng cốt lõi (MVP)
* **Xác thực bảo mật cao (JWT HTTP-Only Cookie):** Cơ chế đăng nhập tách biệt, kiểm soát phiên làm việc từ máy chủ để triệt tiêu lỗ hổng bypass phía trình duyệt.
* **Mô-đun quản lý Văn bản/Yêu cầu:** Form nhập liệu thích ứng (JSONB) cho phép đính kèm tệp tin Word (.docx) và PDF (.pdf).
* **Công cụ quy trình động (Workflow Engine):** Định nghĩa các bước duyệt tuần tự, chuyển giao trạng thái tự động giữa các phòng ban và cấp bậc quản lý.
* **Hệ thống trao đổi & Phản hồi (Comment & Logs):** Cho phép người duyệt và người nộp thảo luận, trao đổi ý kiến trực tiếp trên từng hồ sơ vụ việc.
* **Thông báo đa kênh (Realtime & Web Push):** Đẩy thông báo tức thời ngay cả khi tắt tab trình duyệt trên PC/Android thông qua hạ tầng cục bộ.
* **Thêm tính năng phân quyền user

---

## 2. Ranh giới Kiến trúc: Frontend mỏng (Thin) & Backend dày (Fat)
Để triệt tiêu hoàn toàn rủi ro của xu hướng "Vibe Coding" (nơi AI tự động đẩy phần lớn logic xử lý và lưu trữ dữ liệu tạm lên Client để chạy thử cho nhanh), hệ thống này quy định một ranh giới kiến trúc tuyệt đối.

> ⚠️ **CẢNH BÁO: KHÔNG XỬ LÝ LOGIC NGHIỆP VỤ HOẶC BẢO MẬT Ở FRONTEND**
> Các lỗi bảo mật nghiêm trọng trên thị trường gần đây (bypass bằng F12 Console) là do nhà phát triển kiểm tra quyền truy cập ở Client (ví dụ: đặt biến `isAdmin = true` hoặc `user.role = 'Director'` trong Javascript). Kẻ tấn công chỉ cần thay đổi giá trị biến này hoặc giả mạo gói tin gửi lên API không được xác thực chặt chẽ để chiếm đoạt tài nguyên. Hệ thống này cấm hoàn toàn hành vi này.

> 💡 **NGUYÊN TẮC THIẾT KẾ PHÂN TÁCH (THIN CLIENT VS FAT SERVER)**
> * **Frontend (Thin Client) chỉ có 2 nhiệm vụ duy nhất:** Giao tiếp (thu thập dữ liệu từ các thẻ Form) và Thể hiện (nhận dữ liệu JSON sạch từ API và vẽ lên màn hình).
> * **Backend (Fat Server) nắm giữ toàn bộ quyền sinh sát:** Xác thực, phân quyền, tính toán luồng đi tiếp theo của hồ sơ, mã hóa tên file, lưu trữ database vật lý và kiểm tra quyền hạn của mỗi yêu cầu API.

### Bảng Phân chia Nhiệm vụ:

| Nghiệp vụ | Frontend (React + Vite) | Backend (Node.js API + Postgres) |
| :--- | :--- | :--- |
| **Xác thực** | Gửi Username/Password qua API. Nhận cookie chứa token do trình duyệt tự quản lý. | Xác thực thông tin, cấp JWT nhúng vào `Set-Cookie` (`HttpOnly`, `SameSite=Strict`). |
| **Phân quyền** | Chỉ đọc thuộc tính giao diện `canApprove: true/false` từ API trả về để ẩn/hiện nút "Phê duyệt" (UX). | Giải mã Cookie để định danh User. Truy vấn Database để xác minh User có đủ quyền ở bước hiện tại không. |
| **Chuyển bước duyệt** | Gửi request rỗng lên `POST /api/documents/:id/approve`. | Tính toán bước duyệt tiếp theo (bước hiện tại + 1), ghi nhận nhật ký (Log), thay đổi trạng thái sang Postgres DB. |
| **Lưu trữ File** | Nhận file kéo thả và đẩy dữ liệu thô (Multipart Form) lên Endpoint của Backend. | Kiểm tra đuôi file (.docx, .pdf), dung lượng, đổi tên sang UUID, lưu file lên đĩa cứng máy chủ. |

---

## 3. Thiết kế Cơ sở dữ liệu chuẩn hóa (Prisma Schema)
Cấu trúc Database được thiết kế chặt chẽ trên nền tảng **PostgreSQL**. Trường `formData` trong bảng `Document` sử dụng kiểu dữ liệu `Json` (JSONB trong Postgres) để lưu trữ các thông tin nhập liệu đặc thù của mỗi loại đơn (Ví dụ: Danh sách vật tư cần mua, thông tin tài khoản thụ hưởng thanh toán) mà không cần thay đổi cấu trúc bảng trong tương lai.

```prisma
// Prisma Schema - Toàn bộ tính toàn vẹn dữ liệu được quản lý ở DBMS
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id            String        @id @default(uuid())
  email         String        @unique
  passwordHash  String
  fullName      String
  roleId        String
  role          Role          @relation(fields: [roleId], references: [id])
  departmentId  String
  department    Department    @relation(fields: [departmentId], references: [id])
  documents     Document[]    
  actions       DocumentLog[] 
  createdAt     DateTime      @default(now())
}

model Role {
  id          String   @id @default(uuid())
  name        String   @unique // "Staff", "Dept_Head", "Director", "Accountant"
  permissions String[] 
  users       User[]
}

model Department {
  id    String @id @default(uuid())
  name  String @unique
  users User[]
}

model Document {
  id             String        @id @default(uuid())
  title          String
  type           String        // "PURCHASE", "PAYMENT", "GENERAL"
  formData       Json          // Lưu trữ dữ liệu Form động dưới dạng JSONB
  status         String        // "DRAFT", "PENDING", "APPROVED", "REJECTED", "CHANGES_REQUESTED"
  creatorId      String
  creator        User          @relation(fields: [creatorId], references: [id])
  currentStep    Int           @default(1) 
  workflowId     String
  workflow       Workflow      @relation(fields: [workflowId], references: [id])
  attachments    Attachment[]
  logs           DocumentLog[]
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
}

model Attachment {
  id         String   @id @default(uuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  fileName   String   // Tên file gốc (ví dụ: "De_xuat_mua_cap.pdf")
  fileUrl    String   // Đường dẫn lưu file vật lý đã mã hóa UUID trên Ubuntu
  mimeType   String
  createdAt  DateTime @default(now())
}

model Workflow {
  id          String         @id @default(uuid())
  name        String
  description String?
  steps       WorkflowStep[]
  documents   Document[]
}

model WorkflowStep {
  id          String   @id @default(uuid())
  workflowId  String
  workflow    Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  stepOrder   Int      // Thứ tự bước (1, 2, 3...)
  approverRole String  // Vai trò được quyền duyệt bước này (ví dụ: "Dept_Head")
}

model DocumentLog {
  id         String   @id @default(uuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  action     String   // "SUBMIT", "APPROVE", "REJECT", "REQUEST_CHANGE", "COMMENT"
  comment    String?  // Ghi nhận ý kiến phản hồi
  createdAt  DateTime @default(now())
}