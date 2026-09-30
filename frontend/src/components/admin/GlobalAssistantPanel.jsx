import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Activity, Bot, FileText, LockKeyhole, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost } from "@/lib/api";

export default function GlobalAssistantPanel() {
  const [question, setQuestion] = useState("");
  const { data: monitor } = useQuery({
    queryKey: ["admin", "system-monitor"], queryFn: () => apiGet("/admin/system-monitor"), refetchInterval: 30_000, retry: false,
  });
  const ask = useMutation({ mutationFn: (value) => apiPost("/assistant/global-ask", { question: value }) });

  function submit(event) {
    event.preventDefault();
    if (question.trim()) ask.mutate(question.trim());
  }

  return (
    <Card className="border-[#283443] bg-[#111820]" data-testid="global-assistant-panel">
      <CardHeader className="border-b border-[#283443]">
        <div className="flex items-start gap-3">
          <div className="rounded-md border border-sky-900 bg-sky-950/50 p-2 text-sky-300"><Bot className="size-4" /></div>
          <div>
            <CardTitle className="font-heading text-base">Assistente global</CardTitle>
            <p className="mt-1 text-xs text-slate-500">Consultas e resumos da plataforma</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <section className="grid gap-2 sm:grid-cols-2" data-testid="system-monitor-status">
          {[
            ["API", monitor?.api === "online"],
            ["MongoDB", monitor?.database === "online"],
            ["Groq · transcrição", monitor?.providers?.groq],
            ["Gemini · relatórios", monitor?.providers?.gemini],
          ].map(([label, ready]) => (
            <div key={label} className="flex items-center justify-between gap-2 border-b border-[#283443] py-2 text-xs">
              <span className="text-slate-400">{label}</span>
              <span className={ready ? "text-emerald-400" : "text-amber-400"}>
                <Activity className="mr-1 inline size-3" />{monitor ? (ready ? "Disponível" : "Indisponível") : "Verificando…"}
              </span>
            </div>
          ))}
        </section>
        {monitor?.metrics ? (
          <p className="font-mono text-[11px] text-slate-500" data-testid="system-monitor-metrics">
            Clínicas {monitor.metrics.clinics_total} · Usuários {monitor.metrics.users_total} · Prontuários {monitor.metrics.records_total} · Verificado {new Date(monitor.generated_at).toLocaleTimeString("pt-BR")}
          </p>
        ) : null}
        <div className="flex gap-2 border-l-2 border-sky-700 pl-3 text-xs leading-5 text-slate-400">
          <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-sky-400" />
          <p>Gemini recebe apenas estado dos serviços e contagens agregadas. Não compartilhe dados clínicos ou pessoais; a IA recomenda ações, mas não altera o sistema.</p>
        </div>
        <form className="space-y-3" onSubmit={submit}>
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Ex.: Resuma a saúde atual dos serviços e métricas globais."
            aria-label="Pergunta ao assistente global"
            data-testid="global-assistant-question"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-600">Indicadores globais, sem dados clínicos identificáveis</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button" variant="outline"
                disabled={ask.isPending}
                onClick={() => ask.mutate("Gere um relatório de monitoramento da saúde dos serviços e das métricas globais. Liste alertas e recomendações seguras.")}
                data-testid="global-assistant-report"
              >
                <FileText className="size-4" /> Relatório
              </Button>
              <Button type="submit" disabled={ask.isPending || !question.trim()} data-testid="global-assistant-submit">
                <Send className="size-4" /> {ask.isPending ? "Consultando…" : "Consultar"}
              </Button>
            </div>
          </div>
        </form>
        {ask.isError ? (
          <p className="rounded-md border border-amber-900/70 bg-amber-950/20 p-3 text-sm text-amber-300" role="alert" data-testid="global-assistant-error">
            {ask.error?.body?.detail || "Não foi possível consultar a IA. Verifique a configuração do serviço."}
          </p>
        ) : null}
        {ask.data ? (
          <section className="rounded-md border border-[#283443] bg-[#0B1118] p-4" aria-live="polite" data-testid="global-assistant-answer">
            <p className="mb-2 font-mono text-[11px] uppercase text-sky-400">Resumo · {ask.data.model}</p>
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{ask.data.answer}</p>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}