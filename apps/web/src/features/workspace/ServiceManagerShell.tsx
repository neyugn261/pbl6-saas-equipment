import type { ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronRight,
  LogOut,
  Search,
  Wrench,
} from "lucide-react";
import { logout, useSession } from "../../auth/session";
import { NotificationBell } from "../notifications/NotificationInbox";
import { navigationFor, primaryRole, roleNames } from "./role-workspace";

const groupNames: Record<string, string> = {
  "Công việc dịch vụ": "Dịch vụ kỹ thuật",
  "Khách hàng & thiết bị": "Khách hàng & thiết bị",
  "Kho phụ tùng": "Kho phụ tùng",
  "Tiện ích": "Tiện ích",
};

/** All links still come from the role catalogue, including combined roles. */
export default function ServiceManagerShell({
  children,
}: {
  children: ReactNode;
}) {
  const { profile, clear } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  if (!profile) return null;
  const navigation = navigationFor(profile.roles);
  const role = primaryRole(profile.roles);
  const customer = profile.userType === "CUSTOMER";
  const platform = profile.userType === "PLATFORM_STAFF";
  const workspaceLabel = platform
    ? "Quản trị nền tảng"
    : customer
      ? "Dịch vụ thiết bị của bạn"
      : roleNames[role];
  const homeLabel = customer
    ? "Dịch vụ của tôi"
    : platform
      ? "Tổng quan nền tảng"
      : "Bàn làm việc";
  const profilePath = platform
    ? "/admin/profile"
    : customer
      ? "/portal/profile"
      : "/app/profile";
  const lookupPath = platform
    ? "/admin/tenants"
    : customer
      ? "/portal/equipment"
      : "/app/equipment";
  const lookupLabel = platform ? "Tra cứu doanh nghiệp" : "Tra cứu thiết bị";
  const history = navigation.find((item) =>
    item.path.endsWith("/equipment-history"),
  );
  const footerPath =
    history?.path ??
    (platform ? "/admin/tenants" : "/app/inventory/warehouses");
  const footerLabel = history
    ? "Lịch sử thiết bị đã ghi nhận"
    : platform
      ? "Doanh nghiệp sử dụng"
      : "Tra cứu tồn kho";
  const section = navigation.find(
    (item) =>
      location.pathname === item.path ||
      location.pathname.startsWith(`${item.path}/`),
  );
  const groups = [...new Set(navigation.map((item) => item.group))];
  const dashboard = [
    "/dashboard",
    "/app/dashboard",
    "/admin",
    "/portal",
  ].includes(location.pathname);
  const activeGroup = section?.group ?? groups[0];
  const localLinks = navigation.filter((item) => item.group === activeGroup);
  const initials = profile.fullName
    .split(" ")
    .slice(-2)
    .map((part) => part[0])
    .join("");
  return (
    <div className="workshop-shell" data-workspace-role={role}>
      <a className="workshop-skip" href="#workshop-main">
        Đến nội dung chính
      </a>
      <header className="workshop-top">
        <Link
          className="workshop-brand"
          to="/dashboard"
          aria-label={`Servio — ${homeLabel}`}
        >
          <span>
            <Wrench size={20} aria-hidden="true" />
          </span>
          <strong>servio</strong>
          <small>/ workshop</small>
        </Link>
        <div className="workshop-context">
          <strong>{workspaceLabel}</strong>
          <small>
            {platform
              ? "Phạm vi nền tảng"
              : customer
                ? "Phạm vi khách hàng đã đăng nhập"
                : "Phạm vi doanh nghiệp đã đăng nhập"}
          </small>
        </div>
        <div className="workshop-account">
          <Link
            className="workshop-lookup"
            to={lookupPath}
            aria-label={lookupLabel}
          >
            <Search size={16} aria-hidden="true" />
            <span>{lookupLabel}</span>
          </Link>
          {!platform && (
            <NotificationBell
              href={customer ? "/portal/notifications" : "/app/notifications"}
            />
          )}
          <Link
            className="workshop-person"
            to={profilePath}
            aria-label={`Tài khoản ${profile.fullName}`}
          >
            <span className="workshop-initials" aria-hidden="true">
              {initials}
            </span>
            <span>
              <strong>{profile.fullName}</strong>
              <small>
                {profile.roles
                  .map(
                    (role) => roleNames[role as keyof typeof roleNames] ?? role,
                  )
                  .join(", ")}
              </small>
            </span>
          </Link>
          <button
            className="workshop-logout"
            type="button"
            aria-label="Đăng xuất"
            onClick={async () => {
              await logout();
              clear();
              navigate("/login");
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </header>
      <nav className="workshop-navigation" aria-label="Điều hướng chính">
        <Link to="/dashboard" aria-current={dashboard ? "page" : undefined}>
          {homeLabel}
        </Link>
        {groups.map((group) => (
          <Link
            key={group}
            to={navigation.find((item) => item.group === group)!.path}
            aria-current={
              !dashboard && activeGroup === group ? "true" : undefined
            }
          >
            {groupNames[group] ?? group}
          </Link>
        ))}
      </nav>
      <nav className="workshop-local-nav" aria-label={activeGroup}>
        {localLinks.map((item) => (
          <NavLink key={item.path} to={item.path}>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main id="workshop-main" className="sm-workspace workshop-main">
        <nav className="workshop-breadcrumbs" aria-label="Đường dẫn">
          <Link to="/dashboard">{homeLabel}</Link>
          {!dashboard && (
            <>
              <ChevronRight size={13} aria-hidden="true" />
              <Link to={section?.path ?? "/dashboard"}>
                {section?.label ?? "Không gian làm việc"}
              </Link>
              {section && location.pathname !== section.path && (
                <>
                  <ChevronRight size={13} aria-hidden="true" />
                  <span>
                    {location.pathname.endsWith("/new")
                      ? "Tạo mới"
                      : "Chi tiết hồ sơ"}
                  </span>
                </>
              )}
            </>
          )}
        </nav>
        {children}
      </main>
      <footer className="workshop-footer">
        <span>Servio / {workspaceLabel}</span>
        <Link to={footerPath}>
          {footerLabel} <ArrowUpRight size={13} aria-hidden="true" />
        </Link>
      </footer>
    </div>
  );
}
