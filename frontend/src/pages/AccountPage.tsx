import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, PenLine, Trash2, Upload, UserCog, UserCheck } from "lucide-react";
import { apiGet, apiPatch, apiPost, apiPostForm, apiDelete, ApiError } from "../api/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DateInput,
  Field,
  Input,
  PageHeader,
  Select,
  useToast,
} from "../components/ui";
import { roleLabel } from "../lib/labels";
import { formatDate } from "../lib/formatDate";
import { canApproveAnything } from "../lib/permissions";
import { useAuth } from "../context/AuthContext";
import type { Delegation, DelegationUser, User } from "../types";

// Trạng thái hiệu lực của một uỷ quyền tại thời điểm hiện tại.
function delegationStatus(d: Delegation): { label: string; tone: "success" | "warning" | "neutral" } {
  const now = Date.now();
  if (now < new Date(d.startDate).getTime()) return { label: "Sắp hiệu lực", tone: "warning" };
  if (now > new Date(d.endDate).getTime()) return { label: "Đã hết hạn", tone: "neutral" };
  return { label: "Đang hiệu lực", tone: "success" };
}

export function AccountPage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const forced = searchParams.get("force") === "1" || user?.mustChangePassword === true;

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [candidates, setCandidates] = useState<DelegationUser[]>([]);
  const [delegateTo, setDelegateTo] = useState("");
  const [delegateFrom, setDelegateFrom] = useState("");
  const [delegateUntil, setDelegateUntil] = useState("");
  const [delegationError, setDelegationError] = useState<string | null>(null);
  const [creatingDelegation, setCreatingDelegation] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<Delegation | null>(null);
  const [revoking, setRevoking] = useState(false);

  const [signatureVersion, setSignatureVersion] = useState(0);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearingSignature, setClearingSignature] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Role không duyệt gì (vd. Staff) thì uỷ quyền/chữ ký chỉ có nghĩa khi NHẬN uỷ quyền
  // từ người khác — ẩn các card đó đi cho đỡ rối (R25), trừ khi có uỷ quyền liên quan.
  const isApprover = canApproveAnything(user);

  useEffect(() => {
    apiGet<Delegation[]>("/api/delegations").then(setDelegations);
    // Ô chọn người nhận chỉ hiện với người có vai trò duyệt — khỏi gọi thừa.
    if (isApprover) {
      apiGet<DelegationUser[]>("/api/delegations/candidates").then((cands) => {
        setCandidates(cands);
        if (cands.length > 0) setDelegateTo(cands[0].id);
      });
    }
  }, [isApprover]);

  if (!user) return null;

  const profileDirty = fullName !== user.fullName || email !== user.email;

  async function handleCreateDelegation(e: FormEvent) {
    e.preventDefault();
    setDelegationError(null);
    setCreatingDelegation(true);
    try {
      const created = await apiPost<Delegation>("/api/delegations", {
        toUserId: delegateTo,
        startDate: delegateFrom,
        endDate: delegateUntil,
      });
      setDelegations((prev) => [created, ...prev]);
      setDelegateFrom("");
      setDelegateUntil("");
      toast.success("Đã tạo uỷ quyền duyệt");
    } catch (err) {
      setDelegationError(err instanceof ApiError ? err.message : "Tạo uỷ quyền thất bại");
    } finally {
      setCreatingDelegation(false);
    }
  }

  async function handleRevokeDelegation() {
    if (!pendingRevoke) return;
    setRevoking(true);
    try {
      await apiDelete(`/api/delegations/${pendingRevoke.id}`);
      setDelegations((prev) => prev.filter((d) => d.id !== pendingRevoke.id));
      setPendingRevoke(null);
      toast.success("Đã thu hồi uỷ quyền");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Thu hồi uỷ quyền thất bại");
    } finally {
      setRevoking(false);
    }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setSavingProfile(true);
    try {
      const updated = await apiPatch<User>("/api/auth/profile", { fullName, email });
      setUser(updated);
      toast.success("Đã cập nhật thông tin cá nhân");
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Cập nhật thông tin thất bại");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword !== confirmPassword) {
      setPasswordError("Mật khẩu mới nhập lại không khớp");
      return;
    }
    setChangingPassword(true);
    try {
      const updated = await apiPost<User>("/api/auth/change-password", { oldPassword, newPassword });
      setUser(updated);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Đã đổi mật khẩu");
      if (forced) navigate("/documents");
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Đổi mật khẩu thất bại");
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleSignatureFile(file: File) {
    setSignatureError(null);
    setUploadingSignature(true);
    try {
      const formData = new FormData();
      formData.append("signature", file);
      const updated = await apiPostForm<User>("/api/auth/signature", formData);
      setUser(updated);
      setSignatureVersion((v) => v + 1);
      toast.success("Đã cập nhật chữ ký mẫu");
    } catch (err) {
      setSignatureError(err instanceof ApiError ? err.message : "Tải chữ ký lên thất bại");
    } finally {
      setUploadingSignature(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleClearSignature() {
    setClearingSignature(true);
    try {
      const updated = await apiDelete<User>("/api/auth/signature");
      setUser(updated);
      setSignatureVersion((v) => v + 1);
      setConfirmClear(false);
      toast.success("Đã xoá chữ ký mẫu");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Xoá chữ ký thất bại");
    } finally {
      setClearingSignature(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Tài khoản của tôi"
        subtitle={
          isApprover || delegations.length > 0
            ? "Thông tin cá nhân, mật khẩu, uỷ quyền duyệt và chữ ký mẫu"
            : "Thông tin cá nhân và mật khẩu"
        }
      />

      {forced && (
        <Alert tone="warning">
          Mật khẩu của bạn do quản trị viên cấp — vui lòng đổi mật khẩu trước khi tiếp tục sử dụng hệ thống.
        </Alert>
      )}

      <Card>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          <UserCog size={18} />
          Thông tin cá nhân
        </h3>
        <form className="form-stack" onSubmit={handleSaveProfile}>
          <Field label="Tên đăng nhập" hint="Chỉ quản trị viên thay đổi được — liên hệ Admin nếu cần đổi">
            <Input value={user.username} disabled style={{ fontFamily: "var(--font-mono)" }} />
          </Field>
          <Field label="Họ tên">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </Field>
          <Field label="Email liên hệ" hint="Chỉ là thông tin liên hệ — KHÔNG dùng để đăng nhập">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Vai trò" hint="Chỉ quản trị viên thay đổi được">
            <Input value={roleLabel(user.role.name)} disabled />
          </Field>
          <Field label="Phòng ban" hint="Chỉ quản trị viên thay đổi được">
            <Input value={user.department.name} disabled />
          </Field>

          {profileError && <Alert tone="danger">{profileError}</Alert>}

          <div>
            <Button type="submit" variant="primary" loading={savingProfile} disabled={!profileDirty}>
              {savingProfile ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          <KeyRound size={18} />
          Đổi mật khẩu
        </h3>
        <form className="form-stack" onSubmit={handleChangePassword}>
          <Field label="Mật khẩu hiện tại">
            <Input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="Mật khẩu mới" hint="Tối thiểu 8 ký tự">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </Field>
          <Field label="Nhập lại mật khẩu mới">
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </Field>

          {passwordError && <Alert tone="danger">{passwordError}</Alert>}

          <div>
            <Button type="submit" variant="primary" loading={changingPassword}>
              {changingPassword ? "Đang lưu..." : "Đổi mật khẩu"}
            </Button>
          </div>
        </form>
      </Card>

      {(isApprover || delegations.length > 0) && (
      <Card>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          <UserCheck size={18} />
          Uỷ quyền duyệt
        </h3>
        <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
          Trong khoảng thời gian uỷ quyền, người được uỷ quyền sẽ thấy và duyệt được các hồ sơ
          đang chờ bạn duyệt. Nhật ký duyệt ghi rõ ai duyệt thay ai.
        </p>

        {delegations.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: "var(--sp-4)" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Uỷ quyền</th>
                  <th>Thời gian</th>
                  <th>Trạng thái</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {delegations.map((d) => {
                  const st = delegationStatus(d);
                  const givenByMe = d.fromUserId === user.id;
                  return (
                    <tr key={d.id}>
                      <td>
                        {givenByMe ? (
                          <>Bạn → <span className="table__primary">{d.toUser.fullName}</span></>
                        ) : (
                          <><span className="table__primary">{d.fromUser.fullName}</span> → Bạn</>
                        )}{" "}
                        <span style={{ color: "var(--text-muted)" }}>
                          ({roleLabel(givenByMe ? d.toUser.role.name : d.fromUser.role.name)})
                        </span>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {formatDate(d.startDate)} – {formatDate(d.endDate)}
                      </td>
                      <td>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {givenByMe && (
                          <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<Trash2 size={15} />}
                            onClick={() => setPendingRevoke(d)}
                          >
                            Thu hồi
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {isApprover && (
        <form className="form-stack" onSubmit={handleCreateDelegation}>
          <Field label="Uỷ quyền cho">
            <Select value={delegateTo} onChange={(e) => setDelegateTo(e.target.value)}>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} ({roleLabel(c.role.name)})
                </option>
              ))}
            </Select>
          </Field>
          <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap" }}>
            <Field label="Từ ngày">
              <DateInput value={delegateFrom} onChange={setDelegateFrom} required />
            </Field>
            <Field label="Đến hết ngày">
              <DateInput value={delegateUntil} onChange={setDelegateUntil} required />
            </Field>
          </div>

          {delegationError && <Alert tone="danger">{delegationError}</Alert>}

          <div>
            <Button type="submit" variant="primary" loading={creatingDelegation} disabled={candidates.length === 0}>
              {creatingDelegation ? "Đang tạo..." : "Tạo uỷ quyền"}
            </Button>
          </div>
        </form>
        )}
      </Card>
      )}

      {(isApprover || delegations.length > 0) && (
      <Card>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          <PenLine size={18} />
          Chữ ký mẫu
        </h3>
        <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
          Dùng để đóng vào bản PDF khi văn bản được duyệt xong. Khuyến nghị ảnh PNG nền trong suốt để
          không che nội dung văn bản. Chỉ mang tính trực quan, không phải chữ ký điện tử có giá trị pháp lý.
        </p>

        {user.signatureUrl ? (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-4)", flexWrap: "wrap" }}>
            <img
              key={signatureVersion}
              src={`/api/auth/signature?v=${signatureVersion}`}
              alt="Chữ ký mẫu"
              style={{
                maxHeight: 100,
                maxWidth: 240,
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                background: "#fff",
                padding: "var(--sp-2)",
              }}
            />
            <div style={{ display: "flex", gap: "var(--sp-3)" }}>
              <Button
                type="button"
                variant="ghost"
                leftIcon={<Upload size={16} />}
                loading={uploadingSignature}
                onClick={() => fileInputRef.current?.click()}
              >
                Thay ảnh khác
              </Button>
              <Button
                type="button"
                variant="danger"
                leftIcon={<Trash2 size={16} />}
                onClick={() => setConfirmClear(true)}
              >
                Xoá
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="primary"
            leftIcon={<Upload size={16} />}
            loading={uploadingSignature}
            onClick={() => fileInputRef.current?.click()}
          >
            Tải chữ ký lên
          </Button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleSignatureFile(file);
          }}
        />

        {signatureError && (
          <div style={{ marginTop: "var(--sp-3)" }}>
            <Alert tone="danger">{signatureError}</Alert>
          </div>
        )}
      </Card>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Xoá chữ ký mẫu"
        message="Bạn có chắc muốn xoá chữ ký mẫu hiện tại?"
        confirmLabel="Xoá"
        danger
        loading={clearingSignature}
        onConfirm={handleClearSignature}
        onCancel={() => setConfirmClear(false)}
      />

      <ConfirmDialog
        open={pendingRevoke !== null}
        title="Thu hồi uỷ quyền"
        message={`Thu hồi uỷ quyền cho ${pendingRevoke?.toUser.fullName}? Người này sẽ mất quyền duyệt thay bạn ngay lập tức.`}
        confirmLabel="Thu hồi"
        danger
        loading={revoking}
        onConfirm={handleRevokeDelegation}
        onCancel={() => setPendingRevoke(null)}
      />
    </div>
  );
}
