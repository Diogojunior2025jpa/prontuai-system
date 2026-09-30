import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Check, X } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import AppShell, { useMe } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl, hasPerm, ptDate } from "@/lib/session";

const STATUS = {
  scheduled: { label: "Agendado", cls: "bg-[#312E81] text-indigo-300" },
  done: { label: "Atendido", cls: "bg-[#064E3B] text-emerald-400" },
  cancelled: { label: "Cancelado", cls: "bg-[#7F1D1D] text-red-400" },
};

export default function Agenda() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const canEdit = hasPerm(me?.user, "agenda.edit");
  const isClinicAdmin = me?.user?.role === "clinic_admin";
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ patient_id: "", date: "", time: "", reason: "" });

  const { data: appts, isError } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => apiGet("/clinic/appointments"),
    retry: false,
  });
  const { data: patients } = useQuery({
    queryKey: ["patients"],
    queryFn: () => apiGet("/clinic/patients"),
    retry: false,
  });
  const { data: team = [] } = useQuery({
    queryKey: ["team"],
    queryFn: () => apiGet("/clinic/team"),
    enabled: isClinicAdmin,
    retry: false,
  });

  const list = isError ? [] : appts || [];
  const patientList = patients || [];
  const professionals = team.filter((member) => member.role === "professional" && member.active);
  const patientLabels = Object.fromEntries(patientList.map((p) => [p.id, p.name]));
  const selectedProfessionalId = me?.user?.role === "professional"
    ? me.user.id
    : form.professional_id || professionals[0]?.id || "";

  const create = useMutation({
    mutationFn: (body) => apiPost("/clinic/appointments", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["clinic", "overview"] });
      setForm({ patient_id: "", date: "", time: "", reason: "" });
      setOpen(false);
      toast.success("Consulta agendada");
    },
    onError: (e) => toast.error(e?.body?.detail || "Falha ao agendar"),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }) => apiPatch(`/clinic/appointments/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["clinic", "overview"] });
      toast.success("Agendamento atualizado");
    },
    onError: (e) => toast.error(e?.body?.detail || "Falha ao atualizar"),
  });

  return (
    <AppShell
      title="Agenda"
      subtitle="Consultas da sua clínica"
      actions={
        canEdit ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button size="sm" data-testid="new-appointment-button" />}>
              <CalendarPlus className="size-4" /> Agendar
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-heading">Nova consulta</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => { e.preventDefault(); create.mutate({ ...form, professional_id: selectedProfessionalId || null }); }}
                data-testid="appointment-form"
              >
                <div className="space-y-1.5">
                  <Label>Paciente</Label>
                  <Select
                    value={form.patient_id}
                    onValueChange={(v) => setForm((f) => ({ ...f, patient_id: v }))}
                  >
                    <SelectTrigger data-testid="appointment-patient-select">
                      <SelectValue placeholder="Selecione o paciente">
                        {(v) => patientLabels[v] || "Selecione o paciente"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {patientList.map((p) => (
                        <SelectItem key={p.id} value={p.id} data-testid={`appointment-patient-option-${p.id}`}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {isClinicAdmin ? (
                  <div className="space-y-1.5">
                    <Label>Profissional</Label>
                    <Select value={selectedProfessionalId} onValueChange={(value) => setForm((current) => ({ ...current, professional_id: value }))}>
                      <SelectTrigger data-testid="appointment-professional-select">
                        <SelectValue placeholder="Selecione o profissional">{(value) => professionals.find((member) => member.id === value)?.name || "Selecione o profissional"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {professionals.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {professionals.length === 0 ? <p className="text-xs text-amber-400">Cadastre um profissional ativo em Equipe & Permissões.</p> : null}
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="a-date">Data</Label>
                    <Input
                      id="a-date" type="date" value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                      required data-testid="appointment-date-input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="a-time">Hora</Label>
                    <Input
                      id="a-time" type="time" value={form.time}
                      onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                      required data-testid="appointment-time-input"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="a-reason">Motivo</Label>
                  <Input
                    id="a-reason" value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                    placeholder="Ex: dor ao mastigar" data-testid="appointment-reason-input"
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={create.isPending || !form.patient_id || (isClinicAdmin && !selectedProfessionalId)} data-testid="appointment-save-button">
                    {create.isPending ? "Agendando…" : "Confirmar agendamento"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null
      }
    >
      <div className="overflow-x-auto rounded-lg border border-[#1F2937] bg-[#111827]">
        {list.length === 0 ? (
          <p className="p-6 text-sm text-slate-500" data-testid="appointments-empty">
            Nenhuma consulta na agenda.
          </p>
        ) : (
          <Table className="min-w-[760px]" data-testid="appointments-table">
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Hora</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((a) => (
                <TableRow key={a.id} data-testid={`appointment-row-${a.id}`}>
                  <TableCell className="font-mono text-xs text-slate-400">{ptDate(a.date)}</TableCell>
                  <TableCell className="font-mono text-cyan-400">{a.time}</TableCell>
                  <TableCell className="font-medium text-slate-100">{a.patient_name}</TableCell>
                  <TableCell className="text-slate-400 text-xs">{a.reason || "—"}</TableCell>
                  <TableCell>
                    <Badge className={STATUS[a.status]?.cls} data-testid={`appointment-status-${a.id}`}>
                      {STATUS[a.status]?.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-400">{a.price ? brl(a.price) : "—"}</TableCell>
                  <TableCell>
                    {canEdit && a.status === "scheduled" ? (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost" size="icon-sm" className="text-slate-500 hover:text-emerald-400"
                          onClick={() => patch.mutate({ id: a.id, body: { status: "done", price: 250 } })}
                          data-testid={`appointment-done-${a.id}`}
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon-sm" className="text-slate-500 hover:text-red-400"
                          onClick={() => patch.mutate({ id: a.id, body: { status: "cancelled" } })}
                          data-testid={`appointment-cancel-${a.id}`}
                        >
                          <X className="size-4" />
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
