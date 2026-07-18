import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GitBranch, Pencil, Plus, Trash2, ChevronRight } from "lucide-react";
import { apiDelete, apiGet, ApiError } from "../api/client";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  SkeletonRows,
  useToast,
} from "../components/ui";
import { roleLabel, typeLabel } from "../lib/labels";
import type { Workflow } from "../types";

export function WorkflowListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<Workflow | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setLoading(true);
    return apiGet<Workflow[]>("/api/workflows")
      .then(setWorkflows)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/workflows/${pendingDelete.id}`);
      setPendingDelete(null);
      toast.success(`Đã xoá luồng duyệt "${typeLabel(pendingDelete.name)}"`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Xoá luồng duyệt thất bại");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Luồng duyệt văn bản"
        subtitle="Định nghĩa loại văn bản nào cần đi qua những ai, theo thứ tự nào"
        actions={
          <Button
            variant="primary"
            leftIcon={<Plus size={17} />}
            onClick={() => navigate("/workflows/new")}
          >
            Tạo flow mới
          </Button>
        }
      />

      {loading ? (
        <div className="table-wrap">
          <SkeletonRows rows={3} cols={3} />
        </div>
      ) : workflows.length === 0 ? (
        <div className="card">
          <EmptyState icon={<GitBranch size={26} />} title="Chưa có luồng duyệt nào" />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
          {workflows.map((w) => (
            <div key={w.id} className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--sp-3)" }}>
                <div>
                  <div className="table__primary">{typeLabel(w.name)}</div>
                  {w.description && (
                    <div style={{ color: "var(--text-muted)", marginTop: "var(--sp-1)" }}>{w.description}</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "var(--sp-2)", flexShrink: 0 }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Pencil size={15} />}
                    onClick={() => navigate(`/workflows/${w.id}/edit`)}
                  >
                    Sửa
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Trash2 size={15} />}
                    onClick={() => setPendingDelete(w)}
                  >
                    Xoá
                  </Button>
                </div>
              </div>

              <div className="flow-card-mini">
                {[...w.steps]
                  .sort((a, b) => a.stepOrder - b.stepOrder)
                  .map((s, i, arr) => (
                    <span key={s.id} className="flow-card-mini__step">
                      <span className="flow-card-mini__num">{i + 1}</span>
                      {roleLabel(s.approverRole)}
                      {i < arr.length - 1 && (
                        <ChevronRight size={14} color="var(--text-muted)" style={{ marginLeft: "var(--sp-1)" }} />
                      )}
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Xoá luồng duyệt"
        message={`Xoá luồng duyệt "${pendingDelete ? typeLabel(pendingDelete.name) : ""}"? Không thể hoàn tác.`}
        confirmLabel="Xoá"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
