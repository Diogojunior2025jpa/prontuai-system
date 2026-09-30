import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Radio, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { ptDate } from "@/lib/session";

export default function GlobalNoticePanel() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const { data: notices = [] } = useQuery({
    queryKey: ["admin", "notices"], queryFn: () => apiGet("/admin/notices"), retry: false,
  });

  const publish = useMutation({
    mutationFn: (body) => apiPost("/admin/notices", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "notices"] });
      setTitle("");
      setMessage("");
      toast.success("Aviso publicado para os administradores das clínicas");
    },
    onError: (error) => toast.error(error?.body?.detail || "Não foi possível publicar o aviso"),
  });
  const deactivate = useMutation({
    mutationFn: (id) => apiPatch(`/admin/notices/${id}`, { active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "notices"] });
      toast.success("Aviso encerrado");
    },
    onError: (error) => toast.error(error?.body?.detail || "Não foi possível encerrar o aviso"),
  });

  function submit(event) {
    event.preventDefault();
    publish.mutate({ title: title.trim(), message: message.trim() });
  }

  return (
    <Card className="border-[#263B3C] bg-[#101A1B]" data-testid="global-notice-panel">
      <CardHeader className="border-b border-[#263B3C]">
        <div className="flex items-start gap-3">
          <div className="rounded-md border border-teal-900 bg-teal-950/60 p-2 text-teal-300"><Radio className="size-4" /></div>
          <div>
            <CardTitle className="font-heading text-base">Aviso global</CardTitle>
            <p className="mt-1 text-xs text-slate-500">Broadcast para administradores das clínicas</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="notice-title">Assunto</Label>
            <Input id="notice-title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} required data-testid="notice-title-input" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notice-message">Mensagem de manutenção</Label>
            <Textarea id="notice-message" value={message} maxLength={2000} rows={4} onChange={(event) => setMessage(event.target.value)} required data-testid="notice-message-input" />
            <p className="text-right font-mono text-[11px] text-slate-600">{message.length}/2000</p>
          </div>
          <Button type="submit" disabled={publish.isPending || !title.trim() || !message.trim()} data-testid="notice-publish-button">
            <Megaphone className="size-4" /> {publish.isPending ? "Publicando…" : "Publicar aviso"}
          </Button>
        </form>

        <div className="border-t border-[#263B3C] pt-4">
          <h3 className="mb-3 text-xs font-semibold uppercase text-slate-500">Avisos recentes</h3>
          {notices.length === 0 ? <p className="text-sm text-slate-500">Nenhum aviso publicado.</p> : (
            <ul className="divide-y divide-[#263B3C]">
              {notices.slice(0, 5).map((notice) => (
                <li key={notice.id} className="flex items-start justify-between gap-3 py-3" data-testid={`notice-history-${notice.id}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-200">{notice.title}</p>
                      <Badge variant="outline" className={notice.active ? "border-teal-900 text-teal-300" : "border-slate-700 text-slate-500"}>
                        {notice.active ? "Ativo" : "Encerrado"}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-slate-400">{notice.message}</p>
                    <p className="mt-1 text-[11px] text-slate-600">{notice.created_by} · {ptDate(String(notice.created_at).slice(0, 10))}</p>
                  </div>
                  {notice.active ? (
                    <Button
                      type="button" variant="ghost" size="icon" title="Encerrar aviso" aria-label={`Encerrar aviso ${notice.title}`}
                      onClick={() => deactivate.mutate(notice.id)} disabled={deactivate.isPending}
                      data-testid={`notice-deactivate-${notice.id}`}
                    >
                      <XCircle className="size-4" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}