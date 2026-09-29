import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarClock, FileText, TrendingUp, Users } from "lucide-react";
import { apiGet } from "@/lib/api";
import AppShell, { useMe } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { brl, hasPerm, ptDate } from "@/lib/session";

function Metric({ label, value, icon: Icon, accent, testid }) {
  return (
    <div
      className="rounded-lg border border-[#1F2937] bg-[#111827] p-5 hover:border-[#374151] transition-colors duration-200"
      data-testid={testid}
    >
      <div className="flex items-start justify-between">
        <p className="overline text-slate-500">{label}</p>
        <Icon className={`size-4 ${accent}`} />
      </div>
      <p className="mt-3 font-mono text-2xl font-medium tracking-tight text-slate-100">{value}</p>
    </div>
  );
}

const STATUS_BADGE = {
  scheduled: { label: "Agendado", cls: "bg-[#312E81] text-indigo-300" },
  done: { label: "Atendido", cls: "bg-[#064E3B] text-emerald-400" },
  cancelled: { label: "Cancelado", cls: "bg-[#7F1D1D] text-red-400" },
};

export default function Dashboard() {
  const { data: me } = useMe();
  const user = me?.user;
  const { data, isError } = useQuery({
    queryKey: ["clinic", "overview"],
    queryFn: () => apiGet("/clinic/overview"),
    retry: false,
  });

  const agenda = isError ? [] : data?.agenda_today || [];

  return (
    <AppShell
      title={`Bom dia, ${user?.name?.split(" ").slice(0, 2).join(" ") || ""}`}
      subtitle={data?.date ? `Visão operacional de ${ptDate(data.date)}` : "Visão operacional da clínica"}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Pacientes na base"
          value={data?.patients_total ?? "—"}
          icon={Users}
          accent="text-cyan-400"
          testid="metric-patients-total"
        />
        <Metric
          label="Consultas hoje"
          value={data?.appointments_today ?? "—"}
          icon={CalendarClock}
          accent="text-indigo-400"
          testid="metric-appointments-today"
        />
        <Metric
          label="Faturamento do mês"
          value={hasPerm(user, "finance.view") ? brl(data?.revenue_month) : "restrito"}
          icon={TrendingUp}
          accent="text-emerald-400"
          testid="metric-revenue-month"
        />
        <Metric
          label="Prontuários registrados"
          value={data?.records_total ?? "—"}
          icon={FileText}
          accent="text-purple-400"
          testid="metric-records-total"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 border-[#1F2937] bg-[#111827]">
          <CardHeader>
            <CardTitle className="font-heading text-base">Agenda de hoje</CardTitle>
          </CardHeader>
          <CardContent>
            {agenda.length === 0 ? (
              <p className="text-sm text-slate-500" data-testid="agenda-today-empty">
                Nenhuma consulta agendada para hoje.
              </p>
            ) : (
              <ul className="divide-y divide-[#1F2937]" data-testid="agenda-today-list">
                {agenda.map((a) => (
                  <li key={a.id} className="flex items-center gap-4 py-3" data-testid={`agenda-item-${a.id}`}>
                    <span className="font-mono text-sm text-cyan-400 w-14 shrink-0">{a.time}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-100 truncate">{a.patient_name}</p>
                      <p className="text-xs text-slate-500 truncate">{a.reason || "Sem motivo informado"}</p>
                    </div>
                    <Badge className={STATUS_BADGE[a.status]?.cls}>{STATUS_BADGE[a.status]?.label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-[#1F2937] bg-[#111827]">
          <CardHeader>
            <CardTitle className="font-heading text-base">Ações rápidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {hasPerm(user, "records.edit") ? (
              <Link
                to="/app/prontuario"
                className={buttonVariants({ variant: "default", size: "sm" }) + " w-full justify-start"}
                data-testid="quick-action-record"
              >
                Novo prontuário por voz
              </Link>
            ) : null}
            {hasPerm(user, "agenda.edit") ? (
              <Link
                to="/app/agenda"
                className={buttonVariants({ variant: "outline", size: "sm" }) + " w-full justify-start"}
                data-testid="quick-action-agenda"
              >
                Agendar consulta
              </Link>
            ) : null}
            {hasPerm(user, "patients.edit") ? (
              <Link
                to="/app/pacientes"
                className={buttonVariants({ variant: "outline", size: "sm" }) + " w-full justify-start"}
                data-testid="quick-action-patient"
              >
                Cadastrar paciente
              </Link>
            ) : null}
            {hasPerm(user, "campaigns.send") ? (
              <Link
                to="/app/campanhas"
                className={buttonVariants({ variant: "outline", size: "sm" }) + " w-full justify-start"}
                data-testid="quick-action-campaign"
              >
                Disparar campanha
              </Link>
            ) : null}
            <p className="pt-2 text-xs text-slate-500 leading-relaxed">
              Seu acesso é limitado às permissões concedidas pelo administrador da clínica.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
