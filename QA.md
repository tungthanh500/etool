# BÁO CÁO PHÂN TÍCH RỦI RO & ĐỀ XUẤT CẢI THIỆN MÃ NGUỒN (e-Approval Workflow)

Các vấn đề dưới đây được phân loại theo mức độ nghiêm trọng từ **Cao (High)**, **Trung bình (Medium)** đến **Thấp/Khuyến nghị (Low/Improvement)**.

---

## I. RỦI RO MỨC ĐỘ CAO (HIGH)

### 1. Phê Duyệt Chéo Phòng Ban (Cross-Department Approval Bypass)
* **Vị trí ảnh hưởng:** `backend/src/lib/workflow.ts` (hàm `isCurrentApprover`) và `backend/src/routes/documents.ts`.
* **Nguyên nhân:**
  Trong hàm `isCurrentApprover`, hệ thống chỉ kiểm tra xem vai trò của người dùng hiện tại có khớp với vai trò được yêu cầu ở bước duyệt hiện tại hay không:
  ```typescript
  export function isCurrentApprover(document: DocumentWithWorkflow, user: AuthUser): boolean {
    if (document.status !== "PENDING") return false;
    return getCurrentWorkflowStep(document)?.approverRole === user.role.name;
  }
  ```
  Nếu vai trò yêu cầu là `"Dept_Head"` (Trưởng phòng) và hệ thống có nhiều phòng ban (ví dụ: Phòng IT, Phòng Nhân sự):
  * Một nhân viên thuộc **Phòng IT** tạo đề xuất mua sắm.
  * Trưởng phòng của **Phòng Nhân sự** (cũng có `role.name === "Dept_Head"`) hoàn toàn có thể gọi API duyệt và được hệ thống chấp nhận, vì hệ thống không đối chiếu phòng ban của Trưởng phòng với phòng ban của người tạo đề xuất.
* **Hậu quả:** Sai lệch nghiêm trọng về phân quyền nghiệp vụ trong doanh nghiệp, trưởng phòng ban này có thể phê duyệt/từ chối hồ sơ của phòng ban khác.
* **Đề xuất cải thiện:**
  Đối chiếu thêm `departmentId` giữa người tạo tài liệu (`creator`) và người duyệt đối với các vai trò mang tính chất bộ phận như Trưởng phòng (`Dept_Head`).
  * **Code đề xuất điều chỉnh:**
    ```typescript
    type DocumentWithWorkflowAndCreator = Document & {
      workflow: { steps: WorkflowStep[] };
      creator: User;
      logs?: DocumentLog[];
    };

    export function isCurrentApprover(document: DocumentWithWorkflowAndCreator, user: AuthUser): boolean {
      if (document.status !== "PENDING") return false;
      const currentStep = getCurrentWorkflowStep(document);
      if (!currentStep) return false;
      
      // Kiểm tra khớp vai trò trước
      if (currentStep.approverRole !== user.role.name) return false;

      // Nếu là trưởng phòng, bắt buộc phải cùng phòng ban với người tạo
      if (currentStep.approverRole === "Dept_Head") {
        return document.creator.departmentId === user.departmentId;
      }

      return true;
    }
    ```

---

### 2. Lỗi Race Condition Khi Duyệt Đồng Thời (State Desynchronization)
* **Vị trí ảnh hưởng:** Các endpoint `/approve`, `/reject`, `/request-change` trong `backend/src/routes/documents.ts`.
* **Nguyên nhân:**
  Hệ thống lấy thông tin tài liệu từ database ở ngoài transaction bằng hàm `loadDocumentForAction(req.params.id)`. Sau đó thực hiện kiểm tra điều kiện duyệt (`isCurrentApprover`), tính toán bước tiếp theo (`nextStep`) rồi mới chạy `prisma.$transaction` để ghi đè dữ liệu mới:
  ```typescript
  const document = await loadDocumentForAction(req.params.id); // Lấy dữ liệu ngoài transaction
  // ... kiểm tra logic ...
  const nextStep = document.workflow.steps.find((s) => s.stepOrder === document.currentStep + 1);

  const updated = await prisma.$transaction(async (tx) => {
    const doc = await tx.document.update({
      where: { id: document.id },
      data: nextStep ? { currentStep: document.currentStep + 1 } : { status: "APPROVED" }, // Sử dụng biến nextStep tính toán từ trước
      ...
    });
  });
  ```
  Nếu hai quản trị viên (hoặc hai yêu cầu trùng lặp từ một người do click đúp) gửi yêu cầu duyệt cùng một lúc:
  1. Cả hai yêu cầu đều đọc ra trạng thái document hiện tại là `currentStep = 1` và tính toán `nextStep = 2`.
  2. Yêu cầu A chạy trước và cập nhật thành công lên `currentStep = 2`.
  3. Yêu cầu B chạy ngay sau đó, do sử dụng biến tính toán từ trước nên nó vẫn cập nhật `currentStep` thành `2` (đáng lẽ phải lên `3` hoặc báo lỗi vì bước 1 đã duyệt xong).
