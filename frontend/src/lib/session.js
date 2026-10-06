import { apiPost } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

export function beginSession() {
  queryClient.clear();
}

export async function endSession(path = "/auth/logout") {
  try {
    await apiPost(path);
  } finally {
    queryClient.clear();
  }
}

export const PERM_LABELS = {
  "patients.view": "Ver pacientes",
  "patients.edit": "Editar pacientes",
  "agenda.view": "Ver agenda",
  "agenda.edit": "Editar agenda",
  "records.view": "Ver prontuários",
  "records.edit": "Editar prontuários",
  "finance.view": "Acessar financeiro",
  "team.manage": "Gerenciar equipe",
  "campaigns.send": "Disparar campanhas",
  "settings.manage": "Configurações",
};

export const ROLE_LABELS = {
  super_admin: "Super Admin",
  clinic_admin: "Admin da Clínica",
  professional: "Profissional",
  receptionist: "Recepcionista",
  finance: "Financeiro",
};

export const SPECIALTY_LABELS = {
  geral: "Clínica Geral",
  odonto: "Odontologia",
  oftalmo: "Oftalmologia",
};

export const PLAN_DESCRIPTIONS = {
  "plan-basico": "Organize agenda, prontuários e pacientes com o essencial para uma rotina clínica mais fluida.",
  "plan-pro": "Ganhe tempo no atendimento com voz e IA, e reúna gestão e marketing em um só lugar.",
  "plan-enterprise": "Amplie a operação entre unidades com relatórios avançados e suporte dedicado.",
};

export function hasPerm(user, perm) {
  if (!user) return false;
  const p = user.permissions || [];
  return p.includes("*") || p.includes(perm);
}

export function brl(value) {
  return (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ptDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
