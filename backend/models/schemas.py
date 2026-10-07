"""Pydantic v2 request/response models for ProntuAI."""

import uuid
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, EmailStr, Field, field_validator


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _validate_bcrypt_password_bytes(value: str) -> str:
    if len(value.encode("utf-8")) > 72:
        raise ValueError("A senha deve ter no máximo 72 bytes em UTF-8")
    return value


# ---------- auth ----------
class LoginIn(BaseModel):
    email: str
    password: str


class RegisterIn(BaseModel):
    clinic_name: str = Field(min_length=2, max_length=120)
    name: str = Field(min_length=2, max_length=120)
    specialty: Literal["geral", "odonto", "oftalmo"] = "geral"
    email: EmailStr
    password: str = Field(min_length=12, max_length=72)

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        return _validate_bcrypt_password_bytes(value)


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=32, max_length=256)
    new_password: str = Field(min_length=12, max_length=72)

    @field_validator("new_password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        return _validate_bcrypt_password_bytes(value)


class SelectPlanIn(BaseModel):
    plan_id: str = Field(min_length=1, max_length=100)


class AccountUpdateIn(BaseModel):
    email: EmailStr
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    tenant_id: str | None = None
    permissions: list[str] = []
    specialty: str | None = None
    active: bool = True
    must_change_password: bool = False


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
    pagbank_recurring_url: str | None = Field(default=None, max_length=2048)

    @field_validator("pagbank_recurring_url")
    @classmethod
    def validate_pagbank_recurring_url(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip()
        parsed = urlsplit(value)
        if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
            raise ValueError("O link recorrente PagBank deve ser uma URL HTTPS válida")
        return value


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
    admin_name: str | None = None
    admin_email: EmailStr | None = None
    specialty: str
    plan_id: str | None = None
    plan_name: str | None = None
    plan_price: float = 0
    status: str = "active"
    users_count: int = 0
    patients_count: int = 0
    created_at: datetime | None = None
    subscription_status: str | None = None
    trial_ends_at: datetime | None = None
    trial_duration_days: int = 7
    can_grant_trial: bool = False
    pagbank_recurring_link_started: bool = False


class TenantPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    specialty: Literal["geral", "odonto", "oftalmo"] | None = None
    admin_name: str | None = Field(default=None, min_length=2, max_length=120)
    admin_email: EmailStr | None = None
    status: Literal["active", "blocked"] | None = None
    plan_id: str | None = None
    subscription_status: Literal["pending_payment", "active"] | None = None


class GrantTrialIn(BaseModel):
    days: int = Field(ge=1, le=3650)


# ---------- global notices ----------
class NoticeIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    message: str = Field(min_length=5, max_length=2000)


class NoticePatch(BaseModel):
    active: bool


class NoticeOut(BaseModel):
    id: str
    tenant_id: str | None = None
    title: str
    message: str
    active: bool = True
    created_by: str
    created_at: datetime


# ---------- provider API keys ----------
class ApiKeyIn(BaseModel):
    api_key: str = Field(min_length=8, max_length=512)


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
    availability_id: str | None = None
    date: str
    time: str
    reason: str = ""
    status: str = "scheduled"
    price: float = 0
    created_at: datetime | None = None


class AppointmentPatch(BaseModel):
    status: Literal["scheduled", "done", "cancelled"] | None = None
    price: float | None = None


# ---------- professional availability ----------
class AvailabilityIn(BaseModel):
    date: str
    times: list[str] = Field(min_length=1, max_length=32)
    professional_id: str | None = None


class AvailabilityOut(BaseModel):
    id: str
    tenant_id: str
    professional_id: str
    professional_name: str
    date: str
    time: str
    status: Literal["available", "booked"] = "available"
    appointment_id: str | None = None


class AvailabilityCreateOut(BaseModel):
    created: int
    slots: list[AvailabilityOut]


class PortalAvailabilityOut(BaseModel):
    id: str
    professional_name: str
    date: str
    time: str


class PortalAvailabilityList(BaseModel):
    managed: bool
    slots: list[PortalAvailabilityOut]


# ---------- records ----------
class RecordIn(BaseModel):
    patient_id: str
    template: Literal["geral", "odonto", "oftalmo"] = "geral"
    fields: dict[str, Any] = {}
    transcript: str = ""


class RecordPatch(BaseModel):
    fields: dict[str, Any] | None = None
    transcript: str | None = None


class RecordOut(BaseModel):
    id: str
    tenant_id: str
    patient_id: str
    patient_name: str | None = None
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


# ---------- assistente ----------
class AskIn(BaseModel):
    question: str
    history: list[dict[str, Any]] = []


class AskOut(BaseModel):
    answer: str
    model: str


class SpeakIn(BaseModel):
    text: str


class SpeakOut(BaseModel):
    audio_url: str
    voice_id: str


# ---------- patient portal ----------
class PortalLoginIn(BaseModel):
    cpf: str
    birth_date: str


class PortalBookIn(BaseModel):
    date: str
    time: str
    reason: str = ""
    availability_id: str | None = None
