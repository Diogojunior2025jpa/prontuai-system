import { Link } from "react-router-dom";
import { Activity, Mic, Megaphone, ShieldCheck, Sparkles, Stethoscope } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Isolamento total por clínica",
    body: "Dados totalmente isolados e seguros entre diferentes clínicas, garantindo privacidade absoluta e conformidade.",
  },
  {
    icon: Mic,
    title: "Prontuário ditado por voz",
    body: "O profissional fala, o Whisper transcreve e a IA estrutura queixa, exame, diagnóstico e conduta nos campos certos.",
  },
  {
    icon: Stethoscope,
    title: "Fichas por especialidade",
    body: "Clínica geral em SOAP, odontograma interativo de 32 dentes e acuidade visual Snellen para oftalmologia.",
  },
  {
    icon: Sparkles,
    title: "Permissões granulares",
    body: "O admin libera agenda e prontuário para o dentista e bloqueia o financeiro — checkbox por checkbox.",
  },
  {
    icon: Megaphone,
    title: "Campanhas em massa",
    body: "Retorno semestral, aniversariantes ou reativação de inativos por WhatsApp, e-mail ou push.",
  },
  {
    icon: Activity,
    title: "Painel do Super Admin",
    body: "Gerenciamento completo da equipe, controle de acessos, médicos e atendentes em um só lugar.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="h-16 flex items-center justify-between px-6 border-b border-[#1E293B] bg-[#070B11]">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-indigo-400" />
          <span className="font-heading text-lg font-semibold tracking-tight">ProntuAI</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link to="/portal/login" className={buttonVariants({ variant: "ghost", size: "sm" })} data-testid="home-portal-link">
            Portal do Paciente
          </Link>
          <Link to="/login" className={buttonVariants({ variant: "default", size: "sm" })} data-testid="home-login-link">
            Entrar
          </Link>
        </nav>
      </header>

      <main>
        <section className="px-6 py-20 max-w-5xl">
          <p className="overline text-cyan-400">SaaS multi-tenant para clínicas</p>
          <h1 className="mt-5 font-heading text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.1] max-w-3xl">
            A gestão clínica que some do caminho do atendimento.
          </h1>
          <p className="mt-6 text-lg text-slate-400 max-w-2xl leading-relaxed">
            Agenda, pacientes, prontuário inteligente por voz e marketing — com isolamento
            rigoroso de dados entre clínicas e permissões definidas por você.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/login" className={buttonVariants({ variant: "default", size: "lg" })} data-testid="home-cta-primary">
              Acessar o painel
            </Link>
            <Link to="/portal/login" className={buttonVariants({ variant: "outline", size: "lg" })} data-testid="home-cta-secondary">
              Sou paciente
            </Link>
          </div>
        </section>

        <section className="px-6 pb-20">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 max-w-6xl">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-lg border border-[#1F2937] bg-[#111827] p-6 hover:border-[#374151] transition-colors duration-200"
                data-testid={`home-feature-${f.title.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")}`}
              >
                <f.icon className="size-5 text-indigo-400" />
                <h2 className="mt-4 font-heading text-base font-semibold tracking-tight">{f.title}</h2>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="px-6 py-8 border-t border-[#1E293B] text-xs text-slate-600">
        ProntuAI · Prontuário eletrônico multi-tenant com IA
      </footer>
    </div>
  );
}
