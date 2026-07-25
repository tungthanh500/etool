import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPatch, apiPost, ApiError } from "../api/client";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Select,
  PageHeader,
  PageLoading,
} from "../components/ui";
import { roleLabel } from "../lib/labels";
import type { Role, Department, User } from "../types";

export function UserFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isSelf, setIsSelf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  // Load lỗi giữa chừng: PHẢI chặn hẳn form thay vì hiện form rỗng — nếu không, ở chế độ
  // sửa user sẽ trông giống hệt "thêm mới" (mọi field về rỗng/mặc định) và bấm Lưu sẽ
  // PATCH đè dữ liệu rỗng lên user thật.
  const [loadError, setLoadError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    Promise.all([
      apiGet<Role[]>("/api/roles"),
      apiGet<Department[]>("/api/departments"),
      isEdit ? apiGet<User>(`/api/users/${id}`) : Promise.resolve(null),
      apiGet<User>("/api/auth/me"),
    ])
      .then(([rolesList, deptList, u, me]) => {
        setRoles(rolesList);
        setDepartments(deptList);
        if (rolesList.length > 0) setRoleId(rolesList[0].id);
        if (deptList.length > 0) setDepartmentId(deptList[0].id);
        if (u) {
          setUsername(u.username);
          setEmail(u.email);
          setFullName(u.fullName);
          setRoleId(u.roleId);
          setDepartmentId(u.departmentId);
          setIsActive(u.isActive);
          setIsSelf(u.id === me.id);
        }
        setLoadError(null);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : "Không tải được dữ liệu");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ cần chạy lại khi id/isEdit đổi, load() luôn đọc state mới nhất qua closure tại thời điểm gọi
  }, [id, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit) {
        const body: Record<string, string | boolean> = { username, email, fullName, roleId, departmentId, isActive };
        if (password) body.password = password;
        await apiPatch(`/api/users/${id}`, body);
      } else {
        await apiPost("/api/users", { username, email, fullName, password, roleId, departmentId });
      }
      navigate("/users");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lưu user thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <PageLoading />;

  if (loadError) {
    return (
      <div>
        <PageHeader
          title={isEdit ? "Sửa user" : "Thêm user"}
          backTo="/users"
          backLabel="Quay lại danh sách"
        />
        <Alert tone="danger">
          {loadError}{" "}
          <Button variant="ghost" size="sm" onClick={load}>
            Thử lại
          </Button>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? "Sửa user" : "Thêm user"}
        backTo="/users"
        backLabel="Quay lại danh sách"
      />

      <Card>
        <form className="form-stack" onSubmit={handleSubmit}>
          <Field
            label="Tên đăng nhập"
            hint="3-32 ký tự: chữ thường, số, dấu chấm/gạch dưới/gạch nối. User không tự đổi được."
          >
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="tendangnhap"
              required
              minLength={3}
              maxLength={32}
              pattern="[a-z0-9][a-z0-9._\-]{2,31}"
            />
          </Field>

          <Field label="Email liên hệ">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ban@congty.com"
              required
            />
          </Field>

          <Field label="Họ tên">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </Field>

          <Field
            label={isEdit ? "Mật khẩu mới" : "Mật khẩu"}
            hint={isEdit ? "Để trống nếu giữ nguyên · tối thiểu 8 ký tự" : "Tối thiểu 8 ký tự"}
          >
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? "••••••••" : ""}
              required={!isEdit}
              minLength={8}
            />
          </Field>

          <Field label="Vai trò">
            <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {roleLabel(r.name)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Phòng ban">
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>

          {isEdit && (
            <Field
              label="Trạng thái tài khoản"
              hint={isSelf ? "Không thể tự vô hiệu hoá tài khoản của chính mình" : undefined}
            >
              <label style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", cursor: isSelf ? "default" : "pointer" }}>
                <input
                  type="checkbox"
                  checked={isActive}
                  disabled={isSelf}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                {isActive ? "Đang hoạt động" : "Đã vô hiệu hoá"}
              </label>
            </Field>
          )}

          {error && <Alert tone="danger">{error}</Alert>}

          <div style={{ display: "flex", gap: "var(--sp-3)" }}>
            <Button type="submit" variant="primary" loading={submitting}>
              {submitting ? "Đang lưu..." : "Lưu"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate("/users")}>
              Huỷ
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
