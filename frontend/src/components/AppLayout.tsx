import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Inbox,
  Users,
  Building2,
  GitBranch,
  ScrollText,
  Sun,
  Moon,
  Bell,
  BellRing,
  LogOut,
  Menu,
  ChevronDown,
  ShieldCheck,
  UserCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/theme";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { useWebSocket } from "../hooks/useWebSocket";
import { can } from "../lib/permissions";
import { roleLabel, EVENT_LABELS } from "../lib/labels";
import { formatDateTime } from "../lib/formatDate";
import { apiGet, apiPost } from "../api/client";
import { Avatar } from "./ui/Avatar";
import type { NotificationItem, NotificationsResponse } from "../types";

function pageTitle(pathname: string, search: string): string {
  if (pathname.startsWith("/dashboard")) return "Tổng quan";
  if (pathname.startsWith("/users/new")) return "Thêm user";
  if (/^\/users\/.+\/edit/.test(pathname)) return "Sửa user";
  if (pathname.startsWith("/users")) return "Quản lý user";
  if (pathname.startsWith("/departments")) return "Phòng ban";
  if (pathname.startsWith("/workflows/new")) return "Tạo flow";
  if (/^\/workflows\/.+\/edit/.test(pathname)) return "Sửa flow";
  if (pathname.startsWith("/workflows")) return "Luồng duyệt văn bản";
  if (pathname.startsWith("/audit")) return "Nhật ký hệ thống";
  if (pathname.startsWith("/account")) return "Tài khoản của tôi";
  if (pathname.startsWith("/documents/new")) return "Tạo văn bản";
  if (/^\/documents\/.+/.test(pathname)) return "Chi tiết văn bản";
  if (new URLSearchParams(search).get("tab") === "pending") return "Chờ tôi duyệt";
  return "Văn bản của tôi";
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const { resolved, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    supported: pushSupported,
    permission: pushPermission,
    subscribe: subscribePush,
  } = usePushNotifications();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Hộp thông báo (R23): badge chưa đọc + panel danh sách, đồng bộ realtime qua WS.
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifItems, setNotifItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);
  const { lastEvent } = useWebSocket(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiGet<NotificationsResponse>("/api/notifications");
      setNotifItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch {
      // lỗi tải hộp thông báo không được làm vỡ layout — bỏ qua, lần sau thử lại
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications, lastEvent]);

  async function openNotifications() {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next && unreadCount > 0) {
      // Mở panel = đã xem: đánh dấu đọc toàn bộ rồi refetch cho badge tắt.
      try {
        await apiPost("/api/notifications/read-all");
        await fetchNotifications();
      } catch {
        // giữ badge nếu lỗi — không chặn panel
      }
    }
  }

  const canManageUsers = can(user, "user:manage");
  const canManageWorkflows = can(user, "workflow:manage");
  const canViewAudit = can(user, "audit:read");
  const isPending = new URLSearchParams(location.search).get("tab") === "pending";
  const onDocs = location.pathname === "/documents";

  // Đóng menu/drawer khi đổi route.
  useEffect(() => {
    setSidebarOpen(false);
    setMenuOpen(false);
    setNotifOpen(false);
  }, [location.pathname, location.search]);

  // Click ra ngoài hoặc Escape để đóng user menu / panel thông báo.
  useEffect(() => {
    if (!menuOpen && !notifOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, notifOpen]);

  const pushEnabled = pushPermission === "granted";

  return (
    <div className="app-shell">
      <div
        className={`sidebar__backdrop ${sidebarOpen ? "is-open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="sidebar__brand">
          <span className="sidebar__brand-mark">
            <ShieldCheck size={20} />
          </span>
          e-Approval
        </div>

        <nav className="sidebar__nav">
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}
          >
            <span className="nav-item__icon">
              <LayoutDashboard size={18} />
            </span>
            Tổng quan
          </NavLink>
          <Link
            to="/documents"
            className={`nav-item ${onDocs && !isPending ? "is-active" : ""}`}
            aria-current={onDocs && !isPending ? "page" : undefined}
          >
            <span className="nav-item__icon">
              <FileText size={18} />
            </span>
            Văn bản của tôi
          </Link>
          <Link
            to="/documents?tab=pending"
            className={`nav-item ${onDocs && isPending ? "is-active" : ""}`}
            aria-current={onDocs && isPending ? "page" : undefined}
          >
            <span className="nav-item__icon">
              <Inbox size={18} />
            </span>
            Chờ tôi duyệt
          </Link>

          {(canManageUsers || canManageWorkflows || canViewAudit) && (
            <>
              <div className="sidebar__section">Quản trị</div>
              {canManageUsers && (
                <NavLink
                  to="/users"
                  className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}
                >
                  <span className="nav-item__icon">
                    <Users size={18} />
                  </span>
                  Quản lý user
                </NavLink>
              )}
              {canManageUsers && (
                <NavLink
                  to="/departments"
                  className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}
                >
                  <span className="nav-item__icon">
                    <Building2 size={18} />
                  </span>
                  Phòng ban
                </NavLink>
              )}
              {canManageWorkflows && (
                <NavLink
                  to="/workflows"
                  className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}
                >
                  <span className="nav-item__icon">
                    <GitBranch size={18} />
                  </span>
                  Luồng duyệt
                </NavLink>
              )}
              {canViewAudit && (
                <NavLink
                  to="/audit"
                  className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}
                >
                  <span className="nav-item__icon">
                    <ScrollText size={18} />
                  </span>
                  Nhật ký hệ thống
                </NavLink>
              )}
            </>
          )}
        </nav>

        <div className="sidebar__spacer" />
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button
            className="icon-btn topbar__menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Mở menu"
          >
            <Menu size={20} />
          </button>
          <span className="topbar__title">{pageTitle(location.pathname, location.search)}</span>

          <div className="topbar__right">
            <button
              className="icon-btn"
              onClick={toggle}
              aria-label={resolved === "dark" ? "Chuyển sáng" : "Chuyển tối"}
              title={resolved === "dark" ? "Chế độ sáng" : "Chế độ tối"}
            >
              {resolved === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>

            <div className="notif" ref={notifRef}>
              <button
                className="icon-btn notif__trigger"
                onClick={openNotifications}
                aria-label={unreadCount > 0 ? `Thông báo (${unreadCount} chưa đọc)` : "Thông báo"}
                title="Thông báo"
                aria-haspopup="menu"
                aria-expanded={notifOpen}
              >
                {unreadCount > 0 ? <BellRing size={19} /> : <Bell size={19} />}
                {unreadCount > 0 && (
                  <span className="notif__badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                )}
              </button>

              {notifOpen && (
                <div className="notif__dropdown">
                  <div className="notif__header">Thông báo</div>
                  {notifItems.length === 0 ? (
                    <div className="notif__empty">Chưa có thông báo nào.</div>
                  ) : (
                    <ul className="notif__list">
                      {notifItems.map((n) => (
                        <li key={n.id}>
                          <button
                            className={`notif__item ${n.isRead ? "" : "is-unread"}`}
                            onClick={() => {
                              setNotifOpen(false);
                              if (n.documentId) navigate(`/documents/${n.documentId}`);
                            }}
                          >
                            <span className="notif__item-text">
                              {n.actorName && <strong>{n.actorName}</strong>}{" "}
                              {EVENT_LABELS[n.type] ?? n.type}: {n.title}
                            </span>
                            <span className="notif__item-time">{formatDateTime(n.createdAt)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="user-menu" ref={menuRef}>
              <button
                className="user-menu__trigger"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <Avatar name={user?.fullName ?? "?"} size="sm" />
                {/* Chỉ tên ở topbar (bỏ chức danh theo yêu cầu 2026-07-18) — vai trò/phòng ban vẫn xem đủ trong dropdown khi mở */}
                <span className="user-menu__name">{user?.fullName}</span>
                <ChevronDown size={16} color="var(--text-muted)" />
              </button>

              {menuOpen && (
                <div className="user-menu__dropdown">
                  <div className="user-menu__header">
                    <div className="user-menu__name">{user?.fullName}</div>
                    <div className="user-menu__email">{user?.email}</div>
                    <div className="user-menu__email">
                      {user ? roleLabel(user.role.name) : ""} · {user?.department.name}
                    </div>
                  </div>
                  {pushSupported && !pushEnabled && (
                    <button className="menu-item" onClick={() => subscribePush()}>
                      <Bell size={17} />
                      Bật thông báo đẩy
                    </button>
                  )}
                  <button className="menu-item" onClick={() => navigate("/account")}>
                    <UserCircle size={17} />
                    Tài khoản của tôi
                  </button>
                  <button className="menu-item menu-item--danger" onClick={() => logout()}>
                    <LogOut size={17} />
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
