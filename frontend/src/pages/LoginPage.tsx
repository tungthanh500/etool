import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { UserCircle, Lock, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";
import { Button, Field, Input, Alert } from "../components/ui";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đăng nhập thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand__mark">
            <ShieldCheck size={26} />
          </span>
          <div className="login-brand__title">e-Approval</div>
          <div className="login-brand__sub">
            Hệ thống trình duyệt &amp; phê duyệt văn bản nội bộ
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <Field label="Tên đăng nhập">
            <div className="input-icon">
              <UserCircle size={17} />
              <Input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="tendangnhap"
                required
                autoFocus
              />
            </div>
          </Field>

          <Field label="Mật khẩu">
            <div className="input-icon input-icon--toggle">
              <Lock size={17} />
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                className="input-icon__toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </Field>

          {error && <Alert tone="danger">{error}</Alert>}

          <Button type="submit" variant="primary" block loading={submitting}>
            {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </form>
      </div>
    </div>
  );
}
