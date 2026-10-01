import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { HeartPulse } from "lucide-react";
import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PortalLogin() {
  const navigate = useNavigate();
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState("");

  const login = useMutation({
    mutationFn: (body) => apiPost("/portal/login", body),
    onSuccess: () => {
      beginSession();
      navigate("/portal", { replace: true });
    },
    onError: (e) => setError(e?.body?.detail || "Não foi possível entrar"),
  });

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-background text-foreground">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2">
          <HeartPulse className="size-6 text-cyan-400" />
          <span className="font-heading text-xl font-semibold tracking-tight">Portal do Paciente</span>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Acesse com seu CPF e data de nascimento para ver e marcar consultas.
        </p>

        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => { e.preventDefault(); setError(""); login.mutate({ cpf, birth_date: birthDate }); }}
          data-testid="portal-login-form"
        >
          <div className="space-y-1.5">
            <Label htmlFor="cpf">CPF</Label>
            <Input
              id="cpf" value={cpf} onChange={(e) => setCpf(e.target.value)}
              placeholder="12345678900" required data-testid="portal-cpf-input"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="birth">Data de nascimento</Label>
            <Input
              id="birth" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
              required data-testid="portal-birth-input"
            />
          </div>
          {error ? <p className="text-sm text-red-400" data-testid="portal-login-error">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={login.isPending} data-testid="portal-login-submit">
            {login.isPending ? "Entrando…" : "Acessar meu portal"}
          </Button>
        </form>

        <p className="mt-6 text-xs text-slate-500 text-center">
          É da equipe da clínica?{" "}
          <Link to="/login" className="text-indigo-400 hover:underline" data-testid="staff-login-link">
            Entrar no painel
          </Link>
        </p>
      </div>
    </div>
  );
}
