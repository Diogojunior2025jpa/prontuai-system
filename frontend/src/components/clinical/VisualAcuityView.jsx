import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SNELLEN = ["20/20", "20/25", "20/30", "20/40", "20/50", "20/70", "20/100", "20/200"];

export default function VisualAcuityView({ fields, onField }) {
  return (
    <div className="rounded-lg border border-[#1F2937] bg-[#111827] p-5" data-testid="visual-acuity-container">
      <p className="overline text-cyan-400">Acuidade visual & refração</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="av-od">Acuidade OD (olho direito)</Label>
          <Input
            id="av-od"
            list="snellen-values"
            value={fields.acuidade_od || ""}
            onChange={(e) => onField("acuidade_od", e.target.value)}
            placeholder="20/20"
            className="font-mono"
            data-testid="visual-acuity-od-input"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="av-os">Acuidade OS (olho esquerdo)</Label>
          <Input
            id="av-os"
            list="snellen-values"
            value={fields.acuidade_os || ""}
            onChange={(e) => onField("acuidade_os", e.target.value)}
            placeholder="20/20"
            className="font-mono"
            data-testid="visual-acuity-os-input"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="av-pio">Pressão intraocular (mmHg)</Label>
          <Input
            id="av-pio"
            value={fields.pressao_intraocular || ""}
            onChange={(e) => onField("pressao_intraocular", e.target.value)}
            placeholder="14 mmHg"
            className="font-mono"
            data-testid="intraocular-pressure-input"
          />
        </div>
      </div>

      <datalist id="snellen-values">
        {SNELLEN.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <div className="mt-5 rounded-md border border-[#1F2937] bg-[#0B0F17] p-4">
        <p className="overline text-slate-500 mb-3">Tabela de Snellen (referência)</p>
        <div className="space-y-1.5">
          {["E", "F P", "T O Z", "L P E D", "P E C F D"].map((line, i) => (
            <p
              key={line}
              className="font-mono text-slate-300 tracking-[0.3em] leading-none"
              style={{ fontSize: `${26 - i * 4}px` }}
            >
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
