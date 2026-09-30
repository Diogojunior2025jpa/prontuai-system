import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, MessageCircle, Send, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ptDate } from "@/lib/session";

const CHANNELS = { whatsapp: "WhatsApp", email: "E-mail", push: "Push" };
const AUDIENCES = { all: "Todos os pacientes", birthdays: "Aniversariantes do mês", inactive: "Inativos (6+ meses)" };
const CHANNEL_ICON = { whatsapp: MessageCircle, email: Mail, push: Smartphone };

const TEMPLATES = [
  { name: "Retorno semestral", message: "Olá {nome}! Já faz 6 meses desde sua última consulta. Que tal agendar seu retorno?" },
  { name: "Aniversariantes", message: "Feliz aniversário, {nome}! 🎉 Como presente, você tem 20% off na sua próxima avaliação." },
  { name: "Reativação", message: "Oi {nome}, sentimos sua falta! Agende uma avaliação sem custo esta semana." },
];

export default function Campaigns() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", channel: "whatsapp", audience: "all", message: "" });

  const { data, isError } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => apiGet("/clinic/campaigns"),
    retry: false,
  });
  const campaigns = isError ? [] : data || [];

  const send = useMutation({
    mutationFn: (body) => apiPost("/clinic/campaigns", body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setForm({ name: "", channel: "whatsapp", audience: "all", message: "" });
      toast.success(`Campanha disparada para ${res.recipients} paciente(s) — envio SIMULADO`);
    },
    onError: (e) => toast.error(e?.body?.detail || "Falha ao disparar campanha"),
  });

  return (
    <AppShell title="Marketing" subtitle="Disparos em massa para a base desta clínica (envio simulado)">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="border-[#1F2937] bg-[#111827]">
          <CardHeader>
            <CardTitle className="font-heading text-base">Nova campanha</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); send.mutate(form); }}
              data-testid="campaign-form"
            >
              <div className="space-y-1.5">
                <Label htmlFor="c-name">Nome da campanha</Label>
                <Input
                  id="c-name" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Retorno semestral Odonto" required data-testid="campaign-name-input"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Canal</Label>
                  <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v }))}>
                    <SelectTrigger data-testid="campaign-type-select">
                      <SelectValue>{(v) => CHANNELS[v] || "Canal"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CHANNELS).map(([v, l]) => (
                        <SelectItem key={v} value={v} data-testid={`campaign-channel-option-${v}`}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Público</Label>
                  <Select value={form.audience} onValueChange={(v) => setForm((f) => ({ ...f, audience: v }))}>
                    <SelectTrigger data-testid="target-audience-filter">
                      <SelectValue>{(v) => AUDIENCES[v] || "Público"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(AUDIENCES).map(([v, l]) => (
                        <SelectItem key={v} value={v} data-testid={`campaign-audience-option-${v}`}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="c-msg">Mensagem</Label>
                <Textarea
                  id="c-msg" rows={5} value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  placeholder="Use {nome} para personalizar" required data-testid="campaign-message-textarea"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.name} type="button"
                      onClick={() => setForm((f) => ({ ...f, name: f.name || t.name, message: t.message }))}
                      className="text-[11px] rounded-full border border-[#1F2937] px-2.5 py-1 text-slate-400 hover:border-indigo-700 hover:text-indigo-300 transition-colors duration-150"
                      data-testid={`campaign-template-${t.name.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              <Button type="submit" disabled={send.isPending} data-testid="launch-campaign-btn">
                <Send className="size-4" />
                {send.isPending ? "Disparando…" : "Disparar campanha"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-[#1F2937] bg-[#111827]">
          <CardHeader>
            <CardTitle className="font-heading text-base">Prévia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-[#1F2937] bg-[#0B0F17] p-4 min-h-40">
              <p className="overline text-cyan-400 mb-3">{CHANNELS[form.channel]}</p>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-[#064E3B]/40 border border-emerald-900/60 px-3.5 py-2.5">
                <p className="text-sm text-slate-100 whitespace-pre-wrap" data-testid="campaign-preview">
                  {(form.message || "Sua mensagem aparecerá aqui…").replaceAll("{nome}", "Marcos")}
                </p>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                Público: {AUDIENCES[form.audience]} · Envio <strong className="text-amber-400">SIMULADO</strong>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-[#1F2937] bg-[#111827]">
        <div className="px-5 pt-5">
          <h2 className="font-heading text-base font-semibold">Histórico de disparos</h2>
        </div>
        {campaigns.length === 0 ? (
          <p className="p-5 text-sm text-slate-500" data-testid="campaigns-empty">Nenhuma campanha disparada ainda.</p>
        ) : (
          <Table className="min-w-[620px]" data-testid="campaigns-history-table">
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Público</TableHead>
                <TableHead>Destinatários</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => {
                const Icon = CHANNEL_ICON[c.channel] || MessageCircle;
                return (
                  <TableRow key={c.id} data-testid={`campaign-row-${c.id}`}>
                    <TableCell className="font-medium text-slate-100">{c.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-slate-400 text-xs">
                        <Icon className="size-3.5" /> {CHANNELS[c.channel]}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-400 text-xs">{AUDIENCES[c.audience]}</TableCell>
                    <TableCell>
                      <Badge className="bg-[#312E81] text-indigo-300 font-mono" data-testid={`campaign-recipients-${c.id}`}>
                        {c.recipients}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">
                      {ptDate(String(c.created_at).slice(0, 10))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </AppShell>
  );
}
