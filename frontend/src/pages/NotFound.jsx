import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#0B0F17] px-6 py-10 text-slate-100">
      <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center">
        <p className="overline text-cyan-300">404</p>
        <h1 className="mt-3 font-heading text-3xl font-semibold">Página não encontrada</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          O endereço acessado não corresponde a nenhuma tela disponível no ProntuAI.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link to="/app">
              <ArrowLeft className="size-4" />
              Voltar ao painel
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
