import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  CircleDollarSign,
  Lightbulb,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AppShell, { useMe } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/api";
import { brl, hasPerm } from "@/lib/session";

function FinancialMetric({ label, value, hint, icon: Icon, accent, testid }) {
  return (
    <Card className="border-[#1F2937] bg-[#111827]" data-testid={testid}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="overline text-slate-500">{label}</p>
            <p className="mt-3 font-mono text-2xl font-medium text-slate-100">{value}</p>
            <p className="mt-2 text-xs text-slate-500">{hint}</p>
          </div>
          <Icon className={`size-5 shrink-0 ${accent}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function FinanceError({ error }) {
  const message = error?.body?.detail || "Não foi possível carregar os dados financeiros.";
  return (
    <div
      className="rounded-lg border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-200"
      role="alert"
      data-testid="finance-load-error"
    >
      {message}
    </div>
  );
}

export default function FinancialGuide() {
  const { data: me, isPending: mePending } = useMe();
  const canViewFinance = hasPerm(me?.user, "finance.view");
  const query = useQuery({
    queryKey: ["clinic", "finance", "overview"],
    queryFn: () => apiGet("/clinic/finance/overview"),
    enabled: canViewFinance,
    retry: false,
  });

  if (mePending) {
    return <main className="p-6 text-sm text-slate-400">Verificando acesso…</main>;
  }
  if (!me?.user) {
    return <Navigate to="/login" replace />;
  }
  if (!canViewFinance) {
    return <Navigate to="/app" replace />;
  }

  const current = query.data?.current_month;
  const months = query.data?.months || [];
  const changePercent = query.data?.completed_change_percent;
  const monthTitle = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(new Date(`${current?.month || "2000-01"}-15T12:00:00`));
  const trendIsPositive = changePercent >= 0;

  return (
    <AppShell
      title="Guia financeiro"
      subtitle="Acompanhe a atividade e as estimativas da clínica"
    >
      {query.isPending ? (
        <div className="text-sm text-slate-400" data-testid="finance-loading">
          Carregando análise financeira…
        </div>
      ) : query.isError ? (
        <FinanceError error={query.error} />
      ) : (
        <>
          <section
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Resumo financeiro"
            data-testid="finance-summary"
          >
            <FinancialMetric
              label="Consultas concluídas"
              value={brl(current?.completed_value)}
              hint={`${current?.completed_count || 0} atendimentos · valor cadastrado`}
              icon={CircleDollarSign}
              accent="text-cyan-400"
              testid="finance-completed-value"
            />
            <FinancialMetric
              label="Agenda prevista"
              value={brl(current?.scheduled_value)}
              hint={`${current?.scheduled_count || 0} consultas agendadas no mês`}
              icon={CalendarCheck}
              accent="text-indigo-400"
              testid="finance-scheduled-value"
            />
            <FinancialMetric
              label="Variação mensal"
              value={changePercent == null ? "—" : `${changePercent > 0 ? "+" : ""}${changePercent}%`}
              hint={changePercent == null ? "Sem base no mês anterior" : "Valor de consultas concluídas"}
              icon={changePercent == null ? TrendingUp : trendIsPositive ? ArrowUpRight : ArrowDownRight}
              accent={changePercent == null ? "text-slate-400" : trendIsPositive ? "text-emerald-400" : "text-amber-400"}
              testid="finance-monthly-change"
            />
            <FinancialMetric
              label="Consultas canceladas"
              value={current?.cancelled_count || 0}
              hint="No mês selecionado"
              icon={ArrowDownRight}
              accent="text-rose-400"
              testid="finance-cancelled-count"
            />
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
            <Card className="border-[#1F2937] bg-[#111827]">
              <CardHeader>
                <CardTitle className="font-heading text-base">
                  Atividade financeira · últimos 6 meses
                </CardTitle>
                <p className="text-sm text-slate-500">
                  Comparação entre atendimentos concluídos e valores potenciais da agenda.
                </p>
              </CardHeader>
              <CardContent>
                <div className="h-72 w-full" data-testid="finance-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={months} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
                      <CartesianGrid stroke="#263244" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="month"
                        tickFormatter={(value) =>
                          new Intl.DateTimeFormat("pt-BR", { month: "short" })
                            .format(new Date(`${value}-15T12:00:00`))
                        }
                        stroke="#64748B"
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#64748B"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `R$ ${value}`}
                        width={72}
                      />
                      <Tooltip
                        formatter={(value, name) => [
                          brl(value),
                          name === "completed_value" ? "Concluídas · estimado" : "Agendadas · potencial",
                        ]}
                        labelFormatter={(value) =>
                          new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
                            .format(new Date(`${value}-15T12:00:00`))
                        }
                        contentStyle={{
                          background: "#0B0F17",
                          border: "1px solid #334155",
                          borderRadius: "10px",
                          color: "#E2E8F0",
                        }}
                      />
                      <Legend
                        formatter={(value) =>
                          value === "completed_value" ? "Concluídas · estimado" : "Agendadas · potencial"
                        }
                      />
                      <Bar dataKey="completed_value" fill="#22D3EE" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="scheduled_value" fill="#818CF8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-cyan-900/60 bg-gradient-to-br from-[#111827] to-[#0C1822]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Lightbulb className="size-4 text-cyan-300" />
                  <CardTitle className="font-heading text-base">Análise inteligente</CardTitle>
                </div>
                <p className="text-sm capitalize text-slate-500">{monthTitle}</p>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {changePercent == null ? (
                  <p className="text-slate-300">
                    Ainda não há valor de consultas concluídas no mês anterior para uma comparação confiável.
                  </p>
                ) : (
                  <p className="text-slate-300">
                    O valor cadastrado em consultas concluídas está{" "}
                    <strong className={trendIsPositive ? "text-emerald-300" : "text-amber-300"}>
                      {Math.abs(changePercent)}% {trendIsPositive ? "acima" : "abaixo"}
                    </strong>{" "}
                    do mês anterior.
                  </p>
                )}
                {current?.scheduled_count > 0 ? (
                  <p className="text-slate-300">
                    A agenda tem {current.scheduled_count} consulta(s) com potencial de{" "}
                    <strong className="text-indigo-300">{brl(current.scheduled_value)}</strong>.
                    Esse valor depende da realização e não é receita confirmada.
                  </p>
                ) : (
                  <p className="text-slate-300">
                    Não há consultas futuras agendadas neste mês. Revise a agenda para planejar a capacidade da clínica.
                  </p>
                )}
                <div className="rounded-md border border-amber-800/50 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-100/80">
                  O sistema ainda não registra confirmação de pagamentos, despesas ou inadimplência. Use estes
                  números como acompanhamento operacional, não como saldo ou fluxo de caixa.
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6 border-[#1F2937] bg-[#111827]">
            <CardHeader>
              <CardTitle className="font-heading text-base">Como usar este guia</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm text-slate-300 md:grid-cols-3">
              <p><strong className="text-cyan-300">1. Mantenha valores atualizados.</strong> O gráfico usa os preços salvos nos agendamentos.</p>
              <p><strong className="text-cyan-300">2. Acompanhe a agenda.</strong> Consultas agendadas são potencial, não recebimento garantido.</p>
              <p><strong className="text-cyan-300">3. Confirme no financeiro real.</strong> Pagamentos, gastos e inadimplência ainda não são controlados neste painel.</p>
            </CardContent>
          </Card>
        </>
      )}
      {query.data?.data_note ? (
        <p className="mt-4 text-xs text-slate-500" data-testid="finance-data-note">
          {query.data.data_note}
        </p>
      ) : null}
    </AppShell>
  );
}
