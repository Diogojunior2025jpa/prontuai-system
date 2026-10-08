import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LockKeyhole, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPut } from "@/lib/api";

const PROVIDERS = [
  { id: "groq", label: "Voz NEXO", detail: "Transcrição de áudio do prontuário" },
  { id: "gemini", label: "NEXO", detail: "Rascunhos clínicos e relatórios agregados" },
];

export default function ApiKeySettingsPanel() {
  const queryClient = useQueryClient();
  const [keys, setKeys] = useState({ groq: "", gemini: "" });
  const { data: status, isLoading, isError } = useQuery({
    queryKey: ["admin", "api-keys"], queryFn: () => apiGet("/admin/api-keys/status"), retry: false,
  });
  const save = useMutation({
    mutationFn: ({ provider, apiKey }) => apiPut(`/admin/api-keys/${provider}`, { api_key: apiKey }),
    onSuccess: (_data, variables) => {
      setKeys((current) => ({ ...current, [variables.provider]: "" }));
      queryClient.invalidateQueries({ queryKey: ["admin", "api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "system-monitor"] });
    },
  });

  function submit(event, provider) {
    event.preventDefault();
    const apiKey = keys[provider].trim();
    if (apiKey) save.mutate({ provider, apiKey });
  }

  return (
    <Card className="border-[#293748] bg-[#111820]" data-testid="api-key-settings-panel">
      <CardHeader className="border-b border-[#293748]">
        <div className="flex items-start gap-3">
          <div className="rounded-md border border-sky-900 bg-sky-950/50 p-2 text-sky-300"><KeyRound className="size-4" /></div>
          <div>
            <CardTitle className="font-heading text-base">Chaves de IA</CardTitle>
            <p className="mt-1 text-xs text-slate-500">Configure as integrações usadas pelo sistema</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="flex gap-2 border-l-2 border-sky-700 pl-3 text-xs leading-5 text-slate-400">
          <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-sky-400" />
          <p>O valor nunca é exibido novamente e é armazenado cifrado no MongoDB. Em produção, use HTTPS.</p>
        </div>

        {isError ? <p className="text-sm text-amber-300" role="alert">Não foi possível carregar o status das chaves.</p> : null}

        <div className="grid gap-5 md:grid-cols-2">
          {PROVIDERS.map((provider) => {
            const providerStatus = status?.providers?.[provider.id];
            const sourceLabel = providerStatus?.source === "vault"
              ? "Configurada no cofre"
              : providerStatus?.source === "environment"
                ? "Configurada no ambiente"
                : providerStatus?.source === "vault_unavailable"
                  ? "Cofre indisponível"
                : "Não configurada";
            return (
              <form key={provider.id} className="space-y-3" onSubmit={(event) => submit(event, provider.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Label htmlFor={`api-key-${provider.id}`}>{provider.label}</Label>
                    <p className="mt-1 text-xs text-slate-500">{provider.detail}</p>
                  </div>
                  <span className={`shrink-0 text-xs ${providerStatus?.configured ? "text-emerald-400" : "text-amber-400"}`}>
                    {isLoading ? "Verificando…" : sourceLabel}
                  </span>
                </div>
                <Input
                  id={`api-key-${provider.id}`}
                  type="password"
                  autoComplete="new-password"
                  value={keys[provider.id]}
                  onChange={(event) => setKeys((current) => ({ ...current, [provider.id]: event.target.value }))}
                  placeholder={providerStatus?.configured ? "Digite para substituir a chave atual" : "Cole a nova chave de API"}
                  maxLength={512}
                  minLength={8}
                  required
                  data-testid={`api-key-input-${provider.id}`}
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={!keys[provider.id]?.trim() || save.isPending}
                  data-testid={`api-key-save-${provider.id}`}
                >
                  <Save className="size-4" /> Salvar chave {provider.label}
                </Button>
              </form>
            );
          })}
        </div>
        {save.isError ? (
          <p className="rounded-md border border-amber-900/70 bg-amber-950/20 p-3 text-sm text-amber-300" role="alert" data-testid="api-key-save-error">
            {save.error?.body?.detail || "Não foi possível salvar a chave."}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
