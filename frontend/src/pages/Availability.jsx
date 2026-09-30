import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AppShell, { useMe } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { hasPerm, ptDate } from "@/lib/session";

const TODAY = new Date().toISOString().slice(0, 10);

function makeTimes(start, end, interval) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  let current = startHour * 60 + startMinute;
  const finish = endHour * 60 + endMinute;
  const times = [];
  while (current < finish && times.length < 32) {
    times.push(`${String(Math.floor(current / 60)).padStart(2, "0")}:${String(current % 60).padStart(2, "0")}`);
    current += interval;
  }
  return times;
}

export default function Availability() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const user = me?.user;
  const canManage = hasPerm(user, "agenda.edit") && ["clinic_admin", "professional"].includes(user?.role);
  const isClinicAdmin = user?.role === "clinic_admin";
  const [date, setDate] = useState(TODAY);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [interval, setInterval] = useState("30");
  const [professionalId, setProfessionalId] = useState("");

  const { data: team = [] } = useQuery({
    queryKey: ["team"], queryFn: () => apiGet("/clinic/team"), enabled: isClinicAdmin, retry: false,
  });
  const professionals = team.filter((member) => member.role === "professional" && member.active);
  const selectedProfessionalId = isClinicAdmin ? professionalId || professionals[0]?.id || "" : user?.id;
  const { data: slots = [], isError } = useQuery({
    queryKey: ["availability", date],
    queryFn: () => apiGet(`/clinic/availability?date=${encodeURIComponent(date)}`),
    enabled: canManage && Boolean(date),
    refetchInterval: 15_000,
    retry: false,
  });

  const create = useMutation({
    mutationFn: (body) => apiPost("/clinic/availability", body),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["availability"] });
      toast.success(result.created ? `${result.created} horário(s) publicado(s)` : "Os horários já estavam cadastrados");
    },
    onError: (error) => toast.error(error?.body?.detail || "Não foi possível publicar os horários"),
  });
  const remove = useMutation({
    mutationFn: (id) => apiDelete(`/clinic/availability/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["availability"] }),
    onError: (error) => toast.error(error?.body?.detail || "Não foi possível remover o horário"),
  });

  function submit(event) {
    event.preventDefault();
    const times = makeTimes(startTime, endTime, Number(interval));
    if (!times.length || !selectedProfessionalId) {
      toast.error("Informe uma faixa válida e selecione o profissional");
      return;
    }
    create.mutate({ date, times, professional_id: isClinicAdmin ? selectedProfessionalId : undefined });
  }

  if (!canManage) {
    return <AppShell title="Disponibilidade"><p className="text-sm text-amber-400">Seu perfil não pode gerenciar horários.</p></AppShell>;
  }

  return (
    <AppShell title="Disponibilidade" subtitle="Publique horários para o Portal do Paciente">
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <Card className="h-fit border-[#1F2937] bg-[#111827]">
          <CardHeader>
            <CardTitle className="font-heading text-base">Publicar horários</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit} data-testid="availability-form">
              {isClinicAdmin ? (
                <div className="space-y-1.5">
                  <Label>Profissional</Label>
                  <Select value={selectedProfessionalId} onValueChange={setProfessionalId}>
                    <SelectTrigger data-testid="availability-professional-select">
                      <SelectValue placeholder="Selecione o profissional">{(value) => professionals.find((member) => member.id === value)?.name || "Selecione o profissional"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {professionals.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {professionals.length === 0 ? <p className="text-xs text-amber-400">Cadastre um profissional ativo em Equipe & Permissões.</p> : null}
                </div>
              ) : (
                <p className="text-sm text-slate-400">Sua agenda · {user?.name}</p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="availability-date">Data</Label>
                <Input id="availability-date" type="date" min={TODAY} value={date} onChange={(event) => setDate(event.target.value)} required data-testid="availability-date" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="availability-start">A partir de</Label>
                  <Input id="availability-start" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required data-testid="availability-start" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="availability-end">Até</Label>
                  <Input id="availability-end" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required data-testid="availability-end" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Intervalo entre consultas</Label>
                <Select value={interval} onValueChange={setInterval}>
                  <SelectTrigger data-testid="availability-interval"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[15, 30, 45, 60].map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes} minutos</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={create.isPending || !selectedProfessionalId} data-testid="availability-publish">
                <Plus className="size-4" /> {create.isPending ? "Publicando…" : "Publicar horários"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="min-w-0 border-[#1F2937] bg-[#111827]">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="font-heading text-base">Agenda disponível</CardTitle>
              <p className="mt-1 text-xs text-slate-500">{ptDate(date)} · sincroniza automaticamente</p>
            </div>
            <CalendarClock className="size-4 shrink-0 text-cyan-400" />
          </CardHeader>
          <CardContent>
            {isError ? <p className="text-sm text-amber-400">Não foi possível carregar a disponibilidade.</p> : null}
            {slots.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500" data-testid="availability-empty">Nenhum horário publicado para esta data.</p>
            ) : (
              <ul className="divide-y divide-[#1F2937]" data-testid="availability-list">
                {slots.map((slot) => (
                  <li key={slot.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid={`availability-slot-${slot.id}`}>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="font-mono text-sm text-cyan-300">{slot.time}</span>
                      <span className="truncate text-sm text-slate-200">{slot.professional_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={slot.status === "available" ? "border-emerald-900 text-emerald-300" : "border-slate-700 text-slate-400"}>
                        {slot.status === "available" ? "Disponível no portal" : "Reservado"}
                      </Badge>
                      {slot.status === "available" ? (
                        <Button
                          type="button" variant="ghost" size="icon" title="Remover horário" aria-label={`Remover ${slot.time}`}
                          onClick={() => remove.mutate(slot.id)} disabled={remove.isPending}
                          data-testid={`availability-remove-${slot.id}`}
                        ><Trash2 className="size-4" /></Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
