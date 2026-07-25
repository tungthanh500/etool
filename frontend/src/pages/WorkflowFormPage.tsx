import { useEffect, useMemo, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  FlagTriangleRight,
  GripVertical,
  Plus,
  Trash2,
  UserCheck,
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
import type { Department, User, Workflow, WorkflowStepKind } from "../types";

// State soạn thảo 1 bước trên form — gọn hơn payload API (departmentId/approverUserId
// rỗng khi không áp dụng), map 2 chiều sang WorkflowStep lúc load và payload lúc submit.
interface StepFormState {
  kind: WorkflowStepKind;
  departmentId: string;
  approverUserId: string; // "" = bất kỳ thành viên nào của phòng ban
}

interface DropTarget {
  index: number;
  position: "before" | "after";
}

const EMPTY_STEP: StepFormState = { kind: "CREATOR_DEPT_HEAD", departmentId: "", approverUserId: "" };

export function WorkflowFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<StepFormState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  // Chặn hẳn form khi load lỗi (không hiện form rỗng) — cùng lý do với UserFormPage: form
  // sửa hiện rỗng trông giống "tạo mới", bấm Lưu sẽ PATCH đè cấu hình luồng duyệt thật.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  function load() {
    setLoading(true);
    Promise.all([
      apiGet<Department[]>("/api/departments"),
      // Chỉ Admin vào được trang này (workflow:manage đi cùng user:manage ở role hiện tại) —
      // tái dùng /api/users có sẵn cho ô chọn "đích danh 1 người" thay vì thêm endpoint riêng.
      apiGet<User[]>("/api/users"),
      isEdit ? apiGet<Workflow>(`/api/workflows/${id}`) : Promise.resolve(null),
    ])
      .then(([deptList, userList, wf]) => {
        setDepartments(deptList);
        setUsers(userList);
        if (wf) {
          setName(wf.name);
          setDescription(wf.description ?? "");
          setSteps(
            [...wf.steps]
              .sort((a, b) => a.stepOrder - b.stepOrder)
              .map((s) => ({
                kind: s.kind,
                departmentId: s.departmentId ?? "",
                approverUserId: s.approverUserId ?? "",
              })),
          );
        } else {
          setSteps([{ ...EMPTY_STEP }]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ cần chạy lại khi id/isEdit đổi
  }, [id, isEdit]);

  const usersByDept = useMemo(() => {
    const map = new Map<string, User[]>();
    for (const u of users) {
      if (!u.isActive) continue;
      const list = map.get(u.departmentId) ?? [];
      list.push(u);
      map.set(u.departmentId, list);
    }
    return map;
  }, [users]);

  function addStep() {
    setSteps((prev) => [...prev, { ...EMPTY_STEP, departmentId: departments[0]?.id ?? "" }]);
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
  function updateStep(idx: number, patch: Partial<StepFormState>) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function setStepKind(idx: number, kind: WorkflowStepKind) {
    updateStep(idx, {
      kind,
      departmentId: kind === "DEPARTMENT" ? (departments[0]?.id ?? "") : "",
      approverUserId: "",
    });
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
    if (steps.some((s) => s.kind === "DEPARTMENT" && !s.departmentId)) {
      setError("Mỗi bước \"Phòng ban chỉ định\" phải chọn phòng ban");
      return;
    }
    const payloadSteps = steps.map((s) =>
      s.kind === "CREATOR_DEPT_HEAD"
        ? { kind: "CREATOR_DEPT_HEAD" as const }
        : {
            kind: "DEPARTMENT" as const,
            departmentId: s.departmentId,
            ...(s.approverUserId ? { approverUserId: s.approverUserId } : {}),
          },
    );
    setSubmitting(true);
    try {
      if (isEdit) {
        await apiPatch(`/api/workflows/${id}`, { description, steps: payloadSteps });
      } else {
        await apiPost("/api/workflows", { name, description, steps: payloadSteps });
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

  function previewLabel(s: StepFormState): string {
    if (s.kind === "CREATOR_DEPT_HEAD") return "Trưởng phòng (phòng người nộp)";
    const deptName = departments.find((d) => d.id === s.departmentId)?.name ?? "— chưa chọn phòng ban —";
    if (!s.approverUserId) return `${deptName} — bất kỳ thành viên`;
    const userName = users.find((u) => u.id === s.approverUserId)?.fullName ?? "?";
    return `${deptName} — ${userName}`;
  }

  if (loading) return <PageLoading />;

  if (loadError) {
    return (
      <div>
        <PageHeader
          title={isEdit ? "Sửa luồng duyệt" : "Tạo luồng duyệt mới"}
          backTo="/workflows"
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
        title={isEdit ? "Sửa luồng duyệt" : "Tạo luồng duyệt mới"}
        backTo="/workflows"
        backLabel="Quay lại danh sách"
      />

      <Card>
        <form className="form-stack form-stack--roomy" onSubmit={handleSubmit}>
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
                const dropCls =
                  dropTarget?.index === i
                    ? dropTarget.position === "before"
                      ? "is-drop-before"
                      : "is-drop-after"
                    : "";
                const candidateUsers = s.departmentId ? (usersByDept.get(s.departmentId) ?? []) : [];
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
                      <Select value={s.kind} onChange={(e) => setStepKind(i, e.target.value as WorkflowStepKind)}>
                        <option value="CREATOR_DEPT_HEAD">Trưởng phòng của người nộp</option>
                        <option value="DEPARTMENT">Phòng ban chỉ định</option>
                      </Select>

                      {s.kind === "CREATOR_DEPT_HEAD" ? (
                        <div className="flow-step__hint">
                          <Building2 size={13} />
                          Người duyệt là Trưởng phòng cùng phòng ban với người nộp
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-2)" }}>
                          <Select
                            value={s.departmentId}
                            onChange={(e) => updateStep(i, { departmentId: e.target.value, approverUserId: "" })}
                          >
                            {departments.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </Select>
                          <Select
                            value={s.approverUserId}
                            onChange={(e) => updateStep(i, { approverUserId: e.target.value })}
                          >
                            <option value="">— Bất kỳ thành viên nào —</option>
                            {candidateUsers.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.fullName}
                              </option>
                            ))}
                          </Select>
                        </div>
                      )}
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
                      <span className="flow-preview__marker">
                        {s.kind === "CREATOR_DEPT_HEAD" ? <Building2 size={13} /> : <UserCheck size={13} />}
                      </span>
                      <span className="flow-preview__label">{previewLabel(s)}</span>
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
