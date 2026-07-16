import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api/client";
import type { User } from "../types";

export function UserListPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<User[]>("/api/users")
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Quản lý user</h1>
        <Link to="/documents">← Quay lại danh sách văn bản</Link>
      </header>

      <div className="tabs">
        <Link className="btn-create" to="/users/new">
          + Thêm user
        </Link>
      </div>

      {loading ? (
        <p>Đang tải...</p>
      ) : (
        <table className="doc-table">
          <thead>
            <tr>
              <th>Họ tên</th>
              <th>Email</th>
              <th>Vai trò</th>
              <th>Phòng ban</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.fullName}</td>
                <td>{u.email}</td>
                <td>{u.role.name}</td>
                <td>{u.department.name}</td>
                <td>
                  <Link to={`/users/${u.id}/edit`}>Sửa</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
