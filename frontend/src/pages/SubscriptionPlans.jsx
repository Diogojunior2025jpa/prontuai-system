import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { useMe } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { brl, PLAN_DESCRIPTIONS } from "@/lib/session";

export default function SubscriptionPlans() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading, isError: meError } = useMe();
  const isClinicAdmin = me?.user?.role === "clinic_admin";
  const { data: plans = [], isLoading: plansLoading } = useQuery({ queryKey: ["public-plans"], queryFn: () => apiGet("/auth/plans"), retry: false });
  const { data: subscription } = useQuery({ queryKey: ["clinic-subscription"], queryFn: () => apiGet("/clinic/subscription"), enabled: isClinicAdmin, retry: false });
  const selectPlan = useMutation({
    mutationFn: (plan_id) => apiPut("/clinic/subscription/plan", { plan_id }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["clinic-subscription"] });
      if (result.subscription_status === "trialing") {
        toast.success("Plano atualizado. A data final do teste não foi alterada.");
      } else {
        checkout.mutate(result.plan.id);
      }
    },
    onError: (error) => toast.error(error?.body?.detail || "Não foi possível selecionar o plano"),
  });
  const checkout = useMutation({
    mutationFn: (plan_id) => apiPost("/clinic/subscription/checkout", { plan_id }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["clinic-subscription"] });
      if (result.payment_url) {
        window.location.assign(result.payment_url);
      } else {
        toast.info(result.message || "A cobrança está sendo gerada. Tente novamente em instantes.");
      }
    },
    onError: (error) => toast.error(error?.body?.detail || "Não foi possível gerar a cobrança"),
  });

  if (meLoading) return <main className="p-6 text-sm text-slate-400">Verificando acesso…</main>;
  if (meError || !me?.user) return <Navigate to="/login" replace />;
  if (!isClinicAdmin) return <Navigate to="/login" replace />;

  const trialEnds = subscription?.trial_ends_at ? new Date(subscription.trial_ends_at) : null;
  const isTrialing = subscription?.subscription_status === "trialing";
  const pendingPayment = ["pending_payment", "expired"].includes(subscription?.subscription_status);
  const pagbankLinkStarted = Boolean(subscription?.pagbank_recurring_link_started);
  const paidActive = (subscription?.subscription_status || "active") === "active";
  const paymentOverdue = ["overdue", "payment_problem"].includes(subscription?.subscription_payment_status);
  const graceUntil = subscription?.subscription_grace_until
    ? new Date(subscription.subscription_grace_until).toLocaleDateString("pt-BR")
    : null;

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="mx-auto max-w-5xl">
        <Button variant="ghost" size="sm" onClick={() => navigate("/app")}><ArrowLeft className="size-4" /> Voltar ao painel</Button>
        <header className="mt-5 flex flex-wrap items-end justify-between gap-4 border-b border-[#283443] pb-5">
          <div><p className="overline text-cyan-400">Assinatura da clínica</p><h1 className="mt-2 font-heading text-2xl font-semibold">Planos disponíveis</h1><p className="mt-2 text-sm text-slate-400">Escolha o plano que atende à sua clínica.</p></div>
          {isTrialing && trialEnds ? <Badge variant="outline" className="border-emerald-900 text-emerald-300"><Clock3 className="mr-1 size-3" />Teste até {trialEnds.toLocaleDateString("pt-BR")}</Badge> : null}
        </header>
        {isTrialing && trialEnds ? <p className="mt-5 rounded-md border border-cyan-900 bg-cyan-950/30 p-4 text-sm text-cyan-100" data-testid="subscription-trial-policy">Seu período de teste termina em {trialEnds.toLocaleDateString("pt-BR")}. Escolher outro plano não reinicia nem prolonga o teste. Após essa data, selecione um plano para contratar; somente o Super Admin pode conceder dias adicionais.</p> : null}
        {pendingPayment ? <p className="mt-5 rounded-md border border-amber-900 bg-amber-950/30 p-4 text-sm text-amber-200" data-testid="subscription-pending-payment">{paymentOverdue ? `Há uma cobrança anterior do Asaas em atraso. O acesso permanece disponível até ${graceUntil || "o fim do prazo de tolerância"}; regularize para evitar a suspensão.` : pagbankLinkStarted ? "Sua tentativa de assinatura PagBank foi iniciada. O acesso será liberado após a conferência manual do pagamento; não inicie outra assinatura enquanto aguarda." : "Seu teste terminou. Escolha um plano e continue pelo link recorrente PagBank. A cobrança recorrente exige cartão de crédito e o acesso será liberado após a confirmação manual do pagamento."}{subscription?.pending_plan_change_locked ? " Já existe uma assinatura iniciada para este plano; para alterá-lo, contate o suporte." : ""}</p> : null}
        {plansLoading ? <p className="mt-6 text-sm text-slate-400">Carregando planos…</p> : plans.length ? <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => {
            const selected = subscription?.plan_id === plan.id;
            return <Card key={plan.id} className={`border-[#283443] bg-[#111820] ${selected ? "ring-1 ring-cyan-700" : ""}`} data-testid={`subscription-plan-${plan.id}`}>
              <CardHeader><div className="flex items-start justify-between gap-3"><CardTitle className="font-heading text-lg">{plan.name}</CardTitle>{selected ? <Badge variant="outline" className="border-cyan-900 text-cyan-300">Selecionado</Badge> : null}</div><p className="pt-2 text-sm leading-6 text-slate-400">{PLAN_DESCRIPTIONS[plan.id] || "Organize a rotina da sua clínica com os recursos deste plano."}</p><p className="pt-2 font-mono text-2xl">{brl(plan.price)}<span className="font-sans text-xs text-slate-500"> / mês</span></p></CardHeader>
              <CardContent className="space-y-4"><ul className="space-y-2">{(plan.features || []).map((feature) => <li key={feature} className="flex gap-2 text-sm text-slate-300"><Check className="size-4 shrink-0 text-emerald-400" />{feature}</li>)}<li className="flex gap-2 text-sm text-slate-400"><Check className="size-4 shrink-0 text-emerald-400" />Até {plan.max_users} usuários</li><li className="flex gap-2 text-sm text-slate-400"><Check className="size-4 shrink-0 text-emerald-400" />Até {plan.max_patients} pacientes</li></ul>
                <Button
                  className="w-full"
                  variant={selected || paidActive ? "outline" : "default"}
                  disabled={selectPlan.isPending || checkout.isPending || (selected && (!pendingPayment || pagbankLinkStarted)) || (subscription?.pending_plan_change_locked && !selected) || paidActive}
                  onClick={() => {
                    if (pendingPayment && selected) {
                      checkout.mutate(plan.id);
                    } else {
                      selectPlan.mutate(plan.id);
                    }
                  }}
                  data-testid={`select-plan-${plan.id}`}
                >
                  {checkout.isPending ? "Abrindo PagBank…" : pendingPayment && selected && pagbankLinkStarted ? "Aguardando confirmação" : pendingPayment && selected ? "Continuar para PagBank" : selected && isTrialing ? "Plano em teste" : selected ? "Plano atual" : paidActive ? "Plano ativo" : selectPlan.isPending ? "Salvando…" : isTrialing ? "Escolher para depois do teste" : "Selecionar plano"}
                </Button>
              </CardContent>
            </Card>;
          })}
        </div> : <p className="mt-6 text-sm text-slate-400">Nenhum plano está disponível no momento.</p>}
      </div>
    </main>
  );
}
