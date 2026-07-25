import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, Pencil, Users } from "lucide-react";
import { apiGet, ApiError } from "../api/client";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  SkeletonRows,
  useToast,
} from "../components/ui";
import { roleLabel, ROLE_TONES } from "../lib/labels";
import type { User } from "../types";

export function UserListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  function load() {
    setLoading(true);
    apiGet<User[]>("/api/users")
      .then((data) => {
        setUsers(data);
        setLoadError(false);
      })
      .catch((err) => {
        setLoadError(true);
        toast.error(err instanceof ApiError ? err.message : "Không tải được danh sách user");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ tải 1 lần lúc mount, load() không đổi identity theo state nào cần theo dõi
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
      ) : loadError && users.length === 0 ? (
        <Alert tone="danger">
          Không tải được danh sách user.{" "}
          <Button variant="ghost" size="sm" onClick={load}>
            Thử lại
          </Button>
        </Alert>
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
