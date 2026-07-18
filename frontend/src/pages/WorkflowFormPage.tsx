import { useEffect, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Check,
  FlagTriangleRight,
  GripVertical,
  Plus,
  Trash2,
  UserPlus,
} from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "../api/client";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Input,
  PageHeader,
  PageLoading,
  Select,
  Textarea,
} from "../components/ui";
import { roleLabel } from "../lib/labels";
import type { Role, Workflow } from "../types";

// Chú thích phạm vi của một bước — phản ánh đúng logic backend hiện có
// (chỉ Dept_Head bị ràng buộc duyệt trong cùng phòng ban người nộp).
function scopeHint(approverRole: string): { icon: typeof Check; text: string } {
  if (approverRole === "Dept_Head") {
    return { icon: Building2, text: "Cùng phòng ban người nộp" };
  }
  return { icon: Check, text: "Bất kỳ ai giữ vai trò này" };
}

interface DropTarget {
  index: number;
  position: "before" | "after";
}

export function WorkflowFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [roles, setRoles] = useState<Role[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet<Role[]>("/api/roles"),
      isEdit ? apiGet<Workflow>(`/api/workflows/${id}`) : Promise.resolve(null),
    ])
      .then(([rolesList, wf]) => {
        setRoles(rolesList);
        if (wf) {
          setName(wf.name);
          setDescription(wf.description ?? "");
          setSteps([...wf.steps].sort((a, b) => a.stepOrder - b.stepOrder).map((s) => s.approverRole));
        } else if (rolesList.length > 0) {
          setSteps([rolesList[0].name]);
        }
      })
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  function addStep() {
    setSteps((prev) => [...prev, roles[0]?.name ?? ""]);
  }
  function removeStep(idx: number) {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  }
  function moveStep(idx: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }
  function setStepRole(idx: number, roleName: string) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? roleName : s)));
  }

  // Kéo-thả đổi thứ tự bước. Nút mũi tên lên/xuống vẫn giữ cho bàn phím.
  function reorder(from: number, to: number) {
    setSteps((prev) => {
      if (from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }
  function handleDragOver(e: DragEvent, idx: number) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const position = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setDropTarget({ index: idx, position });
  }
  function handleDrop() {
    if (dragIndex === null || dropTarget === null) return;
    let to = dropTarget.position === "after" ? dropTarget.index + 1 : dropTarget.index;
    // Khi gỡ phần tử nguồn ở trước vị trí đích, đích dịch lùi 1.
    if (dragIndex < to) to -= 1;
    reorder(dragIndex, to);
    setDragIndex(null);
    setDropTarget(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (steps.length === 0) {
      setError("Cần ít nhất 1 bước duyệt");
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit) {
        await apiPatch(`/api/workflows/${id}`, { description, steps });
      } else {
        await apiPost("/api/workflows", { name, description, steps });
      }
      navigate("/workflows");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lưu luồng duyệt thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiDelete(`/api/workflows/${id}`);
      navigate("/workflows");
    } catch (err) {
      setConfirmingDelete(false);
      setError(err instanceof ApiError ? err.message : "Xoá luồng duyệt thất bại");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <PageLoading />;

  return (
    <div>
      <PageHeader
        title={isEdit ? "Sửa luồng duyệt" : "Tạo luồng duyệt mới"}
        backTo="/workflows"
        backLabel="Quay lại danh sách"
      />

      <Card>
        <form className="form-stack" onSubmit={handleSubmit}>
          <Field
            label="Tên loại văn bản"
            hint={
              isEdit
                ? "Không thể đổi tên sau khi tạo"
                : "Tên này hiển thị trực tiếp làm nhãn loại văn bản trong toàn hệ thống — nên dùng tiếng Việt dễ đọc, vd. \"Đề xuất công tác\""
            }
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Đề xuất công tác"
              required
              disabled={isEdit}
              autoFocus={!isEdit}
            />
          </Field>

          <Field label="Mô tả" hint="Không bắt buộc">
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả ngắn gọn về loại văn bản này"
            />
          </Field>

          <Field label="Các bước duyệt (kéo thả để đổi thứ tự)">
            <div className="flow-steps">
              {steps.map((s, i) => {
                const hint = scopeHint(s);
                const HintIcon = hint.icon;
                const dropCls =
                  dropTarget?.index === i
                    ? dropTarget.position === "before"
                      ? "is-drop-before"
                      : "is-drop-after"
                    : "";
                return (
                  <div
                    key={i}
                    className={`flow-step ${dragIndex === i ? "is-dragging" : ""} ${dropCls}`}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={handleDrop}
                  >
                    <span
                      className="flow-step__handle"
                      draggable
                      onDragStart={() => setDragIndex(i)}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setDropTarget(null);
                      }}
                      aria-label="Kéo để đổi thứ tự"
                    >
                      <GripVertical size={17} />
                    </span>
                    <span className="flow-step__num">{i + 1}</span>
                    <div className="flow-step__body">
                      <Select value={s} onChange={(e) => setStepRole(i, e.target.value)}>
                        {roles.map((r) => (
                          <option key={r.id} value={r.name}>
                            {roleLabel(r.name)}
                          </option>
                        ))}
                      </Select>
                      <div className="flow-step__hint">
                        <HintIcon size={13} />
                        {hint.text}
                      </div>
                    </div>
                    <div className="flow-step__actions">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        iconOnly
                        aria-label="Chuyển lên"
                        disabled={i === 0}
                        onClick={() => moveStep(i, -1)}
                      >
                        <ArrowUp size={15} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        iconOnly
                        aria-label="Chuyển xuống"
                        disabled={i === steps.length - 1}
                        onClick={() => moveStep(i, 1)}
                      >
                        <ArrowDown size={15} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        iconOnly
                        aria-label="Xoá bước"
                        onClick={() => removeStep(i)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              leftIcon={<Plus size={15} />}
              onClick={addStep}
              disabled={roles.length === 0}
              style={{ marginTop: "var(--sp-2)" }}
            >
              Thêm bước
            </Button>
          </Field>

          <Field label="Xem trước sơ đồ duyệt">
            {steps.length === 0 ? (
              <div className="flow-preview__empty">Chưa có bước nào — thêm bước để xem sơ đồ.</div>
            ) : (
              <div className="flow-preview">
                <div className="flow-preview__node flow-preview__node--endpoint">
                  <span className="flow-preview__marker">
                    <UserPlus size={15} />
                  </span>
                  <span className="flow-preview__label">Nhân viên nộp</span>
                </div>
                {steps.map((s, i) => (
                  <div key={i} style={{ display: "contents" }}>
                    <div className="flow-preview__connector" />
                    <div className="flow-preview__node">
                      <span className="flow-preview__marker">{i + 1}</span>
                      <span className="flow-preview__label">{roleLabel(s)}</span>
                    </div>
                  </div>
                ))}
                <div className="flow-preview__connector" />
                <div className="flow-preview__node flow-preview__node--endpoint">
                  <span className="flow-preview__marker">
                    <FlagTriangleRight size={15} />
                  </span>
                  <span className="flow-preview__label">Hoàn tất</span>
                </div>
              </div>
            )}
          </Field>

          {error && <Alert tone="danger">{error}</Alert>}

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: "var(--sp-3)" }}>
              <Button type="submit" variant="primary" loading={submitting}>
                {submitting ? "Đang lưu..." : "Lưu"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate("/workflows")}>
                Huỷ
              </Button>
            </div>
            {isEdit && (
              <Button
                type="button"
                variant="danger"
                leftIcon={<Trash2 size={15} />}
                onClick={() => setConfirmingDelete(true)}
              >
                Xoá flow
              </Button>
            )}
          </div>
        </form>
      </Card>

      <ConfirmDialog
        open={confirmingDelete}
        title="Xoá luồng duyệt"
        message={`Xoá luồng duyệt "${name}"? Không thể hoàn tác.`}
        confirmLabel="Xoá"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
