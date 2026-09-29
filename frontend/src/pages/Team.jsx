import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERM_LABELS, ROLE_LABELS } from "@/lib/session";

const ROLES = ["clinic_admin", "professional", "receptionist", "finance"];
const NEW_MEMBER = { name: "", email: "", password: "", role: "professional", specialty: "", permissions: [] };

export default function Team() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(NEW_MEMBER);

  const { data: team, isError } = useQuery({
    queryKey: ["team"],
    queryFn: () => apiGet("/clinic/team"),
    retry: false,
  });
  const { data: catalog } = useQuery({
    queryKey: ["permissions"],
    queryFn: () => apiGet("/clinic/permissions"),
    retry: false,
  });

  const members = isError ? [] : team || [];
  const allPerms = catalog?.permissions || Object.keys(PERM_LABELS);
  const roleDefaults = catalog?.role_defaults || {};

  const create = useMutation({
    mutationFn: (body) => apiPost("/clinic/team", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      setForm(NEW_MEMBER);
      setOpen(false);
      toast.success("Membro cadastrado");
    },
    onError: (e) => toast.error(e?.body?.detail || "Falha ao cadastrar membro"),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }) => apiPatch(`/clinic/team/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Permissões atualizadas");
    },
    onError: (e) => toast.error(e?.body?.detail || "Falha ao atualizar"),
  });

  const remove = useMutation({
    mutationFn: (id) => apiDelete(`/clinic/team/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      toast.success("Membro removido");
    },
    onError: (e) => toast.error(e?.body?.detail || "Falha ao remover"),
  });

  function togglePerm(member, perm, checked) {
    const current = member.permissions.includes("*") ? allPerms : member.permissions;
    const next = checked ? [...new Set([...current, perm])] : current.filter((p) => p !== perm);
    patch.mutate({ id: member.id, body: { permissions: next } });
  }

  function toggleNewPerm(perm, checked) {
    setForm((f) => ({
      ...f,
      permissions: checked ? [...new Set([...f.permissions, perm])] : f.permissions.filter((p) => p !== perm),
    }));
  }

  return (
    <AppShell
      title="Equipe & Permissões"
      subtitle="RBAC granular — cada funcionário vê apenas o que você liberar"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm" data-testid="new-member-button" />}>
            <UserPlus className="size-4" /> Novo membro
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="font-heading">Cadastrar membro da equipe</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => { e.preventDefault(); create.mutate(form); }}
              data-testid="member-form"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="m-name">Nome</Label>
                  <Input id="m-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required data-testid="member-name-input" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-email">E-mail</Label>
                  <Input id="m-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required data-testid="member-email-input" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="m-pwd">Senha inicial</Label>
                  <Input id="m-pwd" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="prontuai123" data-testid="member-password-input" />
                </div>
                <div className="space-y-1.5">
                  <Label>Função</Label>
                  <Select
                    value={form.role}
                    onValueChange={(v) => setForm((f) => ({ ...f, role: v, permissions: roleDefaults[v] || [] }))}
                  >
                    <SelectTrigger data-testid="member-role-select">
                      <SelectValue>{(v) => ROLE_LABELS[v] || "Função"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r} data-testid={`member-role-option-${r}`}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <p className="overline text-slate-500 mb-2">Permissões granulares</p>
                <div className="grid gap-2 sm:grid-cols-2 rounded-md border border-[#1F2937] bg-[#0B0F17] p-3">
                  {allPerms.map((perm) => (
                    <label key={perm} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                      <Checkbox
                        checked={form.role === "clinic_admin" || form.permissions.includes(perm)}
                        disabled={form.role === "clinic_admin"}
                        onCheckedChange={(c) => toggleNewPerm(perm, c)}
                        data-testid={`new-perm-${perm.replace(".", "-")}`}
                      />
                      {PERM_LABELS[perm] || perm}
                    </label>
                  ))}
                </div>
                {form.role === "clinic_admin" ? (
                  <p className="mt-2 text-xs text-amber-400">Admin da Clínica recebe todas as permissões automaticamente.</p>
                ) : null}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={create.isPending} data-testid="member-save-button">
                  {create.isPending ? "Salvando…" : "Cadastrar membro"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-4" data-testid="team-members-list">
        {members.length === 0 ? (
          <p className="text-sm text-slate-500" data-testid="team-empty">Nenhum membro cadastrado.</p>
        ) : null}
        {members.map((m) => {
          const isAdmin = m.role === "clinic_admin";
          const perms = m.permissions.includes("*") ? allPerms : m.permissions;
          return (
            <div
              key={m.id}
              className="rounded-lg border border-[#1F2937] bg-[#111827] p-5 hover:border-[#374151] transition-colors duration-200"
              data-testid={`team-member-${m.id}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-100 flex items-center gap-2">
                    {m.name}
                    {isAdmin ? <ShieldCheck className="size-4 text-emerald-400" /> : null}
                  </p>
                  <p className="text-xs text-slate-500 font-mono">{m.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-[#312E81] text-indigo-300" data-testid={`member-role-badge-${m.id}`}>
                    {ROLE_LABELS[m.role]}
                  </Badge>
                  <Badge className={m.active ? "bg-[#064E3B] text-emerald-400" : "bg-[#78350F] text-amber-400"}>
                    {m.active ? "Ativo" : "Inativo"}
                  </Badge>
                  {!isAdmin ? (
                    <Button
                      variant="ghost" size="sm" className="text-slate-500 hover:text-red-400"
                      onClick={() => remove.mutate(m.id)}
                      data-testid={`member-remove-${m.id}`}
                    >
                      Remover
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="mt-4">
                <p className="overline text-slate-500 mb-2">Permissões</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {allPerms.map((perm) => (
                    <label
                      key={perm}
                      className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none"
                    >
                      <Checkbox
                        checked={isAdmin || perms.includes(perm)}
                        disabled={isAdmin || patch.isPending}
                        onCheckedChange={(c) => togglePerm(m, perm, c)}
                        data-testid={`perm-${m.id}-${perm.replace(".", "-")}`}
                      />
                      <span className={isAdmin || perms.includes(perm) ? "text-slate-200" : "text-slate-500"}>
                        {PERM_LABELS[perm] || perm}
                      </span>
                    </label>
                  ))}
                </div>
                {isAdmin ? (
                  <p className="mt-3 text-xs text-slate-500">
                    O Admin da Clínica sempre possui acesso total ao próprio tenant.
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
