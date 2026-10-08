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
    ["cid10", "CID-10 sugerido (revisar)", "input"],
    ["conduta", "Conduta / prescrição", "textarea"],
  ],
  odonto: [
    ["queixa_principal", "Queixa principal", "textarea"],
    ["dentes_afetados", "Dentes afetados (FDI)", "input"],
    ["exame_clinico", "Exame clínico bucal", "textarea"],
    ["diagnostico", "Diagnóstico", "input"],
    ["cid10", "CID-10 sugerido (revisar)", "input"],
    ["plano_tratamento", "Plano de tratamento", "textarea"],
  ],
  oftalmo: [
    ["queixa_principal", "Queixa principal", "textarea"],
    ["diagnostico", "Diagnóstico", "input"],
    ["cid10", "CID-10 sugerido (revisar)", "input"],
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
  const [aiDraft, setAiDraft] = useState(null);
  const [draftSourceTranscript, setDraftSourceTranscript] = useState("");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);

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

  const patientList = useMemo(() => patients || [], [patients]);
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
      setAiDraft(null);
      setDraftSourceTranscript("");
      setReviewConfirmed(false);
      toast.success("Prontuário salvo");
    },
    onError: (e) => toast.error(e?.body?.detail || "Falha ao salvar prontuário"),
  });

  const setField = (k, v) => {
    setReviewConfirmed(false);
    setFields((f) => ({ ...f, [k]: v }));
  };

  function applyAiFields(aiFields) {
    setFields((f) => ({ ...f, ...aiFields }));
  }

  function applyAiDraft(aiFields, aiTranscript, draft) {
    const draftFields = draft
      ? {
          ...aiFields,
          prontuario_formatado_nexo: draft.professional_record?.content || "",
          secoes_prontuario_nexo: draft.professional_record?.sections || [],
          rascunhos_ia: draft.actions || [],
          checagens_ia: draft.safety_checks || [],
          revisao_medica_obrigatoria: true,
        }
      : aiFields;
    applyAiFields(draftFields);
    setTranscript(aiTranscript || "");
    setAiDraft(draft || null);
    setDraftSourceTranscript(aiTranscript || "");
    setReviewConfirmed(false);
  }

  function handleTranscriptChange(value) {
    setTranscript(value);
    setReviewConfirmed(false);
  }

  function discardAiDraft() {
    setFields({});
    setOdontogram({});
    setTranscript("");
    setAiDraft(null);
    setDraftSourceTranscript("");
    setReviewConfirmed(false);
  }

  const draftSourceChanged =
    Boolean(aiDraft) && transcript.trim() !== draftSourceTranscript.trim();

  function submit(e) {
    e.preventDefault();
    if (!patientId) {
      toast.error("Selecione um paciente");
      return;
    }
    if (aiDraft && draftSourceChanged) {
      toast.error("O relato mudou. Gere novamente o rascunho do NEXO antes de salvar");
      return;
    }
    if (aiDraft && !reviewConfirmed) {
      toast.error("Revise o rascunho do NEXO e confirme antes de salvar");
      return;
    }
    const payload = {
      patient_id: patientId,
      template,
      transcript,
      fields: {
        ...(template === "odonto" ? { ...fields, odontograma: odontogram } : fields),
        ...(aiDraft
          ? {
              revisao_medica_obrigatoria: true,
              revisao_medica_confirmada: reviewConfirmed,
            }
          : {}),
      },
    };
    save.mutate(payload);
  }

  return (
    <AppShell
      title="Prontuário Inteligente"
      subtitle="Dite o atendimento e o NEXO estrutura os campos por especialidade"
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
                    <SelectTrigger disabled={Boolean(aiDraft)} data-testid="record-patient-select">
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
                    <SelectTrigger disabled={Boolean(aiDraft)} data-testid="record-template-select">
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
                  onFields={applyAiDraft}
                  onTranscriptChange={handleTranscriptChange}
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
              <TabsTrigger value="geral" disabled={Boolean(aiDraft)} data-testid="tab-geral">Clínica Geral</TabsTrigger>
              <TabsTrigger value="odonto" disabled={Boolean(aiDraft)} data-testid="tab-odonto">Odontologia</TabsTrigger>
              <TabsTrigger value="oftalmo" disabled={Boolean(aiDraft)} data-testid="tab-oftalmo">Oftalmologia</TabsTrigger>
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

                  {aiDraft ? (
                    <Card className="border-amber-500/30 bg-amber-950/20" data-testid="clinical-ai-draft-review">
                      <CardHeader>
                        <CardTitle className="font-heading text-base">Rascunho NEXO para revisão médica</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 text-sm">
                        {draftSourceChanged ? (
                          <div className="rounded-md border border-amber-500/30 bg-amber-950/40 p-3 text-amber-100">
                            O relato foi alterado depois da geração. Gere novamente o rascunho para manter
                            os campos e o prontuário sincronizados.
                          </div>
                        ) : null}
                        <dl
                          className="grid gap-x-6 gap-y-3 rounded-md border border-cyan-500/20 bg-[#111827] p-3 sm:grid-cols-2"
                          data-testid="clinical-ai-document-header"
                        >
                          <div>
                            <dt className="text-xs text-slate-400">Clínica</dt>
                            <dd className="font-medium text-slate-100">{me?.tenant?.name || "Não informada"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-400">Paciente</dt>
                            <dd className="font-medium text-slate-100">{patientLabels[patientId] || "Selecione um paciente"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-400">Especialidade</dt>
                            <dd className="font-medium text-slate-100">{TEMPLATE_LABELS[template]}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-400">Profissional responsável</dt>
                            <dd className="font-medium text-slate-100">{me?.user?.name || "Não informado"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-400">Data do rascunho</dt>
                            <dd className="font-medium text-slate-100">{new Date().toLocaleDateString("pt-BR")}</dd>
                          </div>
                        </dl>
                        {aiDraft.professional_record?.content ? (
                          <div className="rounded-md border border-cyan-500/20 bg-[#111827] p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-medium text-cyan-200">
                                {aiDraft.professional_record.title || "Evolução clínica NEXO"}
                              </p>
                              <Badge className="bg-cyan-500/15 text-cyan-200">
                                {aiDraft.professional_record.format || "SOAP"}
                              </Badge>
                            </div>
                            <Textarea
                              rows={10}
                              value={fields.prontuario_formatado_nexo || ""}
                              onChange={(event) => setField("prontuario_formatado_nexo", event.target.value)}
                              disabled={!canEdit}
                              className="mt-3 bg-[#0B0F17] border-cyan-500/20 text-slate-200"
                              data-testid="clinical-ai-formatted-record"
                            />
                          </div>
                        ) : null}
                        {aiDraft.actions?.length ? (
                          <div className="space-y-2">
                            {aiDraft.actions.map((action, index) => (
                              <div key={`${action.type}-${index}`} className="rounded-md border border-amber-500/20 bg-[#111827] p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge className="bg-amber-500/15 text-amber-200">{action.type}</Badge>
                                  <strong className="text-slate-100">{action.title}</strong>
                                </div>
                                <p className="mt-2 whitespace-pre-wrap text-slate-300">{action.content}</p>
                                {action.rationale ? (
                                  <p className="mt-2 text-xs text-slate-500">{action.rationale}</p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {aiDraft.safety_checks?.length ? (
                          <div className="rounded-md border border-amber-500/20 bg-[#111827] p-3">
                            <p className="font-medium text-amber-200">Checagens obrigatórias antes de assinar</p>
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
                              {aiDraft.safety_checks.map((item, index) => (
                                <li key={index}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-500/20 bg-[#111827] p-3 text-amber-100">
                          <input
                            type="checkbox"
                            checked={reviewConfirmed}
                            onChange={(event) => setReviewConfirmed(event.target.checked)}
                            className="mt-1 accent-amber-400"
                            data-testid="clinical-ai-review-confirm"
                          />
                          <span>
                            Revisei e ajustei o prontuário e os rascunhos acima. Confirmo que o conteúdo
                            está correto antes de salvar.
                          </span>
                        </label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={discardAiDraft}
                          data-testid="clinical-ai-discard"
                        >
                          Descartar rascunho e iniciar outro atendimento
                        </Button>
                      </CardContent>
                    </Card>
                  ) : null}

                  {t === "odonto" ? (
                    <OdontogramView
                      value={odontogram}
                      onChange={(value) => {
                        setOdontogram(value);
                        setReviewConfirmed(false);
                      }}
                      affected={fields.dentes_afetados}
                    />
                  ) : null}

                  {canEdit ? (
                    <Button
                      type="submit"
                      disabled={
                        save.isPending ||
                        Boolean(aiDraft && (!reviewConfirmed || draftSourceChanged))
                      }
                      data-testid="record-save-button"
                    >
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
