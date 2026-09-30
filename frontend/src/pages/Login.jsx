import { useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Activity, Lock, ShieldCheck } from "lucide-react";
import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const login = useMutation({
    mutationFn: (body) => apiPost("/auth/login", body),
    onSuccess: (data) => {
      beginSession();
      navigate(data.user.must_change_password ? "/primeiro-acesso" : data.user.role === "super_admin" ? "/superadmin" : "/app", { replace: true });
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
            <div className="flex justify-end">
              <Link to="/esqueci-senha" className="text-xs text-cyan-400 hover:underline" data-testid="forgot-password-link">Esqueci minha senha</Link>
            </div>
            {location.state?.message ? <p className="text-sm text-emerald-300" role="status">{location.state.message}</p> : null}
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

          <p className="mt-6 text-xs text-slate-500 text-center">
            É paciente?{" "}
            <Link to="/portal/login" className="text-cyan-400 hover:underline" data-testid="portal-login-link">
              Acessar o Portal do Paciente
            </Link>
          </p>
          <p className="mt-4 text-center text-sm text-slate-400">
            Sua clínica ainda não tem acesso?{" "}
            <Link to="/cadastro" className="font-medium text-cyan-400 hover:underline" data-testid="register-link">Cadastre-se</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
