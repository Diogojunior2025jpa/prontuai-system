import { useRef, useState } from "react";
import { Loader2, Mic, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import { apiPost, apiUpload } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const SAMPLES = {
  geral:
    "Paciente refere cefaleia frontal há duas semanas, pior no fim do dia. Nega febre. Pressão arterial 148 por 92, ausculta cardíaca normal. Hipótese de hipertensão estágio um. Inicio Losartana cinquenta miligramas uma vez ao dia e retorno em trinta dias.",
  odonto:
    "Paciente relata dor no dente dezesseis ao mastigar, iniciada há cinco dias. Ao exame, cárie oclusal extensa no dente dezesseis e mancha branca no vinte e seis. Diagnóstico de cárie em dentina. Plano de tratamento: restauração em resina composta no dezesseis e aplicação de flúor no vinte e seis.",
  oftalmo:
    "Paciente com queixa de visão embaçada para longe e cefaleia frontal. Acuidade visual olho direito vinte quarenta, olho esquerdo vinte e vinte e cinco. Pressão intraocular vinte e dois milímetros de mercúrio. Suspeita de hipertensão ocular. Conduta: colírio hipotensor e retorno em trinta dias.",
};

export default function VoiceDictationHUD({ template, onFields }) {
  const [status, setStatus] = useState("idle"); // idle | recording | processing
  const [transcript, setTranscript] = useState("");
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Microfone não disponível neste navegador. Use o texto de exemplo abaixo.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 1000) {
          setStatus("idle");
          toast.error("Áudio muito curto. Grave novamente.");
          return;
        }
        setStatus("processing");
        try {
          const fd = new FormData();
          fd.append("file", blob, "ditado.webm");
          const res = await apiUpload(`/ai/transcribe?template=${template}`, fd);
          setTranscript(res.transcript);
          onFields(res.fields);
          toast.success("Transcrição estruturada pela IA");
        } catch (err) {
          toast.error(err?.body?.detail || "Falha na transcrição");
        } finally {
          setStatus("idle");
        }
      };
      recorderRef.current = rec;
      rec.start();
      setStatus("recording");
    } catch {
      toast.error("Permissão de microfone negada. Use o texto de exemplo abaixo.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  async function structureText(text) {
    const value = (text ?? transcript).trim();
    if (!value) {
      toast.error("Escreva ou dite algo antes de estruturar");
      return;
    }
    setTranscript(value);
    setStatus("processing");
    try {
      const res = await apiPost("/ai/structure", { transcript: value, template });
      onFields(res.fields);
      toast.success("Campos preenchidos pela IA");
    } catch (err) {
      toast.error(err?.body?.detail || "Falha ao estruturar com IA");
    } finally {
      setStatus("idle");
    }
  }

  const label =
    status === "recording" ? "Ouvindo…" : status === "processing" ? "IA estruturando…" : "Microfone pronto";

  return (
    <div
      className="rounded-xl border border-purple-800/70 bg-[#180E29] p-5"
      data-testid="voice-dictation-hud"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="overline text-purple-300">Ditado inteligente</p>
          <p className="mt-1 text-sm text-purple-100/80" data-testid="voice-status-indicator">{label}</p>
        </div>
        <Badge className="bg-[#312E81] text-indigo-300">Groq Whisper + GPT-OSS 120B</Badge>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={status === "recording" ? stopRecording : startRecording}
          disabled={status === "processing"}
          className={`size-14 shrink-0 rounded-full grid place-items-center transition-transform duration-200 active:scale-95 disabled:opacity-50 ${
            status === "recording"
              ? "bg-purple-600 text-white animate-[pulse-ring_1.6s_cubic-bezier(0.4,0,0.6,1)_infinite]"
              : "bg-purple-900/60 text-purple-200 hover:bg-purple-800"
          }`}
          data-testid="voice-record-btn"
          aria-label={status === "recording" ? "Parar gravação" : "Gravar voz"}
        >
          {status === "processing" ? (
            <Loader2 className="size-6 animate-spin" />
          ) : status === "recording" ? (
            <Square className="size-5" />
          ) : (
            <Mic className="size-6" />
          )}
        </button>

        <div className="flex items-end gap-1 h-10 flex-1">
          {Array.from({ length: 28 }).map((_, i) => (
            <span
              key={i}
              className={`flex-1 rounded-sm ${status === "recording" ? "bg-purple-400" : "bg-purple-900/60"}`}
              style={{
                height: `${status === "recording" ? 20 + ((i * 37) % 80) : 12}%`,
                animation: status === "recording" ? `wave 1s ease-in-out ${i * 0.04}s infinite` : "none",
              }}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Textarea
          rows={4}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="A transcrição aparecerá aqui — você também pode digitar ou colar o relato e pedir para a IA estruturar."
          className="bg-[#0B0F17] border-purple-900/70"
          data-testid="voice-transcription-preview"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => structureText()}
            disabled={status !== "idle"}
            data-testid="ai-apply-fields-btn"
          >
            <Sparkles className="size-4" /> Estruturar com IA
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setTranscript(SAMPLES[template] || SAMPLES.geral)}
            disabled={status !== "idle"}
            data-testid="voice-sample-btn"
          >
            Usar relato de exemplo
          </Button>
        </div>
      </div>
    </div>
  );
}
