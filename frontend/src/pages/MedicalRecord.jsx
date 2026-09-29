import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import AppShell, { useMe } from "@/components/AppShell";
import VoiceDictationHUD from "@/components/clinical/VoiceDictationHUD";
import OdontogramView from "@/components/clinical/OdontogramView";
import VisualAcuityView from "@/components/clinical/VisualAcuityView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasPerm, ptDate } from "@/lib/session";

const TEMPLATE_FIELDS = {
  geral: [
    ["queixa_principal", "Queixa principal", "textarea"],
    ["historia", "História da moléstia atual", "textarea"],
    ["exame_fisico", "Exame físico", "textarea"],
    ["diagnostico", "Hipótese diagnóstica", "input"],
    ["conduta", "Conduta / prescrição", "textarea"],
  ],
  odonto: [
    ["queixa_principal", "Queixa principal", "textarea"],
    ["dentes_afetados", "Dentes afetados (FDI)", "input"],
    ["exame_clinico", "Exame clínico bucal", "textarea"],
    ["diagnostico", "Diagnóstico", "input"],
    ["plano_tratamento", "Plano de tratamento", "textarea"],
  ],
  oftalmo: [
    ["queixa_principal", "Queixa principal", "textarea"],
    ["diagnostico", "Diagnóstico", "input"],
    ["conduta", "Conduta / prescrição", "textarea"],
  ],
};

const TEMPLATE_LABELS = { geral: "Clínica Geral", odonto: "Odontologia", oftalmo: "Oftalmologia" };

