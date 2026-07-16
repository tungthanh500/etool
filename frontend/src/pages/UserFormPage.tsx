import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { apiGet, apiPost, ApiError } from "../api/client";
import type { Role, Department, User } from "../types";

// PATCH không có helper riêng trong api/client — dùng fetch trực tiếp ở đây,
// đủ đơn giản để không cần mở rộng client.ts cho một verb chỉ dùng 1 nơi.
async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, (data && data.error) || `Lỗi ${res.status}`);
  }
  return data as T;
}

export function UserFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiGet<Role[]>("/api/roles"),
      apiGet<Department[]>("/api/departments"),
      isEdit ? apiGet<User>(`/api/users/${id}`) : Promise.resolve(null),
    ])
      .then(([rolesList, deptList, user]) => {
        setRoles(rolesList);
        setDepartments(deptList);
        if (rolesList.length > 0) setRoleId(rolesList[0].id);
        if (deptList.length > 0) setDepartmentId(deptList[0].id);
        if (user) {
          setEmail(user.email);
          setFullName(user.fullName);
          setRoleId(user.roleId);
          setDepartmentId(user.departmentId);
        }
      })
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit) {
        const body: Record<string, string> = { fullName, roleId, departmentId };
        if (password) body.password = password;
        await apiPatch(`/api/users/${id}`, body);
      } else {
        await apiPost("/api/users", { email, fullName, password, roleId, departmentId });
      }
      navigate("/users");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lưu user thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="page">Đang tải...</div>;

  return (
    <div className="page">
      <header className="page-header">
        <h1>{isEdit ? "Sửa user" : "Thêm user"}</h1>
        <Link to="/users">← Quay lại danh sách</Link>
      </header>

      <form className="doc-form" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isEdit}
          />
        </label>
        <label>
          Họ tên
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </label>
        <label>
          {isEdit ? "Mật khẩu mới (để trống nếu giữ nguyên)" : "Mật khẩu"}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!isEdit}
            minLength={8}
          />
        </label>
        <label>
          Vai trò
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Phòng ban
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Đang lưu..." : "Lưu"}
        </button>
      </form>
    </div>
  );
}
