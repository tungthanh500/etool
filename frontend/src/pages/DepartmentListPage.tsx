import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "../api/client";
import {
  Alert,
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
import type { Department } from "../types";

export function DepartmentListPage() {
  const toast = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [editing, setEditing] = useState<Department | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setLoading(true);
    return apiGet<Department[]>("/api/departments")
      .then((data) => {
        setDepartments(data);
        setLoadError(false);
      })
      .catch((err) => {
        setLoadError(true);
        toast.error(err instanceof ApiError ? err.message : "Không tải được danh sách phòng ban");
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
    setError(null);
    setFormOpen(true);
  }

  function openEdit(d: Department) {
    setEditing(d);
    setName(d.name);
    setError(null);
    setFormOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (editing) {
        await apiPatch(`/api/departments/${editing.id}`, { name });
        toast.success("Đã cập nhật phòng ban");
      } else {
        await apiPost("/api/departments", { name });
        toast.success("Đã tạo phòng ban");
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lưu phòng ban thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/departments/${pendingDelete.id}`);
      setPendingDelete(null);
      toast.success(`Đã xoá phòng ban "${pendingDelete.name}"`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Xoá phòng ban thất bại");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Phòng ban"
        subtitle="Quản lý danh sách phòng ban trong tổ chức"
        actions={
          <Button variant="primary" leftIcon={<Plus size={17} />} onClick={openCreate}>
            Thêm phòng ban
          </Button>
        }
      />

      {loading ? (
        <div className="table-wrap">
          <SkeletonRows rows={3} cols={2} />
        </div>
      ) : loadError && departments.length === 0 ? (
        <Alert tone="danger">
          Không tải được danh sách phòng ban.{" "}
          <Button variant="ghost" size="sm" onClick={load}>
            Thử lại
          </Button>
        </Alert>
      ) : departments.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Building2 size={26} />} title="Chưa có phòng ban nào" />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tên phòng ban</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.id}>
                  <td className="table__primary">{d.name}</td>
                  <td style={{ textAlign: "right" }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Pencil size={15} />}
                      onClick={() => openEdit(d)}
                    >
                      Sửa
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Trash2 size={15} />}
                      onClick={() => setPendingDelete(d)}
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
        title={editing ? "Sửa phòng ban" : "Thêm phòng ban"}
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
          <Field label="Tên phòng ban">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Phòng Hành chính - Kế toán"
              required
              autoFocus
            />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Xoá phòng ban"
        message={`Xoá phòng ban "${pendingDelete?.name}"? Không thể hoàn tác.`}
        confirmLabel="Xoá"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
