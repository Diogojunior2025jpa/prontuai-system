import { NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bell, Calendar, CreditCard, FileText, LayoutDashboard, LogOut, Megaphone, ShieldCheck, Stethoscope, Users, UsersRound,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import AssistantWidget from "@/components/AssistantWidget";
import BrandMark from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, SPECIALTY_LABELS, endSession, hasPerm } from "@/lib/session";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet("/auth/me"),
    retry: false,
    staleTime: 30_000,
  });
}

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, perm: null, end: true },
  { to: "/app/agenda", label: "Agenda", icon: Calendar, perm: "agenda.view" },
  { to: "/app/disponibilidade", label: "Disponibilidade", icon: Calendar, perm: "agenda.view", roles: ["clinic_admin", "professional"] },
  { to: "/app/pacientes", label: "Pacientes", icon: Users, perm: "patients.view" },
  { to: "/app/prontuario", label: "Prontuário NEXO", icon: Stethoscope, perm: "records.view" },
  { to: "/app/laudos", label: "Laudos Médicos", icon: FileText, perm: "records.view" },
  { to: "/app/equipe", label: "Equipe & Permissões", icon: UsersRound, perm: "team.manage" },
  { to: "/app/campanhas", label: "Marketing", icon: Megaphone, perm: "campaigns.send" },
  { to: "/app/financeiro", label: "Guia financeiro", icon: CreditCard, perm: "finance.view" },
  { to: "/app/plano", label: "Plano", icon: CreditCard, perm: null, roles: ["clinic_admin"] },
];

export default function AppShell({ children, title, subtitle, actions }) {
  const navigate = useNavigate();
  const { data, isError } = useMe();
  const user = data?.user;
  const tenant = data?.tenant;
  const { data: notices = [] } = useQuery({
    queryKey: ["clinic", "notices"],
    queryFn: () => apiGet("/clinic/notices"),
    enabled: user?.role === "clinic_admin",
    refetchInterval: 30_000,
    retry: false,
  });

  async function logout() {
    await endSession("/auth/logout");
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside
        className="hidden md:flex w-64 shrink-0 flex-col border-r border-[#1E293B] bg-[#070B11]"
        data-testid="app-sidebar"
      >
        <div className="h-16 flex items-center gap-2 px-5 border-b border-[#1E293B]">
          <BrandMark className="size-7 shrink-0" />
          <span className="font-heading font-semibold tracking-tight text-lg">ProntuAI</span>
        </div>

        <div className="px-5 py-4 border-b border-[#1E293B]" data-testid="tenant-context-card">
          <p className="overline text-cyan-400">Clínica ativa</p>
          <p className="mt-1 text-sm font-medium text-slate-100 truncate" data-testid="tenant-name">
            {tenant?.name || (user?.role === "super_admin" ? "Plataforma ProntuAI" : "—")}
          </p>
          <p className="mt-1 text-xs text-slate-400" data-testid="tenant-welcome">
            Seja bem-vindo!
          </p>
          {tenant?.specialty ? (
            <Badge variant="outline" className="mt-2 text-[11px] border-indigo-900 text-indigo-300">
              {SPECIALTY_LABELS[tenant.specialty] || tenant.specialty}
            </Badge>
          ) : null}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.filter((n) => (!n.perm || hasPerm(user, n.perm)) && (!n.roles || n.roles.includes(user?.role))).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={`nav-${n.label.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150 ${
                  isActive
                    ? "bg-[#1E1B4B] text-indigo-300 font-medium"
                    : "text-slate-400 hover:text-slate-100 hover:bg-[#111827]"
                }`
              }
            >
              <n.icon className="size-4" />
              {n.label}
            </NavLink>
          ))}
          {user?.role === "super_admin" ? (
            <NavLink
              to="/superadmin"
              data-testid="nav-superadmin"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150 ${
                  isActive ? "bg-[#1E1B4B] text-indigo-300 font-medium" : "text-slate-400 hover:text-slate-100 hover:bg-[#111827]"
                }`
              }
            >
              <ShieldCheck className="size-4" />
              Super Admin
            </NavLink>
          ) : null}
        </nav>

        <div className="p-4 border-t border-[#1E293B]">
          <p className="text-sm font-medium truncate" data-testid="current-user-name">{user?.name || "—"}</p>
          <p className="text-xs text-slate-500" data-testid="current-user-role">
            {ROLE_LABELS[user?.role] || "—"}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full justify-start text-slate-400 hover:text-red-300"
            onClick={logout}
            data-testid="logout-button"
          >
            <LogOut className="size-4" /> Sair
          </Button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 flex items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6 border-b border-[#1E293B] bg-[#0B0F17]/80 backdrop-blur-xl sticky top-0 z-20">
          <div className="min-w-0">
            <h1 className="font-heading text-lg sm:text-xl font-semibold tracking-tight truncate" data-testid="page-title">
              {title}
            </h1>
            {subtitle ? <p className="text-xs text-slate-500 truncate">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </header>

        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#1E293B] bg-[#070B11] px-2 py-2 md:hidden" aria-label="Navegação principal" data-testid="mobile-navigation">
          {NAV.filter((n) => (!n.perm || hasPerm(user, n.perm)) && (!n.roles || n.roles.includes(user?.role))).map((n) => (
            <NavLink
              key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs ${isActive ? "bg-[#1E1B4B] text-indigo-300" : "text-slate-400 hover:bg-[#111827]"}`}
            >
              <n.icon className="size-4" />{n.label}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 p-4 sm:p-6 animate-[rise_0.35s_cubic-bezier(0.16,1,0.3,1)]">
          {notices.map((notice) => (
            <aside
              key={notice.id}
              className="mb-4 flex gap-3 rounded-md border border-amber-800/70 bg-amber-950/30 p-4 text-amber-100"
              data-testid={`global-notice-${notice.id}`}
            >
              <Bell className="mt-0.5 size-4 shrink-0 text-amber-400" />
              <div>
                <p className="text-sm font-semibold">{notice.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-amber-100/80">{notice.message}</p>
                <p className="mt-2 text-xs text-amber-200/60">
                  {new Date(notice.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
            </aside>
          ))}
          {isError ? (
            <p className="text-sm text-amber-400" data-testid="session-warning">
              Sessão não encontrada. <a className="underline" href="/login">Entrar novamente</a>.
            </p>
          ) : null}
          {children}
        </main>
      </div>

      <AssistantWidget />
    </div>
  );
}
