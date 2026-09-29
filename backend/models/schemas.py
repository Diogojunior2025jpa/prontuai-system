"""Pydantic v2 request/response models for ProntuAI."""

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------- auth ----------
class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    tenant_id: str | None = None
    permissions: list[str] = []
    specialty: str | None = None
    active: bool = True


class MeOut(BaseModel):
    user: UserOut
    tenant: dict | None = None


# ---------- plans ----------
class PlanIn(BaseModel):
    name: str
    price: float = Field(ge=0)
    max_users: int = Field(ge=1)
    max_patients: int = Field(ge=1)
    features: list[str] = []
    active: bool = True


class Plan(PlanIn):
    id: str = Field(default_factory=new_id)
    created_at: datetime = Field(default_factory=utcnow)


# ---------- tenants ----------
class TenantIn(BaseModel):
    name: str
    specialty: Literal["geral", "odonto", "oftalmo"] = "geral"
    plan_id: str
    admin_name: str
    admin_email: str
    admin_password: str


class TenantOut(BaseModel):
    id: str
    name: str
    specialty: str
    plan_id: str | None = None
    plan_name: str | None = None
    plan_price: float = 0
    status: str = "active"
    users_count: int = 0
    patients_count: int = 0
    created_at: datetime | None = None


class TenantPatch(BaseModel):
    status: Literal["active", "blocked"] | None = None
    plan_id: str | None = None


# ---------- team ----------
class MemberIn(BaseModel):
    name: str
    email: str
    password: str | None = None
    role: Literal["clinic_admin", "professional", "receptionist", "finance"] = "professional"
    specialty: str | None = None
    permissions: list[str] = []
    active: bool = True


class MemberPatch(BaseModel):
    name: str | None = None
    role: Literal["clinic_admin", "professional", "receptionist", "finance"] | None = None
    permissions: list[str] | None = None
    active: bool | None = None
    specialty: str | None = None


# ---------- patients ----------
class PatientIn(BaseModel):
    name: str
    cpf: str
    birth_date: str
    phone: str = ""
    email: str = ""
    notes: str = ""


class Patient(PatientIn):
    id: str = Field(default_factory=new_id)
    tenant_id: str
    created_at: datetime = Field(default_factory=utcnow)


# ---------- appointments ----------
class AppointmentIn(BaseModel):
    patient_id: str
    professional_id: str | None = None
    date: str
    time: str
    reason: str = ""


class AppointmentOut(BaseModel):
    id: str
    tenant_id: str
    patient_id: str
    patient_name: str | None = None
    professional_id: str | None = None
    professional_name: str | None = None
    date: str
    time: str
    reason: str = ""
    status: str = "scheduled"
    price: float = 0
    created_at: datetime | None = None


class AppointmentPatch(BaseModel):
    status: Literal["scheduled", "done", "cancelled"] | None = None
    price: float | None = None


# ---------- records ----------
class RecordIn(BaseModel):
    patient_id: str
    template: Literal["geral", "odonto", "oftalmo"] = "geral"
    fields: dict[str, Any] = {}
    transcript: str = ""


class RecordOut(BaseModel):
    id: str
    tenant_id: str
    patient_id: str
    template: str
    fields: dict[str, Any] = {}
    transcript: str = ""
    author_id: str | None = None
    author_name: str | None = None
    created_at: datetime | None = None


# ---------- campaigns ----------
class CampaignIn(BaseModel):
    name: str
    channel: Literal["whatsapp", "email", "push"] = "whatsapp"
    audience: Literal["all", "birthdays", "inactive"] = "all"
    message: str


class CampaignOut(BaseModel):
    id: str
    tenant_id: str
    name: str
    channel: str
    audience: str
    message: str
    recipients: int = 0
    status: str = "sent"
    created_at: datetime | None = None


# ---------- ai ----------
class StructureIn(BaseModel):
    transcript: str
    template: Literal["geral", "odonto", "oftalmo"] = "geral"


class StructureOut(BaseModel):
    transcript: str
    fields: dict[str, Any]
    model: str


# ---------- patient portal ----------
class PortalLoginIn(BaseModel):
    cpf: str
    birth_date: str


class PortalBookIn(BaseModel):
    date: str
    time: str
    reason: str = ""
