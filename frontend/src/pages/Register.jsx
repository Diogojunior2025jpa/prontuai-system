import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Activity, ArrowLeft, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ clinic_name: "", name: "", specialty: "geral", email: "", password: "" });
  const register = useMutation({
    mutationFn: (body) => apiPost("/auth/register", body),
    onSuccess: () => navigate("/app/plano", { replace: true }),
  });

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    register.mutate(form);
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto max-w-xl">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300"><ArrowLeft className="size-4" /> Voltar ao acesso</Link>
        <header className="mt-8 flex items-center gap-3">
          <div className="rounded-md border border-cyan-900 bg-cyan-950/40 p-2 text-cyan-300"><Building2 className="size-5" /></div>
          <div><p className="font-heading text-xl font-semibold">Cadastre sua clínica</p><p className="text-sm text-slate-500">Comece com sete dias de teste gratuito</p></div>
        </header>
        <form className="mt-6 grid gap-4 rounded-lg border border-[#1F2937] bg-[#111827] p-5 sm:grid-cols-2" onSubmit={submit} data-testid="register-form">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="clinic-name">Nome da clínica</Label><Input id="clinic-name" value={form.clinic_name} onChange={(event) => update("clinic_name", event.target.value)} minLength={2} maxLength={120} required autoComplete="organization" data-testid="register-clinic-name" /></div>
          <div className="space-y-1.5"><Label htmlFor="owner-name">Seu nome</Label><Input id="owner-name" value={form.name} onChange={(event) => update("name", event.target.value)} minLength={2} maxLength={120} required autoComplete="name" data-testid="register-name" /></div>
          <div className="space-y-1.5"><Label htmlFor="specialty">Especialidade</Label><select id="specialty" value={form.specialty} onChange={(event) => update("specialty", event.target.value)} className="h-8 w-full rounded-md border border-input bg-[#0B0F17] px-2.5 text-sm" data-testid="register-specialty"><option value="geral">Clínica geral</option><option value="odonto">Odontologia</option><option value="oftalmo">Oftalmologia</option></select></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="register-email">E-mail de acesso</Label><Input id="register-email" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} required autoComplete="email" data-testid="register-email" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="register-password">Senha</Label><Input id="register-password" type="password" value={form.password} onChange={(event) => update("password", event.target.value)} minLength={12} maxLength={72} required autoComplete="new-password" aria-describedby="password-hint" data-testid="register-password" /><p id="password-hint" className="text-xs text-slate-500">Use pelo menos 12 caracteres.</p></div>
          {register.isError ? <p className="text-sm text-red-300 sm:col-span-2" role="alert">{register.error?.body?.detail || "Não foi possível criar o acesso."}</p> : null}
          <Button className="sm:col-span-2" type="submit" disabled={register.isPending} data-testid="register-submit"><Activity className="size-4" />{register.isPending ? "Criando acesso…" : "Criar conta e iniciar teste"}</Button>
        </form>
      </div>
    </main>
  );
}
