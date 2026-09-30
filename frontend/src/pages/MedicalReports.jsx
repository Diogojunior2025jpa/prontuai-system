import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, Pencil, Printer, Save } from "lucide-react";
import { toast } from "sonner";
import AppShell, { useMe } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { hasPerm, ptDate } from "@/lib/session";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const TEMPLATE_LABELS = { geral: "Clínica Geral", odonto: "Odontologia", oftalmo: "Oftalmologia" };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function printableValue(value) {
  if (value == null || value === "") return "Não informado";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export default function MedicalReports() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canView = hasPerm(me?.user, "records.view");
  const canEdit = hasPerm(me?.user, "records.edit");
  const [patientId, setPatientId] = useState("all");
  const [recordId, setRecordId] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editFields, setEditFields] = useState({});
  const [editTranscript, setEditTranscript] = useState("");
  const canEditReport = canEdit && me?.user?.role === "professional";

  const { data: allRecords = [], isError } = useQuery({
    queryKey: ["records"],
    queryFn: () => apiGet("/clinic/records"),
    enabled: canView,
    retry: false,
  });

  const records = patientId === "all"
    ? allRecords
    : allRecords.filter((record) => record.patient_id === patientId);
  const patientNames = Object.fromEntries(allRecords.map((record) => [record.patient_id, record.patient_name || "Paciente"]));
  const reportPatients = [...new Map(allRecords.map((record) => [record.patient_id, {
    id: record.patient_id,
    name: record.patient_name || "Paciente",
  }])).values()];
  const selectedRecord = records.find((record) => record.id === recordId) || records[0];
  const selectedPatientName = patientNames[selectedRecord?.patient_id] || "Paciente";

  const saveCopy = useMutation({
    mutationFn: () => apiPost("/clinic/records", {
      patient_id: selectedRecord.patient_id,
      template: selectedRecord.template,
      fields: selectedRecord.fields,
      transcript: selectedRecord.transcript,
    }),
    onSuccess: (copy) => {
      queryClient.invalidateQueries({ queryKey: ["records"] });
      setRecordId(copy.id);
      toast.success("Cópia salva no prontuário do paciente");
    },
    onError: (error) => toast.error(error?.body?.detail || "Não foi possível salvar a cópia"),
  });

  const updateReport = useMutation({
    mutationFn: () => apiPatch(`/clinic/records/${selectedRecord.id}`, {
      fields: Object.fromEntries(Object.entries(editFields).map(([key, value]) => {
        const original = selectedRecord.fields?.[key];
        if (original && typeof original === "object") {
          try {
            return [key, JSON.parse(value)];
          } catch {
            throw new Error(`O campo ${key.replaceAll("_", " ")} precisa conter JSON válido.`);
          }
        }
        return [key, value];
      })),
      transcript: editTranscript,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["records"] });
      setEditOpen(false);
      toast.success("Laudo atualizado");
    },
    onError: (error) => toast.error(error?.body?.detail || error.message || "Falha ao atualizar laudo"),
  });

  function openEditor() {
    setEditFields(Object.fromEntries(Object.entries(selectedRecord.fields || {}).map(([key, value]) => [
      key,
      value && typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? ""),
    ])));
    setEditTranscript(selectedRecord.transcript || "");
    setEditOpen(true);
  }

  function exportDoc() {
    if (!selectedRecord) return;
    const fields = Object.entries(selectedRecord.fields || {}).map(([key, value]) => (
      `<section><h2>${escapeHtml(key.replaceAll("_", " "))}</h2><p>${escapeHtml(printableValue(value))}</p></section>`
    )).join("");
    const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Laudo médico</title><style>body{font:14px Arial,sans-serif;color:#172033;line-height:1.5;margin:36px}h1{font-size:22px;border-bottom:2px solid #176b70;padding-bottom:12px}h2{font-size:13px;text-transform:capitalize;color:#176b70;margin-bottom:4px}p{white-space:pre-wrap;margin-top:0}section{margin:18px 0}.meta{color:#52606d}</style></head><body><h1>Laudo médico</h1><p class="meta">Paciente: ${escapeHtml(selectedPatientName)}<br>Especialidade: ${escapeHtml(TEMPLATE_LABELS[selectedRecord.template] || selectedRecord.template)}<br>Data: ${escapeHtml(ptDate(String(selectedRecord.created_at).slice(0, 10)))}<br>Profissional: ${escapeHtml(selectedRecord.author_name || "Não informado")}</p>${fields}</body></html>`;
    const url = URL.createObjectURL(new Blob([documentHtml], { type: "application/msword;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `laudo-${selectedRecord.id.slice(0, 8)}.doc`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!canView) {
    return <AppShell title="Laudos Médicos"><p className="text-sm text-amber-400">Seu perfil não tem permissão para visualizar laudos.</p></AppShell>;
  }

  return (
    <AppShell title="Laudos Médicos" subtitle="Consulte, imprima e exporte documentos clínicos">
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.6fr)]">
        <Card className="h-fit border-[#1F2937] bg-[#111827]">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-base">Laudos registrados</CardTitle>
            <Select value={patientId} onValueChange={(value) => { setPatientId(value || "all"); setRecordId(""); }}>
              <SelectTrigger aria-label="Filtrar por paciente" data-testid="reports-patient-filter">
                <SelectValue placeholder="Todos os pacientes">{(value) => patientNames[value] || "Todos os pacientes"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os pacientes</SelectItem>
                {reportPatients.map((patient) => <SelectItem key={patient.id} value={patient.id}>{patient.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="space-y-2">
            {isError ? <p className="text-sm text-amber-400">Não foi possível carregar os laudos.</p> : null}
            {records.length === 0 ? (
              <p className="py-5 text-sm text-slate-500" data-testid="reports-empty">Nenhum laudo encontrado.</p>
            ) : records.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => setRecordId(record.id)}
                className={`w-full rounded-md border p-3 text-left transition-colors ${selectedRecord?.id === record.id ? "border-teal-700 bg-teal-950/30" : "border-[#1F2937] hover:bg-[#172033]"}`}
                data-testid={`report-item-${record.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="border-teal-900 text-teal-300">{TEMPLATE_LABELS[record.template] || record.template}</Badge>
                  <span className="font-mono text-[11px] text-slate-500">{ptDate(String(record.created_at).slice(0, 10))}</span>
                </div>
                <p className="mt-2 truncate text-sm font-medium text-slate-100">{patientNames[record.patient_id] || "Paciente"}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{record.fields?.diagnostico || record.fields?.queixa_principal || "Sem resumo"}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="min-w-0 border-[#1F2937] bg-[#111827]">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b border-[#1F2937]">
            <div>
              <CardTitle className="font-heading text-base">Documento clínico</CardTitle>
              {selectedRecord ? <p className="mt-1 text-xs text-slate-500">{selectedPatientName} · {ptDate(String(selectedRecord.created_at).slice(0, 10))}</p> : null}
            </div>
            {selectedRecord ? (
              <div className="report-screen-controls flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="report-print-button">
                  <Printer className="size-4" /> Imprimir / PDF
                </Button>
                <Button variant="outline" size="sm" onClick={exportDoc} data-testid="report-export-doc-button">
                  <Download className="size-4" /> Exportar DOC
                </Button>
                {canEdit ? (
                  <Button size="sm" onClick={() => saveCopy.mutate()} disabled={saveCopy.isPending} data-testid="report-save-copy-button">
                    <Copy className="size-4" /> {saveCopy.isPending ? "Salvando…" : "Salvar cópia"}
                  </Button>
                ) : null}
                {canEditReport ? (
                  <Button variant="outline" size="sm" onClick={openEditor} data-testid="report-edit-button">
                    <Pencil className="size-4" /> Editar laudo
                  </Button>
                ) : null}
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="pt-5">
            {selectedRecord ? (
              <article className="report-print-root mx-auto max-w-3xl space-y-6 rounded-sm bg-white p-6 text-slate-900 sm:p-10" data-testid="report-document">
                <header className="border-b-2 border-teal-800 pb-5">
                  <p className="font-mono text-xs uppercase text-teal-800">ProntuAI · documento clínico</p>
                  <h2 className="mt-2 text-2xl font-semibold">Laudo médico</h2>
                  <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                    <div><dt className="font-semibold">Paciente</dt><dd>{selectedPatientName}</dd></div>
                    <div><dt className="font-semibold">Especialidade</dt><dd>{TEMPLATE_LABELS[selectedRecord.template] || selectedRecord.template}</dd></div>
                    <div><dt className="font-semibold">Data de emissão</dt><dd>{ptDate(String(selectedRecord.created_at).slice(0, 10))}</dd></div>
                    <div><dt className="font-semibold">Profissional responsável</dt><dd>{selectedRecord.author_name || "Não informado"}</dd></div>
                  </dl>
                </header>
                <div className="space-y-5">
                  {Object.entries(selectedRecord.fields || {}).map(([key, value]) => (
                    <section key={key} className="break-inside-avoid border-b border-slate-200 pb-4">
                      <h3 className="text-sm font-semibold capitalize text-teal-900">{key.replaceAll("_", " ")}</h3>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{printableValue(value)}</p>
                    </section>
                  ))}
                </div>
                {selectedRecord.transcript ? (
                  <section className="break-inside-avoid border-t border-slate-300 pt-4">
                    <h3 className="text-sm font-semibold text-teal-900">Relato original</h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{selectedRecord.transcript}</p>
                  </section>
                ) : null}
              </article>
            ) : (
              <p className="py-12 text-center text-sm text-slate-500">Selecione um laudo para visualizar.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle className="font-heading">Editar laudo</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); updateReport.mutate(); }} data-testid="report-edit-form">
            {Object.entries(editFields).map(([key, value]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`edit-report-${key}`}>{key.replaceAll("_", " ")}</Label>
                <Textarea
                  id={`edit-report-${key}`}
                  value={value}
                  rows={value.length > 100 ? 4 : 2}
                  onChange={(event) => setEditFields((current) => ({ ...current, [key]: event.target.value }))}
                  data-testid={`report-edit-field-${key}`}
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor="edit-report-transcript">Relato original</Label>
              <Textarea id="edit-report-transcript" value={editTranscript} rows={4} onChange={(event) => setEditTranscript(event.target.value)} data-testid="report-edit-transcript" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={updateReport.isPending} data-testid="report-edit-save">
                <Save className="size-4" /> {updateReport.isPending ? "Salvando…" : "Salvar alterações"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}