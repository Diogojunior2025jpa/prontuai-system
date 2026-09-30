import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import AppShell, { useMe } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPerm, ptDate } from "@/lib/session";

const EMPTY = { name: "", cpf: "", birth_date: "", phone: "", email: "", notes: "" };

export default function Patients() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const canEdit = hasPerm(me?.user, "patients.edit");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingPatient, setEditingPatient] = useState(null);

  const { data, isError } = useQuery({
    queryKey: ["patients"],
    queryFn: () => apiGet("/clinic/patients"),
    retry: false,
  });
  const patients = isError ? [] : data || [];

  const create = useMutation({
    mutationFn: (body) => apiPost("/clinic/patients", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["clinic", "overview"] });
      setForm(EMPTY);
      setEditingPatient(null);
      setOpen(false);
      toast.success("Paciente cadastrado");
    },
    onError: (e) => toast.error(e?.body?.detail || "Falha ao cadastrar paciente"),
  });

  const update = useMutation({
    mutationFn: ({ id, body }) => apiPut(`/clinic/patients/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["records"] });
      setForm(EMPTY);
      setEditingPatient(null);
      setOpen(false);
      toast.success("Cadastro do paciente atualizado");
    },
    onError: (e) => toast.error(e?.body?.detail || "Falha ao atualizar paciente"),
  });

  const remove = useMutation({
    mutationFn: (id) => apiDelete(`/clinic/patients/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast.success("Paciente removido");
    },
    onError: (e) => toast.error(e?.body?.detail || "Falha ao remover"),
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function editPatient(patient) {
    setEditingPatient(patient);
    setForm({
      name: patient.name,
      cpf: patient.cpf,
      birth_date: patient.birth_date,
      phone: patient.phone || "",
      email: patient.email || "",
      notes: patient.notes || "",
    });
    setOpen(true);
  }

  function closeDialog(nextOpen) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setEditingPatient(null);
      setForm(EMPTY);
    }
  }

  return (
    <AppShell
      title="Pacientes"
      subtitle="Base exclusiva desta clínica — isolada por tenant_id"
      actions={
        canEdit ? (
          <Dialog open={open} onOpenChange={closeDialog}>
            <DialogTrigger render={<Button size="sm" onClick={() => { setEditingPatient(null); setForm(EMPTY); }} data-testid="new-patient-button" />}>
              <Plus className="size-4" /> Novo paciente
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-heading">{editingPatient ? "Editar paciente" : "Cadastrar paciente"}</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editingPatient) update.mutate({ id: editingPatient.id, body: form });
                  else create.mutate(form);
                }}
                data-testid="patient-form"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="p-name">Nome completo</Label>
                  <Input id="p-name" value={form.name} onChange={set("name")} required data-testid="patient-name-input" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="p-cpf">CPF</Label>
                    <Input id="p-cpf" value={form.cpf} onChange={set("cpf")} required data-testid="patient-cpf-input" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="p-birth">Nascimento</Label>
                    <Input id="p-birth" type="date" value={form.birth_date} onChange={set("birth_date")} required data-testid="patient-birth-input" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="p-phone">Telefone</Label>
                    <Input id="p-phone" value={form.phone} onChange={set("phone")} data-testid="patient-phone-input" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="p-email">E-mail</Label>
                    <Input id="p-email" type="email" value={form.email} onChange={set("email")} data-testid="patient-email-input" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-notes">Observações</Label>
                  <Textarea id="p-notes" value={form.notes} onChange={set("notes")} rows={2} data-testid="patient-notes-input" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={create.isPending || update.isPending} data-testid="patient-save-button">
                    {create.isPending || update.isPending ? "Salvando…" : editingPatient ? "Salvar alterações" : "Salvar paciente"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null
      }
    >
      <div className="overflow-x-auto rounded-lg border border-[#1F2937] bg-[#111827]">
        {patients.length === 0 ? (
          <p className="p-6 text-sm text-slate-500" data-testid="patients-empty">
            Nenhum paciente cadastrado nesta clínica.
          </p>
        ) : (
          <Table className="min-w-[700px]" data-testid="patients-table">
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Nascimento</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((p) => (
                <TableRow key={p.id} data-testid={`patient-row-${p.id}`}>
                  <TableCell className="font-medium text-slate-100">{p.name}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-400">{p.cpf}</TableCell>
                  <TableCell className="text-slate-400">{ptDate(p.birth_date)}</TableCell>
                  <TableCell className="text-slate-400 text-xs">
                    {p.phone || "—"}
                    <span className="block text-slate-600">{p.email || ""}</span>
                  </TableCell>
                  <TableCell>
                    {canEdit ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost" size="icon-sm" title="Editar paciente" aria-label={`Editar ${p.name}`}
                          onClick={() => editPatient(p)} data-testid={`patient-edit-${p.id}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon-sm" title="Remover paciente" aria-label={`Remover ${p.name}`}
                          className="text-slate-500 hover:text-red-400"
                          onClick={() => remove.mutate(p.id)} data-testid={`patient-delete-${p.id}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </AppShell>
  );
}
