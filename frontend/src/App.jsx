import { Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import FirstAccess from "@/pages/FirstAccess";
import Dashboard from "@/pages/Dashboard";
import Patients from "@/pages/Patients";
import Agenda from "@/pages/Agenda";
import Availability from "@/pages/Availability";
import MedicalRecord from "@/pages/MedicalRecord";
import MedicalReports from "@/pages/MedicalReports";
import Team from "@/pages/Team";
import Campaigns from "@/pages/Campaigns";
import SuperAdmin from "@/pages/SuperAdmin";
import PortalLogin from "@/pages/PortalLogin";
import PatientPortal from "@/pages/PatientPortal";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.jsx.
export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/primeiro-acesso" element={<FirstAccess />} />
        <Route path="/app" element={<Dashboard />} />
        <Route path="/app/pacientes" element={<Patients />} />
        <Route path="/app/agenda" element={<Agenda />} />
        <Route path="/app/disponibilidade" element={<Availability />} />
        <Route path="/app/prontuario" element={<MedicalRecord />} />
        <Route path="/app/laudos" element={<MedicalReports />} />
        <Route path="/app/equipe" element={<Team />} />
        <Route path="/app/campanhas" element={<Campaigns />} />
        <Route path="/superadmin" element={<SuperAdmin />} />
        <Route path="/portal/login" element={<PortalLogin />} />
        <Route path="/portal" element={<PatientPortal />} />
      </Routes>
      <Toaster position="top-right" richColors />
    </>
  );
}
