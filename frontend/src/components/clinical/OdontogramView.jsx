import { useMemo } from "react";

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];

export const TOOTH_STATUS = {
  higido: { label: "Hígido", cls: "bg-[#111827] border-[#1F2937] text-slate-400" },
  carie: { label: "Cárie", cls: "bg-[#7F1D1D] border-red-800 text-red-200" },
  restauracao: { label: "Restauração", cls: "bg-[#312E81] border-indigo-700 text-indigo-200" },
  canal: { label: "Canal", cls: "bg-[#78350F] border-amber-700 text-amber-200" },
  protese: { label: "Prótese", cls: "bg-[#164E63] border-cyan-700 text-cyan-200" },
  extraido: { label: "Extraído", cls: "bg-[#0B0F17] border-slate-700 text-slate-600 line-through" },
};

const ORDER = Object.keys(TOOTH_STATUS);

function Tooth({ number, status, onCycle }) {
  const cfg = TOOTH_STATUS[status] || TOOTH_STATUS.higido;
  return (
    <button
      type="button"
      onClick={() => onCycle(number)}
      title={`Dente ${number} — ${cfg.label} (clique para alternar)`}
      className={`h-11 w-9 rounded-md border text-[11px] font-mono transition-all duration-150 hover:scale-105 hover:border-indigo-500 ${cfg.cls}`}
      data-testid={`tooth-card-${number}`}
    >
      {number}
    </button>
  );
}

export default function OdontogramView({ value, onChange, affected }) {
  const chart = value || {};

  const highlighted = useMemo(() => {
    const nums = String(affected || "").match(/\b\d{2}\b/g) || [];
    return new Set(nums);
  }, [affected]);

  function cycle(number) {
    const current = chart[number] || "higido";
    const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
    onChange({ ...chart, [number]: next });
  }

  const summary = Object.entries(chart).filter(([, s]) => s && s !== "higido");

  const row = (nums, key) => (
    <div className="flex gap-1" key={key}>
      {nums.map((n) => (
        <div key={n} className={highlighted.has(String(n)) ? "ring-2 ring-purple-500 rounded-md" : ""}>
          <Tooth number={n} status={chart[n]} onCycle={cycle} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="rounded-lg border border-[#1F2937] bg-[#111827] p-5" data-testid="odontogram-container">
      <div className="flex items-center justify-between">
        <p className="overline text-cyan-400">Odontograma (FDI, 32 dentes)</p>
        <p className="text-xs text-slate-500">Clique em um dente para alternar o status</p>
      </div>

      <div className="mt-4 space-y-2 overflow-x-auto">
        <div className="flex gap-4 justify-center min-w-max">
          {row(UPPER_RIGHT, "ur")}
          {row(UPPER_LEFT, "ul")}
        </div>
        <div className="flex gap-4 justify-center min-w-max">
          {row(LOWER_RIGHT, "lr")}
          {row(LOWER_LEFT, "ll")}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {Object.entries(TOOTH_STATUS).map(([k, v]) => (
          <span key={k} className={`text-[11px] rounded-full border px-2 py-0.5 ${v.cls}`}>
            {v.label}
          </span>
        ))}
      </div>

      <p className="mt-4 text-sm text-slate-400" data-testid="odontogram-summary">
        {summary.length === 0
          ? "Nenhuma alteração registrada."
          : summary.map(([n, s]) => `${n}: ${TOOTH_STATUS[s].label}`).join(" · ")}
      </p>
    </div>
  );
}
