import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowDown,
  ArrowUpRight,
  CalendarDays,
  Check,
  FileText,
  Mic2,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { buttonVariants } from "@/components/ui/button";
import { PLAN_DESCRIPTIONS, brl } from "@/lib/session";

const WORKFLOW = [
  { icon: CalendarDays, label: "Agenda organizada" },
  { icon: FileText, label: "Prontuário no ritmo da consulta" },
  { icon: Mic2, label: "Voz com apoio de IA" },
];

function ProductPreview() {
  return (
    <div className="home-float relative mx-auto w-full max-w-lg" aria-label="Prévia ilustrativa do painel ProntuAI">
      <div className="home-orbit home-orbit-one" />
      <div className="home-orbit home-orbit-two" />
      <div className="home-preview-card relative rounded-2xl border border-violet-300/20 bg-[#100d1d]/90 p-5 shadow-2xl shadow-violet-950/40 backdrop-blur-xl sm:p-7">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
              <Activity className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">ProntuAI</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-violet-200/50">Sua clínica, em foco</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-300" />
            Tudo conectado
          </span>
        </div>

        <div className="mt-6 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-slate-400">O essencial da rotina</p>
            <h2 className="mt-1 font-heading text-2xl font-semibold tracking-tight text-white">Mais clareza. Menos correria.</h2>
          </div>
          <Sparkles className="mb-1 size-5 shrink-0 text-violet-300" />
        </div>

        <div className="mt-6 space-y-3">
          {WORKFLOW.map(({ icon: Icon, label }, index) => (
            <div
              key={label}
              className="home-preview-row flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.035] p-3.5"
              style={{ animationDelay: `${index * 160}ms` }}
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-violet-400/10 text-violet-200">
                <Icon className="size-4" />
              </span>
              <span className="flex-1 text-sm text-slate-200">{label}</span>
              <Check className="size-4 text-violet-300" />
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500/15 to-fuchsia-500/10 px-4 py-3 text-xs text-violet-100/80">
          <span className="home-wave flex h-4 items-center gap-0.5" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => <i key={index} style={{ animationDelay: `${index * 100}ms` }} />)}
          </span>
          Uma rotina mais leve começa com espaço para cuidar.
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { data: plans = [], isLoading: plansLoading, isError: plansError } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => apiGet("/auth/plans"),
    retry: false,
  });

  return (
    <div className="home-page min-h-screen overflow-hidden bg-[#090711] text-white">
      <div className="home-grid home-ambient" aria-hidden="true" />
      <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#090711]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5" aria-label="ProntuAI, início">
            <span className="flex size-9 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-500/10 text-violet-300 shadow-lg shadow-violet-900/20">
              <Activity className="size-5" />
            </span>
            <span className="font-heading text-lg font-semibold tracking-tight">Prontu<span className="text-violet-300">AI</span></span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Navegação principal">
            <a href="#planos" className="hidden rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:text-white sm:inline-flex">Planos</a>
            <Link to="/portal/login" className="hidden rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:text-white md:inline-flex" data-testid="home-portal-link">
              Área do paciente
            </Link>
            <Link to="/login" className={buttonVariants({ variant: "ghost", size: "sm" })} data-testid="home-login-link">
              Entrar
            </Link>
            <Link to="/cadastro" className="hidden rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#171020] transition hover:bg-violet-100 sm:inline-flex" data-testid="home-header-cta">
              Começar agora
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative">
        <section className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <div className="home-reveal relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/[0.07] px-3.5 py-2 text-[11px] font-medium tracking-wide text-violet-200">
              <Sparkles className="size-3.5" />
              TECNOLOGIA QUE ABRE ESPAÇO PARA CUIDAR
            </div>
            <h1 className="mt-7 max-w-2xl font-heading text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-white sm:text-5xl lg:text-[4.25rem]">
              Sua clínica em ordem.
              <span className="home-title-glow block">O cuidado em primeiro lugar.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
              Agenda, prontuário e inteligência em uma plataforma pensada para a rotina real da sua clínica.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/cadastro" className="home-primary-cta inline-flex h-12 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5" data-testid="home-cta-primary">
                Encontre seu plano <ArrowUpRight className="size-4" />
              </Link>
              <a href="#planos" className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/10 px-5 text-sm font-medium text-slate-200 transition hover:border-violet-300/35 hover:bg-white/[0.04]" data-testid="home-cta-secondary">
                Ver planos <ArrowDown className="size-4 text-violet-300" />
              </a>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs text-slate-400">
              {["Menos tarefas dispersas", "Mais tempo para atender", "Sua equipe no mesmo fluxo"].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <Check className="size-3.5 text-violet-300" /> {item}
                </span>
              ))}
            </div>
          </div>
          <div className="home-reveal relative lg:pl-4" style={{ animationDelay: "180ms" }}>
            <ProductPreview />
          </div>
        </section>

        <section id="planos" className="relative scroll-mt-24 border-t border-white/[0.07] bg-[#0d0a17]/80 px-5 py-20 sm:px-8 sm:py-24">
          <div className="home-plan-glow" aria-hidden="true" />
          <div className="relative mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="overline text-violet-300">Planos para sua rotina</p>
              <h2 className="mt-4 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Escolha o próximo passo.</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400 sm:text-base">Comece pelo que sua clínica precisa hoje. Evolua no seu ritmo.</p>
            </div>

            {plansLoading ? <p className="mt-10 text-center text-sm text-slate-400">Carregando planos…</p> : null}
            {plansError ? <p className="mt-10 text-center text-sm text-rose-300">Não foi possível carregar os planos agora. Tente novamente em instantes.</p> : null}
            {!plansLoading && !plansError && plans.length === 0 ? <p className="mt-10 text-center text-sm text-slate-400">Nenhum plano está disponível no momento.</p> : null}
            {plans.length > 0 ? (
              <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {plans.map((plan, index) => (
                  <article
                    key={plan.id}
                    className={`home-plan-card relative flex flex-col rounded-2xl border p-6 sm:p-7 ${index === 1 ? "border-violet-400/45 bg-violet-950/25 shadow-xl shadow-violet-950/20" : "border-white/[0.09] bg-white/[0.025]"}`}
                    data-testid={`home-plan-${plan.id}`}
                  >
                    <h3 className="font-heading text-xl font-semibold text-white">{plan.name}</h3>
                    <p className="mt-3 min-h-[3rem] text-sm leading-6 text-slate-300">
                      {PLAN_DESCRIPTIONS[plan.id] || "Organize a rotina da sua clínica com os recursos deste plano."}
                    </p>
                    <p className="mt-6 font-heading text-3xl font-semibold tracking-tight text-white">
                      {brl(plan.price)}<span className="ml-1 text-sm font-normal text-slate-400">/mês</span>
                    </p>
                    <ul className="mt-6 flex-1 space-y-3 border-t border-white/[0.08] pt-5">
                      {(plan.features || []).map((feature) => (
                        <li key={feature} className="flex gap-2.5 text-sm text-slate-300">
                          <Check className="size-4 shrink-0 text-violet-300" /> {feature}
                        </li>
                      ))}
                      <li className="flex gap-2.5 text-sm text-slate-400"><Check className="size-4 shrink-0 text-violet-300" /> Até {plan.max_users} usuários</li>
                      <li className="flex gap-2.5 text-sm text-slate-400"><Check className="size-4 shrink-0 text-violet-300" /> Até {plan.max_patients.toLocaleString("pt-BR")} pacientes</li>
                    </ul>
                    <Link
                      to="/cadastro"
                      className={`mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${index === 1 ? "home-primary-cta text-white hover:-translate-y-0.5" : "border border-white/10 text-slate-100 hover:border-violet-300/40 hover:bg-white/[0.04]"}`}
                      data-testid={`home-plan-cta-${plan.id}`}
                    >
                      Começar agora <ArrowUpRight className="size-4" />
                    </Link>
                  </article>
                ))}
              </div>
            ) : null}
            <p className="mt-6 text-center text-xs text-slate-500">Crie sua conta para iniciar. Os recursos e limites de cada plano estão listados acima.</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.07] px-5 py-7 text-center text-xs text-slate-500 sm:px-8">
        ProntuAI · Tecnologia para uma rotina clínica mais leve.
      </footer>
    </div>
  );
}
