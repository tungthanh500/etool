import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, Pencil, Users } from "lucide-react";
import { apiGet } from "../api/client";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  SkeletonRows,
} from "../components/ui";
import { roleLabel, ROLE_TONES } from "../lib/labels";
import type { User } from "../types";

export function UserListPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<User[]>("/api/users")
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Quản lý user"
        subtitle="Tạo và phân quyền tài khoản người dùng"
        actions={
          <Button
            variant="primary"
            leftIcon={<UserPlus size={17} />}
            onClick={() => navigate("/users/new")}
          >
            Thêm user
          </Button>
        }
      />

      {loading ? (
        <div className="table-wrap">
          <SkeletonRows rows={4} cols={5} />
        </div>
      ) : users.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Users size={26} />} title="Chưa có user nào" />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Tên đăng nhập</th>
                <th>Email liên hệ</th>
                <th>Vai trò</th>
                <th>Phòng ban</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="is-clickable"
                  tabIndex={0}
                  role="button"
                  aria-label={`Sửa user ${u.fullName}`}
                  onClick={() => navigate(`/users/${u.id}/edit`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/users/${u.id}/edit`);
                    }
                  }}
                >
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-3)" }}>
                      <Avatar name={u.fullName} size="sm" />
                      <span className="table__primary">{u.fullName}</span>
                    </span>
                  </td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{u.username}</td>
                  <td style={{ color: "var(--text-muted)" }}>{u.email}</td>
                  <td>
                    <Badge tone={ROLE_TONES[u.role.name] ?? "neutral"}>{roleLabel(u.role.name)}</Badge>
                  </td>
                  <td>{u.department.name}</td>
                  <td>
                    <Badge tone={u.isActive ? "success" : "neutral"}>
                      {u.isActive ? "Đang hoạt động" : "Đã vô hiệu hoá"}
                    </Badge>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Pencil size={15} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/users/${u.id}/edit`);
                      }}
                    >
                      Sửa
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
