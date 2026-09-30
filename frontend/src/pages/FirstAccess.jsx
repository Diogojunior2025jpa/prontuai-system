import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { apiPatch } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { useMe } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function FirstAccess() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useMe();
  const [error, setError] = useState("");
  const update = useMutation({
    mutationFn: (body) => apiPatch("/auth/account", body),
    onSuccess: () => {
      beginSession();
      navigate("/superadmin", { replace: true });
    },
    onError: (requestError) => setError(requestError?.body?.detail || "Não foi possível atualizar o acesso"),
  });

  if (isError) return <Navigate to="/login" replace />;
  if (!isLoading && !data?.user?.must_change_password) return <Navigate to="/superadmin" replace />;

  function submit(event) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("new_password") || "");
    if (newPassword !== form.get("confirm_password")) {
      setError("As senhas novas não coincidem.");
      return;
    }
    update.mutate({
      email: String(form.get("email") || "").trim(),
      current_password: String(form.get("current_password") || ""),
      new_password: newPassword,
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
      <section className="w-full max-w-md rounded-lg border border-[#1F2937] bg-[#111827] p-6 sm:p-8" data-testid="first-access-form">
        <div className="mb-5 flex size-10 items-center justify-center rounded-md border border-amber-900 bg-amber-950/40 text-amber-300">
          <KeyRound className="size-5" />
        </div>
        <h1 className="font-heading text-xl font-semibold">Configure seu acesso</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">No primeiro acesso, defina seu e-mail administrativo e uma senha exclusiva com pelo menos 12 caracteres.</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="first-access-email">E-mail administrativo</Label>
            <Input id="first-access-email" name="email" type="email" defaultValue={data?.user?.email || ""} autoComplete="email" required data-testid="first-access-email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Senha temporária atual</Label>
            <Input id="current-password" name="current_password" type="password" minLength={8} autoComplete="current-password" required data-testid="first-access-current-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Nova senha</Label>
            <Input id="new-password" name="new_password" type="password" minLength={12} autoComplete="new-password" required data-testid="first-access-new-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirme a nova senha</Label>
            <Input id="confirm-password" name="confirm_password" type="password" minLength={12} autoComplete="new-password" required data-testid="first-access-confirm-password" />
          </div>
          {error ? <p className="text-sm text-red-300" role="alert" data-testid="first-access-error">{error}</p> : null}
          <Button className="w-full" type="submit" disabled={update.isPending || isLoading} data-testid="first-access-submit">
            {update.isPending ? "Atualizando…" : "Salvar novo acesso"}
          </Button>
        </form>
      </section>
    </main>
  );
}