* **Hậu quả:** Gây lỗi ghi đè dữ liệu, phê duyệt trùng bước, hoặc làm sai lệch hoàn toàn trạng thái thực tế của quy trình duyệt (Workflow).
* **Đề xuất cải thiện:**
  Áp dụng **Optimistic Concurrency Control (Kiểm soát phiên bản đồng thời)** bằng cách thêm điều kiện kiểm tra `currentStep` và `status` ngay trong mệnh đề `where` của lệnh cập nhật trong transaction. Nếu trạng thái đã bị thay đổi bởi request khác, lệnh update sẽ không tìm thấy bản ghi và ném lỗi, ngăn chặn double-approve:
  * **Code đề xuất điều chỉnh:**
    ```typescript
    const updated = await prisma.$transaction(async (tx) => {
      // Chỉ cập nhật nếu currentStep và status vẫn khớp với lúc chúng ta đọc dữ liệu
      const doc = await tx.document.update({
        where: { 
          id: document.id,
          currentStep: document.currentStep,
          status: "PENDING"
        },
        data: nextStep ? { currentStep: document.currentStep + 1 } : { status: "APPROVED" },
        include: { ...DOCUMENT_INCLUDE, logs: true },
      });
      // ... tạo log ...
      return doc;
    });
    ```

---

### 3. Rò Rỉ Tài Nguyên Ổ Cứng Do Lỗi Transaction (Multer File Leak)
* **Vị trí ảnh hưởng:** Endpoint `POST /api/documents` tạo văn bản trong `backend/src/routes/documents.ts`.
* **Nguyên nhân:**
  Middleware `upload.array("attachments", 10)` của Multer sẽ tự động ghi các file đính kèm trực tiếp vào ổ cứng server trước khi router handler được thực thi. Sau đó, mã nguồn chạy block `prisma.$transaction` để lưu thông tin vào cơ sở dữ liệu.
  Nếu cơ sở dữ liệu gặp lỗi (như lỗi kết nối, dữ liệu không hợp lệ, hoặc lỗi do cấu hình quy trình duyệt thất bại), transaction của cơ sở dữ liệu sẽ bị rollback. Tuy nhiên, các file vật lý đã được Multer ghi trên đĩa **không tự động xóa đi**.
* **Hậu quả:** Rác file vật lý (file mồ côi) tích tụ trong thư mục `uploads/` ngày càng nhiều theo thời gian, dẫn đến đầy ổ cứng và làm sập máy chủ một cách âm thầm (DoS).
* **Đề xuất cải thiện:**
  Sử dụng khối `try/catch` bọc lại quá trình lưu DB. Nếu xảy ra lỗi, cần quét qua danh sách file đã tải lên và thực hiện xóa vật lý bằng `fs.unlinkSync` trước khi ném lỗi ra ngoài:
  * **Code đề xuất điều chỉnh:**
    ```typescript
    router.post("/", authenticate, authorize("document:create"), upload.array("attachments", 10), async (req, res, next) => {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      try {
        // ... parse data & check workflow ...
        const document = await prisma.$transaction(async (tx) => { ... });
        res.status(201).json(document);
      } catch (err) {
        // Xóa file rác nếu ghi database thất bại
        for (const file of files) {
          fs.unlink(file.path, (unlinkErr) => {
            if (unlinkErr) console.error(`Lỗi xóa file mồ côi: ${file.path}`, unlinkErr);
          });
        }
        next(err);
      }
    });
    ```

---

## II. RỦI RO MỨC ĐỘ TRUNG BÌNH (MEDIUM)

### 4. Lỗi Treo/Sập Server do Thiếu Try-Catch Trong Async Middleware
* **Vị trí ảnh hưởng:** `backend/src/middlewares/authenticate.ts`.
* **Nguyên nhân:**
  Lệnh gọi cơ sở dữ liệu qua Prisma `await prisma.user.findUnique(...)` không được bao bọc trong khối `try/catch`. Trong Express 4, nếu một lỗi bất ngờ xảy ra bên trong một middleware hoặc route handler bất đồng bộ (`async`), lỗi này sẽ không được tự động chuyển sang middleware xử lý lỗi tập trung, gây ra lỗi `UnhandledPromiseRejection` treo máy khách hoặc sập tiến trình Node.js.