export default function MedicalRecord() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const canEdit = hasPerm(me?.user, "records.edit");
  const specialty = me?.tenant?.specialty || "geral";

  const [template, setTemplate] = useState(specialty);
  const [patientId, setPatientId] = useState("");
  const [fields, setFields] = useState({});
  const [odontogram, setOdontogram] = useState({});
  const [transcript, setTranscript] = useState("");

  const { data: patients } = useQuery({
    queryKey: ["patients"],
    queryFn: () => apiGet("/clinic/patients"),
    retry: false,
  });
  const { data: records, isError } = useQuery({
    queryKey: ["records", patientId],
    queryFn: () => apiGet(patientId ? `/clinic/records?patient_id=${patientId}` : "/clinic/records"),
    retry: false,
  });

  const patientList = patients || [];
  const patientLabels = useMemo(
    () => Object.fromEntries(patientList.map((p) => [p.id, p.name])),
    [patientList],
  );
  const history = isError ? [] : records || [];

  const save = useMutation({
    mutationFn: (body) => apiPost("/clinic/records", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["records"] });
      qc.invalidateQueries({ queryKey: ["clinic", "overview"] });
      setFields({});
      setOdontogram({});
      setTranscript("");
      toast.success("Prontuário salvo");
    },
    onError: (e) => toast.error(e?.body?.detail || "Falha ao salvar prontuário"),
  });

  const setField = (k, v) => setFields((f) => ({ ...f, [k]: v }));

  function applyAiFields(aiFields) {
    setFields((f) => ({ ...f, ...aiFields }));
  }

  function submit(e) {
    e.preventDefault();
    if (!patientId) {
      toast.error("Selecione um paciente");
      return;
    }
    const payload = {
      patient_id: patientId,
      template,
      transcript,
      fields: template === "odonto" ? { ...fields, odontograma: odontogram } : fields,
    };
    save.mutate(payload);
  }

  return (
    <AppShell
      title="Prontuário Inteligente"
      subtitle="Dite o atendimento e a IA estrutura os campos por especialidade"
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6 min-w-0">
          <Card className="border-[#1F2937] bg-[#111827]">
            <CardHeader>
              <CardTitle className="font-heading text-base">Atendimento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Paciente</Label>
                  <Select value={patientId} onValueChange={setPatientId}>
                    <SelectTrigger data-testid="record-patient-select">
                      <SelectValue placeholder="Selecione o paciente">
                        {(v) => patientLabels[v] || "Selecione o paciente"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {patientList.map((p) => (
                        <SelectItem key={p.id} value={p.id} data-testid={`record-patient-option-${p.id}`}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Especialidade do prontuário</Label>
                  <Select value={template} onValueChange={setTemplate}>
                    <SelectTrigger data-testid="record-template-select">
                      <SelectValue>{(v) => TEMPLATE_LABELS[v] || "Modelo"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TEMPLATE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v} data-testid={`record-template-option-${v}`}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {canEdit ? (
                <VoiceDictationHUD
                  template={template}
                  onFields={(f) => { applyAiFields(f); setTranscript((t) => t || ""); }}
                />
              ) : (
                <p className="text-sm text-amber-400" data-testid="records-readonly-warning">
                  Você tem permissão somente de leitura de prontuários.
                </p>
              )}
            </CardContent>
          </Card>

          <Tabs value={template} onValueChange={setTemplate}>
            <TabsList variant="line" data-testid="record-template-tabs">
              <TabsTrigger value="geral" data-testid="tab-geral">Clínica Geral</TabsTrigger>
              <TabsTrigger value="odonto" data-testid="tab-odonto">Odontologia</TabsTrigger>
              <TabsTrigger value="oftalmo" data-testid="tab-oftalmo">Oftalmologia</TabsTrigger>
            </TabsList>

            {Object.keys(TEMPLATE_LABELS).map((t) => (
              <TabsContent key={t} value={t} className="mt-4">
                <form onSubmit={submit} className="space-y-4" data-testid={`record-form-${t}`}>
                  {t === "oftalmo" ? (
                    <VisualAcuityView fields={fields} onField={setField} />
                  ) : null}

                  <Card className="border-[#1F2937] bg-[#111827]">
                    <CardContent className="space-y-4 pt-6">
                      {(TEMPLATE_FIELDS[t] || []).map(([key, label, kind]) => (
                        <div key={key} className="space-y-1.5">
                          <Label htmlFor={`${t}-${key}`}>{label}</Label>
                          {kind === "textarea" ? (
                            <Textarea
                              id={`${t}-${key}`}
                              rows={3}
                              value={fields[key] || ""}
                              onChange={(e) => setField(key, e.target.value)}
                              disabled={!canEdit}
                              data-testid={`record-field-${key}`}
                            />
                          ) : (
                            <Input
                              id={`${t}-${key}`}
                              value={fields[key] || ""}
                              onChange={(e) => setField(key, e.target.value)}
                              disabled={!canEdit}
                              data-testid={`record-field-${key}`}
                            />
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {t === "odonto" ? (
                    <OdontogramView
                      value={odontogram}
                      onChange={setOdontogram}
                      affected={fields.dentes_afetados}
                    />
                  ) : null}

                  {canEdit ? (
                    <Button type="submit" disabled={save.isPending} data-testid="record-save-button">
                      <Save className="size-4" />
                      {save.isPending ? "Salvando…" : "Salvar prontuário"}
                    </Button>
                  ) : null}
                </form>
              </TabsContent>
            ))}
          </Tabs>
        </div>

        <Card className="border-[#1F2937] bg-[#111827] h-fit">
          <CardHeader>
            <CardTitle className="font-heading text-base">Histórico clínico</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500" data-testid="records-history-empty">
                Nenhum prontuário registrado.
              </p>
            ) : (
              <ul className="space-y-3" data-testid="records-history-list">
                {history.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-md border border-[#1F2937] bg-[#161F30] p-3"
                    data-testid={`record-history-${r.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge className="bg-[#312E81] text-indigo-300">{TEMPLATE_LABELS[r.template]}</Badge>
                      <span className="font-mono text-[11px] text-slate-500">
                        {ptDate(String(r.created_at).slice(0, 10))}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-200 line-clamp-3">
                      {r.fields?.queixa_principal || r.fields?.diagnostico || "Sem resumo"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">{r.author_name || "—"}</p>
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
