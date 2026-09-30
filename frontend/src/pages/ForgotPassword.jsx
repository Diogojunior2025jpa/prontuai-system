import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const forgot = useMutation({
    mutationFn: (body) => apiPost("/auth/forgot-password", body),
    onSuccess: (data) => setMessage(data.message),
  });
  const reset = useMutation({
    mutationFn: (body) => apiPost("/auth/reset-password", body),
    onSuccess: () => navigate("/login", { replace: true, state: { message: "Senha atualizada. Entre com sua nova senha." } }),
  });

  function submit(event) {
    event.preventDefault();
    setMessage("");
    if (!token) {
      forgot.mutate({ email });
      return;
    }
    if (password !== confirm) {
      setMessage("As senhas não coincidem.");
      return;
    }
    reset.mutate({ token, new_password: password });
  }

  const error = forgot.error || reset.error;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
      <section className="w-full max-w-md rounded-lg border border-[#1F2937] bg-[#111827] p-6 sm:p-8">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300"><ArrowLeft className="size-4" /> Voltar ao acesso</Link>
        <div className="mt-7 flex size-10 items-center justify-center rounded-md border border-cyan-900 bg-cyan-950/40 text-cyan-300">{token ? <KeyRound className="size-5" /> : <Mail className="size-5" />}</div>
        <h1 className="mt-4 font-heading text-xl font-semibold">{token ? "Criar nova senha" : "Recuperar acesso"}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">{token ? "Escolha uma senha exclusiva com pelo menos 12 caracteres." : "Informe seu e-mail. Se houver uma conta, enviaremos um link para redefinir a senha."}</p>
        <form className="mt-6 space-y-4" onSubmit={submit} data-testid="forgot-password-form">
          {!token ? <div className="space-y-1.5"><Label htmlFor="recovery-email">E-mail de acesso</Label><Input id="recovery-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" data-testid="recovery-email" /></div> : <>
            <div className="space-y-1.5"><Label htmlFor="new-password">Nova senha</Label><Input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={72} required autoComplete="new-password" data-testid="reset-password" /></div>
            <div className="space-y-1.5"><Label htmlFor="confirm-password">Confirme a nova senha</Label><Input id="confirm-password" type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} minLength={12} maxLength={72} required autoComplete="new-password" data-testid="reset-password-confirm" /></div>
          </>}
          {message ? <p className="text-sm text-emerald-300" role="status">{message}</p> : null}
          {error ? <p className="text-sm text-red-300" role="alert">{error?.body?.detail || "Não foi possível concluir a solicitação."}</p> : null}
          <Button className="w-full" type="submit" disabled={forgot.isPending || reset.isPending} data-testid="recovery-submit">{forgot.isPending || reset.isPending ? "Aguarde…" : token ? "Salvar nova senha" : "Enviar link de recuperação"}</Button>
        </form>
      </section>
    </main>
  );
}
