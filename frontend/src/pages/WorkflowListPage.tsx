import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GitBranch, Pencil, Plus, Trash2, ChevronRight, UserPlus, FlagTriangleRight } from "lucide-react";
import { apiDelete, apiGet, ApiError } from "../api/client";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  SkeletonRows,
  useToast,
} from "../components/ui";
import { stepLabel, typeLabel } from "../lib/labels";
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
        <div className="wf-list">
          {workflows.map((w) => {
            const steps = [...w.steps].sort((a, b) => a.stepOrder - b.stepOrder);
            return (
              <div key={w.id} className="wf-card">
                <div className="wf-card__head">
                  <div className="wf-card__title-row">
                    <span className="wf-card__icon">
                      <GitBranch size={20} />
                    </span>
                    <div>
                      <div className="wf-card__title">{typeLabel(w.name)}</div>
                      {w.description && <div className="wf-card__desc">{w.description}</div>}
                    </div>
                  </div>
                  <div className="wf-card__actions">
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

                <div className="wf-flow">
                  <span className="wf-flow__endpoint">
                    <UserPlus size={14} />
                    Người nộp
                  </span>
                  {steps.map((s) => (
                    <span key={s.id} className="wf-flow__seg">
                      <ChevronRight size={16} className="wf-flow__arrow" />
                      <span className="wf-flow__step">
                        <span className="wf-flow__num">{s.stepOrder}</span>
                        {stepLabel(s)}
                      </span>
                    </span>
                  ))}
                  <span className="wf-flow__seg">
                    <ChevronRight size={16} className="wf-flow__arrow" />
                    <span className="wf-flow__endpoint wf-flow__endpoint--done">
                      <FlagTriangleRight size={14} />
                      Hoàn tất
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
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
