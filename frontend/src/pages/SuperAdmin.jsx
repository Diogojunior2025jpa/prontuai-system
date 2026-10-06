import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Ban, Building2, CheckCircle2, LogOut, Plus, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import AssistantWidget from "@/components/AssistantWidget";
import GlobalAssistantPanel from "@/components/admin/GlobalAssistantPanel";
import ApiKeySettingsPanel from "@/components/admin/ApiKeySettingsPanel";
import GlobalNoticePanel from "@/components/admin/GlobalNoticePanel";
import { useMe } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SPECIALTY_LABELS, brl, endSession } from "@/lib/session";

const EMPTY_PLAN = { name: "", price: "", max_users: "", max_patients: "", features: "", active: true };
const EMPTY_TENANT = { name: "", specialty: "geral", plan_id: "", admin_name: "", admin_email: "", admin_password: "" };

export default function SuperAdmin() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading, isError: meError } = useMe();
  const canLoadAdmin = me?.user?.role === "super_admin" && !me.user.must_change_password;

  const [planForm, setPlanForm] = useState(EMPTY_PLAN);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [tenantForm, setTenantForm] = useState(EMPTY_TENANT);
  const [tenantOpen, setTenantOpen] = useState(false);

  const { data: overview, isError: ovErr } = useQuery({
    queryKey: ["admin", "overview"], queryFn: () => apiGet("/admin/overview"), retry: false,
    enabled: canLoadAdmin,
  });
  const { data: plans } = useQuery({
    queryKey: ["admin", "plans"], queryFn: () => apiGet("/admin/plans"), retry: false,
    enabled: canLoadAdmin,
  });
  const { data: tenants } = useQuery({
    queryKey: ["admin", "tenants"], queryFn: () => apiGet("/admin/tenants"), retry: false,
    enabled: canLoadAdmin,
  });

  const planList = plans || [];
  const tenantList = tenants || [];
  const planLabels = Object.fromEntries(planList.map((p) => [p.id, p.name]));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin"] });
  };

  const savePlan = useMutation({
    mutationFn: (body) =>
      editingPlan ? apiPut(`/admin/plans/${editingPlan}`, body) : apiPost("/admin/plans", body),
    onSuccess: () => {
      invalidate();
      setPlanForm(EMPTY_PLAN);
      setEditingPlan(null);
      setPlanOpen(false);
      toast.success(editingPlan ? "Plano atualizado" : "Plano criado");
    },
    onError: (e) => toast.error(e?.body?.detail || "Falha ao salvar plano"),
  });

  const togglePlan = useMutation({
    mutationFn: (p) =>
      apiPut(`/admin/plans/${p.id}`, {
        name: p.name,
        price: p.price,
        max_users: p.max_users,
        max_patients: p.max_patients,
        features: p.features || [],
        active: !p.active,
      }),
    onSuccess: () => { invalidate(); toast.success("Status do plano atualizado"); },
    onError: (e) => toast.error(e?.body?.detail || "Falha ao atualizar plano"),
  });

  const delPlan = useMutation({
    mutationFn: (id) => apiDelete(`/admin/plans/${id}`),
    onSuccess: () => { invalidate(); toast.success("Plano removido"); },
    onError: (e) => toast.error(e?.body?.detail || "Falha ao remover plano"),
  });

  const createTenant = useMutation({
    mutationFn: (body) => apiPost("/admin/tenants", body),
    onSuccess: () => {
      invalidate();
      setTenantForm(EMPTY_TENANT);
      setTenantOpen(false);
      toast.success("Clínica criada com seu administrador");
    },
    onError: (e) => toast.error(e?.body?.detail || "Falha ao criar clínica"),
  });

  const patchTenant = useMutation({
    mutationFn: ({ id, body }) => apiPatch(`/admin/tenants/${id}`, body),
    onSuccess: () => { invalidate(); toast.success("Clínica atualizada"); },
    onError: (e) => toast.error(e?.body?.detail || "Falha ao atualizar clínica"),
  });

  function openNewPlan() {
    setEditingPlan(null);
    setPlanForm(EMPTY_PLAN);
    setPlanOpen(true);
  }

  function openEditPlan(p) {
    setEditingPlan(p.id);
    setPlanForm({
      name: p.name,
      price: String(p.price),
      max_users: String(p.max_users),
      max_patients: String(p.max_patients),
      features: (p.features || []).join(", "),
      active: p.active,
    });
    setPlanOpen(true);
  }

  function submitPlan(e) {
    e.preventDefault();
    savePlan.mutate({
      name: planForm.name,
      price: Number(planForm.price) || 0,
      max_users: Number(planForm.max_users) || 1,
      max_patients: Number(planForm.max_patients) || 1,
      features: planForm.features.split(",").map((s) => s.trim()).filter(Boolean),
      active: planForm.active,
    });
  }

  async function logout() {
    await endSession("/auth/logout");
    navigate("/login", { replace: true });
  }

  const metrics = [
    { label: "MRR global", value: ovErr ? "—" : brl(overview?.mrr), icon: TrendingUp, cls: "text-emerald-400", testid: "global-revenue-metric" },
    { label: "Clínicas ativas", value: overview?.tenants_active ?? "—", icon: Building2, cls: "text-indigo-400", testid: "metric-tenants-active" },
    { label: "Clínicas bloqueadas", value: overview?.tenants_blocked ?? "—", icon: Ban, cls: "text-red-400", testid: "metric-tenants-blocked" },
    { label: "Pacientes na plataforma", value: overview?.patients_total ?? "—", icon: Users, cls: "text-cyan-400", testid: "metric-patients-platform" },
  ];

  if (meLoading) return <main className="p-6 text-sm text-slate-400">Verificando acesso…</main>;
  if (meError || !me?.user || me.user.role !== "super_admin") return <Navigate to="/login" replace />;
  if (me.user.must_change_password) return <Navigate to="/primeiro-acesso" replace />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="h-16 flex items-center justify-between px-6 border-b border-[#1E293B] bg-[#070B11] sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Activity className="size-5 text-indigo-400" />
          <div>
            <p className="font-heading font-semibold tracking-tight">ProntuAI · Super Admin</p>
            <p className="text-[11px] text-slate-500">{me?.user?.name || "—"} · plataforma</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={logout} className="text-slate-400 hover:text-red-300" data-testid="superadmin-logout-button">
          <LogOut className="size-4" /> Sair
        </Button>
      </header>

      <main className="p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-lg border border-[#1F2937] bg-[#111827] p-5" data-testid={m.testid}>
              <div className="flex items-start justify-between">
                <p className="overline text-slate-500">{m.label}</p>
                <m.icon className={`size-4 ${m.cls}`} />
              </div>
              <p className="mt-3 font-mono text-2xl font-medium tracking-tight">{m.value}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="tenants" className="mt-6">
          <TabsList variant="line">
            <TabsTrigger value="tenants" data-testid="tab-tenants">Clínicas</TabsTrigger>
            <TabsTrigger value="plans" data-testid="tab-plans">Planos</TabsTrigger>
          </TabsList>

          <TabsContent value="tenants" className="mt-4">
            <div className="flex justify-end mb-3">
              <Dialog open={tenantOpen} onOpenChange={setTenantOpen}>
                <DialogTrigger render={<Button size="sm" data-testid="create-tenant-btn" />}>
                  <Plus className="size-4" /> Nova clínica
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader><DialogTitle className="font-heading">Cadastrar clínica</DialogTitle></DialogHeader>
                  <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); createTenant.mutate(tenantForm); }} data-testid="tenant-form">
                    <div className="space-y-1.5">
                      <Label htmlFor="t-name">Nome da clínica</Label>
                      <Input id="t-name" value={tenantForm.name} onChange={(e) => setTenantForm((f) => ({ ...f, name: e.target.value }))} required data-testid="tenant-name-input" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Especialidade</Label>
                        <Select value={tenantForm.specialty} onValueChange={(v) => setTenantForm((f) => ({ ...f, specialty: v }))}>
                          <SelectTrigger data-testid="tenant-specialty-select">
                            <SelectValue>{(v) => SPECIALTY_LABELS[v] || "Especialidade"}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(SPECIALTY_LABELS).map(([v, l]) => (
                              <SelectItem key={v} value={v} data-testid={`tenant-specialty-option-${v}`}>{l}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Plano</Label>
                        <Select value={tenantForm.plan_id} onValueChange={(v) => setTenantForm((f) => ({ ...f, plan_id: v }))}>
                          <SelectTrigger data-testid="tenant-plan-select">
                            <SelectValue placeholder="Selecione">{(v) => planLabels[v] || "Selecione"}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {planList.map((p) => (
                              <SelectItem key={p.id} value={p.id} data-testid={`tenant-plan-option-${p.id}`}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="t-admin">Nome do administrador</Label>
                      <Input id="t-admin" value={tenantForm.admin_name} onChange={(e) => setTenantForm((f) => ({ ...f, admin_name: e.target.value }))} required data-testid="tenant-admin-name-input" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="t-email">E-mail de acesso</Label>
                        <Input id="t-email" type="email" value={tenantForm.admin_email} onChange={(e) => setTenantForm((f) => ({ ...f, admin_email: e.target.value }))} required data-testid="tenant-admin-email-input" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="t-pwd">Senha inicial</Label>
                        <Input id="t-pwd" value={tenantForm.admin_password} onChange={(e) => setTenantForm((f) => ({ ...f, admin_password: e.target.value }))} required data-testid="tenant-admin-password-input" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createTenant.isPending || !tenantForm.plan_id} data-testid="tenant-save-btn">
                        {createTenant.isPending ? "Criando…" : "Criar clínica"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[#1F2937] bg-[#111827]">
              {tenantList.length === 0 ? (
                <p className="p-6 text-sm text-slate-500" data-testid="tenants-empty">Nenhuma clínica cadastrada.</p>
              ) : (
                <Table className="min-w-[860px]" data-testid="superadmin-tenants-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Clínica</TableHead>
                      <TableHead>Especialidade</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Usuários</TableHead>
                      <TableHead>Pacientes</TableHead>
                      <TableHead>Assinatura</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-44" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenantList.map((t) => (
                      <TableRow key={t.id} data-testid={`tenant-row-${t.id}`}>
                        <TableCell>
                          <p className="font-medium text-slate-100">{t.name}</p>
                          <p className="text-[11px] text-slate-500">{t.admin_name || "Responsável não informado"}</p>
                        </TableCell>
                        <TableCell className="text-slate-400 text-xs">{SPECIALTY_LABELS[t.specialty] || t.specialty}</TableCell>
                        <TableCell>
                          <Select value={t.plan_id || ""} onValueChange={(v) => patchTenant.mutate({ id: t.id, body: { plan_id: v } })}>
                            <SelectTrigger size="sm" data-testid={`tenant-plan-switch-${t.id}`}>
                              <SelectValue>{(v) => planLabels[v] || "—"}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {planList.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name} · {brl(p.price)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-400">{t.users_count}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-400">{t.patients_count}</TableCell>
                        <TableCell>
                          {(() => {
                            const expiredTrial = t.subscription_status === "trialing" && t.trial_ends_at && new Date(t.trial_ends_at) <= new Date();
                            const label = expiredTrial ? "Trial expirado" : ({ trialing: "Teste grátis", pending_payment: "Pagamento pendente", active: "Ativa" }[t.subscription_status] || "Ativa");
                            return <div><Badge variant="outline" className={expiredTrial || t.subscription_status === "pending_payment" ? "border-amber-900 text-amber-300" : "border-emerald-900 text-emerald-300"}>{label}</Badge>{t.subscription_status === "trialing" && t.trial_ends_at ? <p className="mt-1 text-[11px] text-slate-500">até {new Date(t.trial_ends_at).toLocaleDateString("pt-BR")}</p> : null}</div>;
                          })()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={t.status === "active" ? "bg-[#064E3B] text-emerald-400" : "bg-[#7F1D1D] text-red-400"}
                            data-testid={`tenant-status-${t.id}`}
                          >
                            {t.status === "active" ? "Ativa" : "Bloqueada"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {(t.subscription_status === "pending_payment" || (t.subscription_status === "trialing" && t.trial_ends_at && new Date(t.trial_ends_at) <= new Date())) ? <Button
                              variant="outline"
                              size="sm"
                              onClick={() => patchTenant.mutate({ id: t.id, body: { subscription_status: "active" } })}
                              data-testid={`tenant-subscription-activate-${t.id}`}
                            >Confirmar Pix</Button> : null}
                            <Button
                              variant={t.status === "active" ? "outline" : "default"}
                              size="sm"
                              onClick={() => patchTenant.mutate({ id: t.id, body: { status: t.status === "active" ? "blocked" : "active" } })}
                              data-testid={`tenant-lock-toggle-${t.id}`}
                            >
                              {t.status === "active" ? <><Ban className="size-3.5" /> Bloquear</> : <><CheckCircle2 className="size-3.5" /> Liberar</>}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          <TabsContent value="plans" className="mt-4">
            <div className="flex justify-end mb-3">
              <Dialog open={planOpen} onOpenChange={setPlanOpen}>
                <DialogTrigger render={<Button size="sm" onClick={openNewPlan} data-testid="create-plan-btn" />}>
                  <Plus className="size-4" /> Novo plano
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-heading">{editingPlan ? "Editar plano" : "Criar plano"}</DialogTitle>
                  </DialogHeader>
                  <form className="space-y-3" onSubmit={submitPlan} data-testid="plan-form">
                    <div className="space-y-1.5">
                      <Label htmlFor="pl-name">Nome do plano</Label>
                      <Input id="pl-name" value={planForm.name} onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))} required data-testid="plan-name-input" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="pl-price">Preço (R$)</Label>
                        <Input id="pl-price" type="number" step="0.01" value={planForm.price} onChange={(e) => setPlanForm((f) => ({ ...f, price: e.target.value }))} required data-testid="plan-price-input" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pl-users">Máx. usuários</Label>
                        <Input id="pl-users" type="number" value={planForm.max_users} onChange={(e) => setPlanForm((f) => ({ ...f, max_users: e.target.value }))} required data-testid="plan-max-users-input" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pl-pat">Máx. pacientes</Label>
                        <Input id="pl-pat" type="number" value={planForm.max_patients} onChange={(e) => setPlanForm((f) => ({ ...f, max_patients: e.target.value }))} required data-testid="plan-max-patients-input" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pl-feat">Recursos liberados (separados por vírgula)</Label>
                      <Input id="pl-feat" value={planForm.features} onChange={(e) => setPlanForm((f) => ({ ...f, features: e.target.value }))} placeholder="Agenda, Prontuário, Marketing" data-testid="plan-features-input" />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={planForm.active}
                        onChange={(e) => setPlanForm((f) => ({ ...f, active: e.target.checked }))}
                        data-testid="plan-active-checkbox"
                      />
                      Plano ativo (disponível para contratação)
                    </label>
                    <DialogFooter>
                      <Button type="submit" disabled={savePlan.isPending} data-testid="plan-save-btn">
                        {savePlan.isPending ? "Salvando…" : editingPlan ? "Salvar alterações" : "Criar plano"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="plan-builder-card">
              {planList.map((p) => (
                <Card key={p.id} className="border-[#1F2937] bg-[#111827]" data-testid={`plan-card-${p.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="font-heading text-base">{p.name}</CardTitle>
                      <Badge className={p.active ? "bg-[#064E3B] text-emerald-400" : "bg-[#78350F] text-amber-400"}>
                        {p.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="font-mono text-2xl text-slate-100" data-testid={`plan-price-${p.id}`}>{brl(p.price)}<span className="text-xs text-slate-500">/mês</span></p>
                    <ul className="text-xs text-slate-400 space-y-1">
                      <li>Até <strong className="text-slate-200">{p.max_users}</strong> usuários</li>
                      <li>Até <strong className="text-slate-200">{p.max_patients.toLocaleString("pt-BR")}</strong> pacientes</li>
                    </ul>
                    <div className="flex flex-wrap gap-1">
                      {(p.features || []).map((f) => (
                        <span key={f} className="text-[11px] rounded-full border border-[#1F2937] px-2 py-0.5 text-slate-400">{f}</span>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => openEditPlan(p)} data-testid={`plan-edit-${p.id}`}>Editar</Button>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => togglePlan.mutate(p)}
                        data-testid={`plan-toggle-${p.id}`}
                      >
                        {p.active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-slate-500 hover:text-red-400" onClick={() => delPlan.mutate(p.id)} data-testid={`plan-delete-${p.id}`}>
                        Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <section className="mt-8" aria-label="Chaves de integração">
          <ApiKeySettingsPanel />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-2" aria-label="Ferramentas globais">
          <GlobalNoticePanel />
          <GlobalAssistantPanel />
        </section>
      </main>

      <AssistantWidget />
    </div>
  );
}
