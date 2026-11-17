import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { Icon, type IconName } from "./Icon";
import { SyntheticNotice } from "./Notices";

const navigation: { label: string; items: { path: string; label: string; icon: IconName }[] }[] = [
  { label: "Ruang kerja", items: [
    { path: "/", label: "Beranda", icon: "grid" },
    { path: "/alerts", label: "Perlu ditinjau", icon: "eye" },
    { path: "/model-flags", label: "Hasil otomatis", icon: "activity" },
  ] },
  { label: "Pengelolaan", items: [
    { path: "/lab", label: "Atur deteksi", icon: "scan" },
    { path: "/audit", label: "Riwayat aktivitas", icon: "history" },
  ] },
];
const roleNames: Record<string, string> = {
  ROLE_DATA_OPS: "Pengelola data", ROLE_ANALYST: "Analis", ROLE_TRIAGE: "Peninjau transaksi",
  ROLE_INVESTIGATOR: "Petugas pemeriksaan", ROLE_SENIOR_INVESTIGATOR: "Penanggung jawab pemeriksaan",
  ROLE_MLRO: "Penanggung jawab kepatuhan", ROLE_AUDITOR: "Auditor internal",
  ROLE_MANAGEMENT: "Manajemen", ROLE_ADMIN: "Administrator",
};
function currentPage(path: string) {
  if (path.startsWith("/alerts/")) return "Detail peninjauan";
  if (path.startsWith("/cases/")) return "Pemeriksaan lanjutan";
  if (path === "/guide") return "Panduan penggunaan";
  return navigation.flatMap((group) => group.items).find((item) => item.path === path)?.label ?? "Ruang kerja";
}

export function Layout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const lastPath = useRef(pathname);

  useEffect(() => {
    document.title = `${currentPage(pathname)} · FCIP`;
    setMenuOpen(false);
    if (lastPath.current !== pathname) {
      const frame = requestAnimationFrame(() => document.getElementById("main-content")?.focus());
      lastPath.current = pathname;
      return () => cancelAnimationFrame(frame);
    }
  }, [pathname]);
  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 1000) setMenuOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    workspace.current?.setAttribute("inert", "");
    sidebar.current?.querySelector<HTMLAnchorElement>("nav a")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setMenuOpen(false); requestAnimationFrame(() => menuButton.current?.focus()); }
      if (event.key === "Tab") {
        const items = sidebar.current?.querySelectorAll<HTMLElement>("a, button");
        if (!items?.length) return;
        if (event.shiftKey && document.activeElement === items[0]) {
          event.preventDefault(); items[items.length - 1].focus();
        } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
          event.preventDefault(); items[0].focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      workspace.current?.removeAttribute("inert");
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);
  function closeMenu() { setMenuOpen(false); requestAnimationFrame(() => menuButton.current?.focus()); }

  return (
    <div className="app app-shell">
      <a className="skip-link" href="#main-content">Lewati ke konten</a>
      {menuOpen && <button className="sidebar-backdrop" type="button" aria-label="Tutup navigasi" onClick={closeMenu} />}
      <aside id="main-navigation" ref={sidebar} className={`sidebar ${menuOpen ? "is-open" : ""}`}
        role={menuOpen ? "dialog" : undefined} aria-modal={menuOpen ? true : undefined} aria-label="Navigasi FCIP">
        <Link to="/" className="brand" aria-label="FCIP, kembali ke beranda">
          <span className="brand-mark"><Icon name="shield" size={25} /></span>
          <span><strong>FCIP<span className="brand-dot">.</span></strong><small>Peninjauan transaksi</small></span>
        </Link>
        <nav aria-label="Navigasi utama">
          {navigation.map((group) => <div className="nav-group" key={group.label}>
            <span className="nav-group-label">{group.label}</span>
            {group.items.map((item) => <NavLink key={item.path} to={item.path} end={item.path === "/"}>
              <Icon name={item.icon} size={20} /><span>{item.label}</span><Icon name="chevron" size={15} className="nav-chevron" />
            </NavLink>)}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/guide" className={`sidebar-guide ${pathname === "/guide" ? "active" : ""}`}>
            <Icon name="info" size={22} /><span><strong>Baru di sini?</strong><small>Kenali alurnya dalam 3 langkah</small></span><Icon name="arrow-right" size={17} />
          </Link>
          <p className="sidebar-note">Sistem membantu menemukan pola.<br />Keputusan tetap di tangan Anda.</p>
        </div>
        <button className="mobile-menu-close button-secondary" type="button" onClick={closeMenu}><Icon name="close" size={16} />Tutup navigasi</button>
      </aside>
      <div className="workspace-main" ref={workspace}>
        <header className="topbar">
          <div className="topbar-context">
            <button type="button" ref={menuButton} className="icon-button mobile-menu-button" aria-label="Buka navigasi"
              aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon name="menu" /></button>
            <div className="workspace-heading"><span className="workspace-name">Nusantara Digital Payment</span><span className="workspace-location">Ruang kerja <Icon name="chevron" size={12} /> <strong>{currentPage(pathname)}</strong></span></div>
          </div>
          <div className="topbar-user">
            <span className="demo-pill">Mode demonstrasi</span>
            <Link to="/guide" className="topbar-help" aria-label="Buka panduan penggunaan"><Icon name="info" size={19} /><span>Panduan</span></Link>
            {user && <>
              <span className="user-avatar" aria-hidden="true">{user.full_name.split(" ").filter(Boolean).slice(0, 2).map((name) => name[0]).join("")}</span>
              <div className="user-details"><strong>{user.full_name}</strong><span>{roleNames[user.role] ?? user.role.replace("ROLE_", "")}</span></div>
            </>}
            <button className="icon-button logout-button" type="button" onClick={() => void logout()} aria-label="Keluar dari akun" title="Keluar"><Icon name="logout" size={19} /></button>
          </div>
        </header>
        <main className="content" id="main-content" tabIndex={-1}><Outlet /></main>
        <footer className="workspace-footer"><span className="footer-brand">FCIP · Ruang belajar peninjauan transaksi</span><SyntheticNotice /></footer>
      </div>
    </div>
  );
}
