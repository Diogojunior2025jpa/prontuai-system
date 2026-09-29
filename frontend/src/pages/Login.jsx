import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Activity, Lock, ShieldCheck } from "lucide-react";
import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEMO = [
  { label: "Super Admin", email: "super@prontuai.com", password: "super123" },
  { label: "Admin OdontoAlphaville", email: "admin@odonto.com", password: "clinica123" },
  { label: "Dentista (permissões limitadas)", email: "dentista@odonto.com", password: "equipe123" },
  { label: "Admin Oftalmo Centro", email: "admin@oftalmo.com", password: "clinica123" },
];

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const login = useMutation({
    mutationFn: (body) => apiPost("/auth/login", body),
    onSuccess: (data) => {
      beginSession();
      navigate(data.user.role === "super_admin" ? "/superadmin" : "/app", { replace: true });
    },
    onError: (err) => setError(err?.body?.detail || "Não foi possível entrar"),
  });

  function submit(e) {
    e.preventDefault();
    setError("");
    login.mutate({ email, password });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background text-foreground">
      <div className="hidden lg:flex flex-col justify-between p-12 border-r border-[#1E293B] bg-[#070B11]">
        <div className="flex items-center gap-2">
          <Activity className="size-6 text-indigo-400" />
          <span className="font-heading text-xl font-semibold tracking-tight">ProntuAI</span>
        </div>
        <div className="max-w-md">
          <p className="overline text-cyan-400">Plataforma SaaS multi-tenant</p>
          <h2 className="mt-4 font-heading text-4xl font-semibold tracking-tight leading-tight">
            Gestão clínica sem ruído.<br />Prontuário ditado por voz.
          </h2>
          <p className="mt-4 text-slate-400 leading-relaxed">
            Agenda, pacientes, prontuário inteligente e marketing em um só lugar — com isolamento
            total de dados entre clínicas.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="size-4 text-emerald-400" />
          Isolamento por tenant_id aplicado em todas as consultas do backend
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Entrar</h1>
          <p className="text-sm text-slate-500 mt-1">Acesse o painel da sua clínica</p>

          <form onSubmit={submit} className="mt-8 space-y-4" data-testid="login-form">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@clinica.com"
                data-testid="login-email-input"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                data-testid="login-password-input"
                required
              />
            </div>
            {error ? (
              <p className="text-sm text-red-400" data-testid="login-error">{error}</p>
            ) : null}
            <Button
              type="submit"
              className="w-full"
              disabled={login.isPending}
              data-testid="login-submit-button"
            >
              <Lock className="size-4" />
              {login.isPending ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          <div className="mt-8 rounded-lg border border-[#1F2937] bg-[#111827] p-4">
            <p className="overline text-slate-500">Contas de demonstração</p>
            <div className="mt-3 space-y-1.5">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => { setEmail(d.email); setPassword(d.password); }}
                  className="w-full text-left text-xs rounded px-2 py-1.5 text-slate-400 hover:bg-[#161F30] hover:text-slate-100 transition-colors duration-150"
                  data-testid={`demo-account-${d.email.split("@")[0]}`}
                >
                  <span className="font-medium text-slate-300">{d.label}</span>
                  <span className="block font-mono text-[11px] text-slate-500">{d.email} · {d.password}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="mt-6 text-xs text-slate-500 text-center">
            É paciente?{" "}
            <Link to="/portal/login" className="text-cyan-400 hover:underline" data-testid="portal-login-link">
              Acessar o Portal do Paciente
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