* **Đề xuất cải thiện:**
  Bọc khối xử lý cơ sở dữ liệu trong `try/catch` và gọi `next(err)` khi có lỗi:
  * **Code đề xuất điều chỉnh:**
    ```typescript
    export async function authenticate(req: Request, res: Response, next: NextFunction) {
      // ... verify token ...
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: { role: true, department: true },
        });
        if (!user) {
          res.status(401).json({ error: "Phiên đăng nhập không hợp lệ" });
          return;
        }
        req.user = user;
        next();
      } catch (err) {
        next(err);
      }
    }
    ```

### 5. Dung Lượng Upload Quá Lớn & Nguy Cơ Tràn Đĩa
* **Vị trí ảnh hưởng:** `backend/src/lib/upload.ts`.
* **Nguyên nhân:**
  Hệ thống đang cấu hình giới hạn kích thước file là `15MB` và tối đa `10 file` cho mỗi request. Nghĩa là một người dùng có thể gửi lên tới `150MB` dữ liệu trong một yêu cầu tạo tài liệu.
  Nếu lưu trữ cục bộ trực tiếp trên Ubuntu Server, việc này cực kỳ nguy hiểm nếu có nhiều người dùng sử dụng hoặc kẻ tấn công cố tình spam upload file lớn.
* **Đề xuất cải thiện:**
  * Giảm giới hạn file xuống mức hợp lý hơn (ví dụ: `5MB` mỗi file).
  * Trong môi trường sản xuất (Production), cần cấu hình lưu trữ lên các dịch vụ Cloud Object Storage (như Amazon S3, Google Cloud Storage, hoặc hệ thống lưu trữ MinIO độc lập) thay vì lưu trực tiếp vào đĩa cục bộ của máy chủ ứng dụng.

---

## III. RỦI RO MỨC ĐỘ THẤP & ĐỀ XUẤT CẢI THIỆN HIỆU NĂNG (LOW / IMPROVEMENT)

### 6. Thiếu Index Cho Các Khóa Ngoại Trong Cơ Sở Dữ Liệu
* **Vị trí ảnh hưởng:** `backend/prisma/schema.prisma`.
* **Nguyên nhân:**
  Trong PostgreSQL, các ràng buộc khóa ngoại (Foreign Key) không được tự động tạo index. Các câu lệnh truy vấn liên kết bảng (`include` attachments, creator, workflow, logs) được thực hiện rất thường xuyên trong hệ thống này. Khi số lượng bản ghi trong database tăng lên (vài ngàn đến vài chục ngàn dòng), việc truy vấn không có index sẽ dẫn đến tình trạng quét toàn bộ bảng (Table Scan), làm chậm phản hồi của API một cách rõ rệt.
* **Đề xuất cải thiện:**
  Thêm khai báo chỉ mục `@@index` trong các model của Prisma cho các trường khóa ngoại hay được dùng để tìm kiếm hoặc liên kết:
  * **Model Attachment:**
    ```prisma
    model Attachment {
      // ...
      documentId String
      document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
      
      @@index([documentId]) // Thêm index này
    }
    ```
  * **Tương tự cần áp dụng cho:**
    * `User`: `@@index([roleId])`, `@@index([departmentId])`
    * `Document`: `@@index([creatorId])`, `@@index([workflowId])`
    * `WorkflowStep`: `@@index([workflowId])`
    * `DocumentLog`: `@@index([documentId])`, `@@index([userId])`

### 7. Thiếu Giới Hạn Kích Thước Field Chữ Trong Multer (Field Size Attack)
* **Vị trí ảnh hưởng:** `backend/src/lib/upload.ts`.
* **Nguyên nhân:**
  Cấu hình Multer hiện tại mới chỉ giới hạn kích thước file đính kèm (`fileSize`), nhưng chưa giới hạn kích thước của các text fields (`fieldSize`) gửi kèm trong form dữ liệu (ví dụ trường `formData` chứa chuỗi JSON). Một kẻ tấn công có thể gửi một chuỗi văn bản cực lớn (hàng chục MB) vào trường `formData` khiến máy chủ cạn kiệt bộ nhớ RAM khi cố parse JSON.
* **Đề xuất cải thiện:**
  Thêm cấu hình `fieldSize` và `fields` trong phần cấu hình limits của Multer:
  ```typescript
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_FILES_PER_REQUEST,
    fieldSize: 2 * 1024 * 1024, // Giới hạn các trường text tối đa 2MB
    fields: 20 // Giới hạn số lượng text field tối đa trong form
  }
  ```
