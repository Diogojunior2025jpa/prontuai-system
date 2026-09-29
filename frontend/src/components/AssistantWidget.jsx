import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Loader2, Send, Sparkles, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SUGGESTIONS = [
  "Como cadastro um paciente?",
  "Como uso o ditado por voz no prontuário?",
  "Como libero permissões para um funcionário?",
  "O envio das campanhas é real?",
  "Como o sistema garante o isolamento entre clínicas?",
];

const GREETING = {
  role: "assistant",
  content:
    "Olá! Sou o Assistente ProntuAI. Posso explicar qualquer parte do sistema — agenda, pacientes, prontuário por voz, permissões, campanhas — e também tirar dúvidas clínicas para apoiar seu raciocínio. O que você quer saber?",
};

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [speakingIdx, setSpeakingIdx] = useState(null);
  const scrollRef = useRef(null);
  const audioRef = useRef(null);

  const { data: voice } = useQuery({
    queryKey: ["assistant", "voice-status"],
    queryFn: () => apiGet("/assistant/voice-status"),
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  const ask = useMutation({
    mutationFn: (question) =>
      apiPost("/assistant/ask", {
        question,
        history: messages.filter((m) => m !== GREETING).slice(-6),
      }),
    onSuccess: (res) => setMessages((m) => [...m, { role: "assistant", content: res.answer }]),
    onError: (e) =>
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            e?.body?.detail ||
            "Não consegui responder agora. Tente novamente em alguns segundos.",
          error: true,
        },
      ]),
  });

  const speak = useMutation({
    mutationFn: (text) => apiPost("/assistant/speak", { text }),
    onSuccess: (res) => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(res.audio_url);
      audioRef.current = audio;
      audio.onended = () => setSpeakingIdx(null);
      audio.onerror = () => setSpeakingIdx(null);
      audio.play().catch(() => setSpeakingIdx(null));
    },
    onError: (e) => {
      setSpeakingIdx(null);
      toast.error(e?.body?.detail || "Não foi possível gerar a voz");
    },
  });

  function submit(e) {
    e?.preventDefault();
    const q = input.trim();
    if (!q || ask.isPending) return;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    ask.mutate(q);
  }

  function sendSuggestion(s) {
    if (ask.isPending) return;
    setMessages((m) => [...m, { role: "user", content: s }]);
    ask.mutate(s);
  }

  function playAnswer(text, idx) {
    setSpeakingIdx(idx);
    speak.mutate(text);
  }

  const voiceOn = voice?.configured;

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-indigo-600 pl-4 pr-5 py-3 text-white shadow-lg shadow-indigo-950/50 hover:bg-indigo-500 hover:scale-[1.03] transition-all duration-200"
          data-testid="assistant-open-button"
          aria-label="Abrir o Assistente ProntuAI"
        >
          <Bot className="size-5" />
          <span className="text-sm font-medium">Dúvidas? Pergunte</span>
        </button>
      ) : null}

      {open ? (
        <div
          className="fixed bottom-6 right-6 z-40 flex h-[min(620px,calc(100vh-3rem))] w-[min(420px,calc(100vw-2rem))] flex-col rounded-xl border border-[#1F2937] bg-[#0F172A]/95 backdrop-blur-xl shadow-2xl animate-[rise_0.25s_cubic-bezier(0.16,1,0.3,1)]"
          data-testid="assistant-panel"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[#1F2937] px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#312E81]">
                <Bot className="size-4 text-indigo-300" />
              </div>
              <div className="min-w-0">
                <p className="font-heading text-sm font-semibold tracking-tight">Assistente ProntuAI</p>
                <p className="text-[11px] text-slate-500 truncate" data-testid="assistant-voice-status">
                  {voiceOn ? "Voz Adam ativa" : "Voz desativada (falta a chave sk_ da ElevenLabs)"}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => { audioRef.current?.pause(); setOpen(false); }}
              className="text-slate-500 hover:text-slate-100"
              data-testid="assistant-close-button"
              aria-label="Fechar assistente"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" ref={scrollRef} data-testid="assistant-messages">
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
                data-testid={`assistant-message-${m.role}-${i}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "rounded-br-sm bg-indigo-600 text-white"
                      : m.error
                        ? "rounded-bl-sm border border-red-900/60 bg-[#7F1D1D]/30 text-red-200"
                        : "rounded-bl-sm border border-[#1F2937] bg-[#111827] text-slate-200"
                  }`}
                >
                  {m.content}
                  {m.role === "assistant" && !m.error && voiceOn ? (
                    <button
                      type="button"
                      onClick={() => playAnswer(m.content, i)}
                      disabled={speak.isPending}
                      className="mt-2 flex items-center gap-1.5 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors duration-150 disabled:opacity-50"
                      data-testid={`assistant-speak-button-${i}`}
                    >
                      {speakingIdx === i && speak.isPending ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Volume2 className="size-3" />
                      )}
                      Ouvir a resposta
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {ask.isPending ? (
              <div className="flex justify-start" data-testid="assistant-thinking">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-[#1F2937] bg-[#111827] px-3.5 py-2.5 text-sm text-slate-400">
                  <Loader2 className="size-3.5 animate-spin" /> Pensando…
                </div>
              </div>
            ) : null}
          </div>

          {messages.length <= 1 ? (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5" data-testid="assistant-suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => sendSuggestion(s)}
                  className="rounded-full border border-[#1F2937] px-2.5 py-1 text-[11px] text-slate-400 hover:border-indigo-700 hover:text-indigo-300 transition-colors duration-150"
                  data-testid={`assistant-suggestion-${s.slice(0, 12).toLowerCase().replace(/[^a-z]+/g, "-")}`}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          <form onSubmit={submit} className="border-t border-[#1F2937] p-3 flex items-center gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte qualquer coisa do sistema…"
              className="bg-[#0B0F17]"
              data-testid="assistant-input"
            />
            <Button type="submit" size="icon" disabled={ask.isPending || !input.trim()} data-testid="assistant-send-button">
              {ask.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>

          <p className="px-4 pb-3 text-[10px] leading-snug text-slate-600">
            <Sparkles className="inline size-3 mr-1 align-[-1px]" />
            Respostas geradas por IA. Decisões clínicas são sempre do profissional responsável.
          </p>
        </div>
      ) : null}
    </>
  );
}
