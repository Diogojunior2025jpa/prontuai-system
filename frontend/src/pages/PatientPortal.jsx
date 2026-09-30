import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, HeartPulse, LogOut } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { endSession, ptDate } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS = {
  scheduled: { label: "Agendado", cls: "bg-[#312E81] text-indigo-300" },
  done: { label: "Realizado", cls: "bg-[#064E3B] text-emerald-400" },
  cancelled: { label: "Cancelado", cls: "bg-[#7F1D1D] text-red-400" },
};

export default function PatientPortal() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: "", time: "", reason: "", availability_id: "" });

  const { data: me, isError: meErr } = useQuery({
    queryKey: ["portal", "me"], queryFn: () => apiGet("/portal/me"), retry: false,
  });
  const { data: appts, isError } = useQuery({
    queryKey: ["portal", "appointments"], queryFn: () => apiGet("/portal/appointments"), retry: false,
  });
  const { data: availabilityData, isError: availabilityError } = useQuery({
    queryKey: ["portal", "availability", form.date],
    queryFn: () => apiGet(`/portal/availability?date=${encodeURIComponent(form.date)}`),
    enabled: open && Boolean(form.date),
    refetchInterval: 10_000,
    retry: false,
  });
  const availability = availabilityData?.slots || [];
  const usesAvailability = availabilityData?.managed ?? true;

  const list = isError ? [] : appts || [];
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = list.filter((a) => a.date >= today && a.status === "scheduled");
  const past = list.filter((a) => !(a.date >= today && a.status === "scheduled"));

  const book = useMutation({
    mutationFn: (body) => apiPost("/portal/appointments", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal", "appointments"] });
      setForm({ date: "", time: "", reason: "", availability_id: "" });
      setOpen(false);
      toast.success("Consulta solicitada com sucesso");
    },
    onError: (e) => toast.error(e?.body?.detail || "Falha ao agendar"),
  });

  async function logout() {
    await endSession("/portal/logout");
    navigate("/portal/login", { replace: true });
  }

  const Row = ({ a }) => (
    <li
      className="flex flex-wrap items-center gap-3 rounded-md border border-[#1F2937] bg-[#161F30] p-3"
      data-testid={`portal-appointment-${a.id}`}
    >
      <div className="font-mono text-sm text-cyan-400 w-24 shrink-0">{ptDate(a.date)}</div>
      <div className="font-mono text-sm text-slate-300 w-14 shrink-0">{a.time}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-100 truncate">{a.reason || "Consulta"}</p>
        <p className="text-xs text-slate-500">{a.professional_name || "Profissional a definir"}</p>
      </div>
      <Badge className={STATUS[a.status]?.cls}>{STATUS[a.status]?.label}</Badge>
    </li>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="h-16 flex items-center justify-between px-6 border-b border-[#1E293B] bg-[#070B11] sticky top-0 z-20">
        <div className="flex items-center gap-3" data-testid="patient-portal-nav">
          <HeartPulse className="size-5 text-cyan-400" />
          <div className="min-w-0">
            <p className="font-heading font-semibold tracking-tight truncate" data-testid="portal-patient-name">
              {me?.patient?.name || "Portal do Paciente"}
            </p>
            <p className="text-[11px] text-slate-500 truncate" data-testid="portal-clinic-name">
              {me?.clinic?.name || "—"}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={logout} className="text-slate-400 hover:text-red-300" data-testid="portal-logout-button">
          <LogOut className="size-4" /> Sair
        </Button>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        {meErr ? (
          <p className="text-sm text-amber-400" data-testid="portal-session-warning">
            Sessão expirada. <a className="underline" href="/portal/login">Entrar novamente</a>.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">Minhas consultas</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button size="sm" data-testid="book-new-appointment-btn" />}>
              <CalendarPlus className="size-4" /> Marcar consulta
            </DialogTrigger>
            <DialogContent className="max-h-[85dvh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md">
              <DialogHeader><DialogTitle className="font-heading">Marcar nova consulta</DialogTitle></DialogHeader>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); book.mutate(form); }} data-testid="portal-booking-form">
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="b-date">Data</Label>
                    <Input
                      id="b-date" type="date" min={today} value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value, time: "", availability_id: "" }))}
                      required data-testid="appointment-date-picker"
                    />
                  </div>
                  <div className="space-y-1.5">
                    {usesAvailability ? (
                      <>
                        <Label>Horários disponíveis</Label>
                        <Select
                          value={form.availability_id}
                          onValueChange={(availabilityId) => {
                            const slot = availability.find((item) => item.id === availabilityId);
                            setForm((current) => ({ ...current, availability_id: availabilityId, time: slot?.time || "" }));
                          }}
                          disabled={!form.date || availability.length === 0}
                        >
                          <SelectTrigger data-testid="appointment-time-picker">
                            <SelectValue placeholder={availability.length ? "Selecione um horário" : "Sem horários nesta data"}>
                              {(value) => {
                                const slot = availability.find((item) => item.id === value);
                                return slot ? `${slot.time} · ${slot.professional_name}` : "Selecione um horário";
                              }}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {availability.map((slot) => (
                              <SelectItem key={slot.id} value={slot.id}>{slot.time} · {slot.professional_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    ) : (
                      <>
                        <Label htmlFor="b-time">Horário</Label>
                        <Input
                          id="b-time" type="time" value={form.time}
                          onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))}
                          required data-testid="appointment-time-picker"
                        />
                      </>
                    )}
                  </div>
                </div>
                {availabilityError ? <p className="text-xs text-amber-400">Não foi possível consultar os horários.</p> : null}
                {form.date && usesAvailability && !availabilityError && availability.length === 0 ? (
                  <p className="text-xs text-slate-500" data-testid="portal-availability-empty">Nenhum horário disponível nessa data. Escolha outra data.</p>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="b-reason">Motivo</Label>
                  <Input
                    id="b-reason" value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                    placeholder="Ex: avaliação de rotina" data-testid="portal-reason-input"
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={book.isPending || (usesAvailability ? !form.availability_id : !form.time)} data-testid="confirm-booking-btn">
                    {book.isPending ? "Enviando…" : "Confirmar consulta"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border-[#1F2937] bg-[#111827]">
          <CardHeader><CardTitle className="font-heading text-base">Próximas consultas</CardTitle></CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-500" data-testid="upcoming-appointments-empty">
                Você não tem consultas futuras agendadas.
              </p>
            ) : (
              <ul className="space-y-2" data-testid="upcoming-appointments-list">
                {upcoming.map((a) => <Row key={a.id} a={a} />)}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-[#1F2937] bg-[#111827]">
          <CardHeader><CardTitle className="font-heading text-base">Histórico</CardTitle></CardHeader>
          <CardContent>
            {past.length === 0 ? (
              <p className="text-sm text-slate-500" data-testid="past-appointments-empty">Nenhum atendimento anterior.</p>
            ) : (
              <ul className="space-y-2" data-testid="past-appointments-list">
                {past.map((a) => <Row key={a.id} a={a} />)}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
