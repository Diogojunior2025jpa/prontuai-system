import { NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, Calendar, LayoutDashboard, LogOut, Megaphone, ShieldCheck, Stethoscope, Users, UsersRound,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import AssistantWidget from "@/components/AssistantWidget";
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
  { to: "/app/pacientes", label: "Pacientes", icon: Users, perm: "patients.view" },
  { to: "/app/prontuario", label: "Prontuário IA", icon: Stethoscope, perm: "records.view" },
  { to: "/app/equipe", label: "Equipe & Permissões", icon: UsersRound, perm: "team.manage" },
  { to: "/app/campanhas", label: "Marketing", icon: Megaphone, perm: "campaigns.send" },
];

export default function AppShell({ children, title, subtitle, actions }) {
  const navigate = useNavigate();
  const { data, isError } = useMe();
  const user = data?.user;
  const tenant = data?.tenant;

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
          <Activity className="size-5 text-indigo-400" />
          <span className="font-heading font-semibold tracking-tight text-lg">ProntuAI</span>
        </div>

        <div className="px-5 py-4 border-b border-[#1E293B]" data-testid="tenant-context-card">
          <p className="overline text-cyan-400">Clínica ativa</p>
          <p className="mt-1 text-sm font-medium text-slate-100 truncate" data-testid="tenant-name">
            {tenant?.name || (user?.role === "super_admin" ? "Plataforma ProntuAI" : "—")}
          </p>
          <p className="text-xs text-slate-500 font-mono mt-0.5" data-testid="tenant-id">
            {tenant ? `tenant: ${tenant.id}` : "sem tenant"}
          </p>
          {tenant?.specialty ? (
            <Badge variant="outline" className="mt-2 text-[11px] border-indigo-900 text-indigo-300">
              {SPECIALTY_LABELS[tenant.specialty] || tenant.specialty}
            </Badge>
          ) : null}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.filter((n) => !n.perm || hasPerm(user, n.perm)).map((n) => (
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
        <header className="h-16 shrink-0 flex items-center justify-between gap-4 px-6 border-b border-[#1E293B] bg-[#0B0F17]/80 backdrop-blur-xl sticky top-0 z-20">
          <div className="min-w-0">
            <h1 className="font-heading text-xl font-semibold tracking-tight truncate" data-testid="page-title">
              {title}
            </h1>
            {subtitle ? <p className="text-xs text-slate-500 truncate">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </header>

        <main className="flex-1 p-6 animate-[rise_0.35s_cubic-bezier(0.16,1,0.3,1)]">
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
