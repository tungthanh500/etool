import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { PERMISSION_KEYS } from "@etool/shared";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "../api/client";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  SkeletonRows,
  useToast,
} from "../components/ui";
import { PERMISSION_LABELS } from "../lib/labels";
import type { Role } from "../types";

export function RoleListPage() {
  const toast = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [editing, setEditing] = useState<Role | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [isWildcard, setIsWildcard] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setLoading(true);
    return apiGet<Role[]>("/api/roles")
      .then((data) => {
        setRoles(data);
        setLoadError(false);
      })
      .catch((err) => {
        // Giữ nguyên danh sách cũ khi lỗi — không xoá về rỗng để tránh hiểu nhầm "chưa có vai trò nào".
        setLoadError(true);
        toast.error(err instanceof ApiError ? err.message : "Không tải được danh sách vai trò");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ tải 1 lần lúc mount
  }, []);

  function openCreate() {
    setEditing(null);
    setName("");
    setIsWildcard(false);
    setChecked(new Set());
    setError(null);
    setFormOpen(true);
  }

  function openEdit(r: Role) {
    setEditing(r);
    setName(r.name);
    setIsWildcard(r.permissions.includes("*"));
    setChecked(new Set(r.permissions.filter((p) => p !== "*")));
    setError(null);
    setFormOpen(true);
  }

  function togglePermission(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const permissions = isWildcard ? ["*"] : [...checked];
    try {
      if (editing) {
        await apiPatch(`/api/roles/${editing.id}`, { name, permissions });
        toast.success("Đã cập nhật vai trò");
      } else {
        await apiPost("/api/roles", { name, permissions });
        toast.success("Đã tạo vai trò");
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lưu vai trò thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/roles/${pendingDelete.id}`);
      setPendingDelete(null);
      toast.success(`Đã xoá vai trò "${pendingDelete.name}"`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Xoá vai trò thất bại");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Vai trò & quyền"
        subtitle="Tạo vai trò và chọn quyền cho từng vai trò — gán vai trò cho tài khoản ở trang Quản lý user"
        actions={
          <Button variant="primary" leftIcon={<Plus size={17} />} onClick={openCreate}>
            Thêm vai trò
          </Button>
        }
      />

      {loading ? (
        <div className="table-wrap">
          <SkeletonRows rows={4} cols={3} />
        </div>
      ) : loadError && roles.length === 0 ? (
        <Alert tone="danger">
          Không tải được danh sách vai trò.{" "}
          <Button variant="ghost" size="sm" onClick={load}>
            Thử lại
          </Button>
        </Alert>
      ) : roles.length === 0 ? (
        <div className="card">
          <EmptyState icon={<ShieldCheck size={26} />} title="Chưa có vai trò nào" />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Vai trò</th>
                <th>Quyền</th>
                <th>Số tài khoản</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id}>
                  <td className="table__primary">{r.name}</td>
                  <td>
                    {r.permissions.includes("*") ? (
                      <Badge tone="orange">Toàn quyền</Badge>
                    ) : r.permissions.length === 0 ? (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-1)" }}>
                        {r.permissions.map((p) => (
                          <Badge key={p} tone="neutral">
                            {PERMISSION_LABELS[p] ?? p}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>{r._count?.users ?? 0}</td>
                  <td style={{ textAlign: "right" }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Pencil size={15} />}
                      onClick={() => openEdit(r)}
                    >
                      Sửa
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Trash2 size={15} />}
                      onClick={() => setPendingDelete(r)}
                    >
                      Xoá
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={formOpen}
        title={editing ? "Sửa vai trò" : "Thêm vai trò"}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={submitting}>
              Huỷ
            </Button>
            <Button variant="primary" onClick={handleSubmit} loading={submitting}>
              {submitting ? "Đang lưu..." : "Lưu"}
            </Button>
          </>
        }
      >
        <form className="form-stack" onSubmit={handleSubmit}>
          <Field label="Tên vai trò">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Kiểm soát nội bộ"
              required
              autoFocus
            />
          </Field>

          <Field
            label="Quyền"
            hint="Quyền duyệt hồ sơ thật sự đến từ vị trí trong Luồng duyệt — các quyền ở đây điều khiển chức năng hệ thống và hiển thị giao diện."
          >
            <div className="form-stack" style={{ gap: "var(--sp-2)" }}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={isWildcard}
                  onChange={(e) => setIsWildcard(e.target.checked)}
                />
                <strong>Toàn quyền (Admin)</strong>
              </label>
              {PERMISSION_KEYS.map((key) => (
                <label key={key} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={isWildcard || checked.has(key)}
                    disabled={isWildcard}
                    onChange={() => togglePermission(key)}
                  />
                  {PERMISSION_LABELS[key] ?? key}
                </label>
              ))}
            </div>
          </Field>

          {error && <Alert tone="danger">{error}</Alert>}
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Xoá vai trò"
        message={`Xoá vai trò "${pendingDelete?.name}"? Không thể hoàn tác.`}
        confirmLabel="Xoá"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
