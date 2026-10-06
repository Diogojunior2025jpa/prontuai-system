from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import routers.clinic as clinic
from models.schemas import RecordPatch


class MemoryCollection:
    def __init__(self, documents=None):
        self.documents = [dict(document) for document in (documents or [])]

    @staticmethod
    def matches(document, query):
        for key, expected in query.items():
            value = document.get(key)
            if isinstance(expected, dict):
                if "$ne" in expected and value == expected["$ne"]:
                    return False
                if "$in" in expected and value not in expected["$in"]:
                    return False
            elif value != expected:
                return False
        return True

    async def find_one(self, query, _projection=None):
        return next(
            (
                dict(document)
                for document in self.documents
                if self.matches(document, query)
            ),
            None,
        )

    async def find_one_and_update(
        self,
        query,
        update,
        return_document=None,
        projection=None,
    ):
        del return_document, projection
        document = next(
            (
                item
                for item in self.documents
                if self.matches(item, query)
            ),
            None,
        )
        if not document:
            return None
        document.update(update["$set"])
        return dict(document)

    async def update_one(self, query, update):
        document = next(
            (
                item
                for item in self.documents
                if self.matches(item, query)
            ),
            None,
        )
        if not document:
            return SimpleNamespace(matched_count=0)
        document.update(update["$set"])
        return SimpleNamespace(matched_count=1)

    def find(self, query, _projection=None):
        return MemoryCursor([
            dict(document)
            for document in self.documents
            if self.matches(document, query)
        ])


class MemoryCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, *_args):
        return self

    async def to_list(self, length):
        return self.documents[:length]


@pytest.mark.asyncio
async def test_clinic_admin_can_edit_report_and_update_audit_fields(monkeypatch):
    record = {
        "id": "record-1",
        "tenant_id": "tenant-1",
        "patient_id": "patient-1",
        "template": "geral",
        "fields": {"diagnostico": "Antigo"},
        "author_id": "professional-1",
    }
    records = MemoryCollection([record])
    monkeypatch.setattr(
        clinic,
        "db",
        SimpleNamespace(
            records=records,
            patients=MemoryCollection([
                {"id": "patient-1", "tenant_id": "tenant-1", "name": "Paciente"}
            ]),
            users=MemoryCollection([
                {"id": "professional-1", "tenant_id": "tenant-1", "name": "Dra. Ana"}
            ]),
        ),
    )

    result = await clinic.update_record(
        "record-1",
        RecordPatch(fields={"diagnostico": "Atualizado"}),
        {"id": "admin-1", "tenant_id": "tenant-1", "role": "clinic_admin"},
    )

    assert result.fields["diagnostico"] == "Atualizado"
    assert records.documents[0]["updated_by"] == "admin-1"
    assert isinstance(records.documents[0]["updated_at"], datetime)


@pytest.mark.asyncio
async def test_archive_record_hides_record_without_permanently_deleting(monkeypatch):
    record = {
        "id": "record-1",
        "tenant_id": "tenant-1",
        "patient_id": "patient-1",
    }
    records = MemoryCollection([record])
    monkeypatch.setattr(clinic, "db", SimpleNamespace(records=records))

    await clinic.archive_record(
        "record-1",
        {"id": "admin-1", "tenant_id": "tenant-1", "role": "clinic_admin"},
    )

    assert len(records.documents) == 1
    assert records.documents[0]["archived_by"] == "admin-1"
    assert isinstance(records.documents[0]["archived_at"], datetime)


@pytest.mark.asyncio
async def test_archive_record_cannot_affect_another_tenant(monkeypatch):
    record = {
        "id": "record-1",
        "tenant_id": "tenant-2",
        "patient_id": "patient-1",
    }
    records = MemoryCollection([record])
    monkeypatch.setattr(clinic, "db", SimpleNamespace(records=records))

    with pytest.raises(HTTPException) as error:
        await clinic.archive_record(
            "record-1",
            {"id": "admin-1", "tenant_id": "tenant-1", "role": "clinic_admin"},
        )

    assert error.value.status_code == 404
    assert "archived_at" not in records.documents[0]


@pytest.mark.asyncio
async def test_receptionist_cannot_archive_medical_report(monkeypatch):
    records = MemoryCollection([{
        "id": "record-1",
        "tenant_id": "tenant-1",
        "patient_id": "patient-1",
    }])
    monkeypatch.setattr(clinic, "db", SimpleNamespace(records=records))

    with pytest.raises(HTTPException) as error:
        await clinic.archive_record(
            "record-1",
            {"id": "receptionist-1", "tenant_id": "tenant-1", "role": "receptionist"},
        )

    assert error.value.status_code == 403
    assert "archived_at" not in records.documents[0]


@pytest.mark.asyncio
async def test_list_records_hides_archived_reports(monkeypatch):
    records = MemoryCollection([
        {
            "id": "record-active",
            "tenant_id": "tenant-1",
            "patient_id": "patient-1",
            "template": "geral",
            "created_at": datetime.now(),
        },
        {
            "id": "record-archived",
            "tenant_id": "tenant-1",
            "patient_id": "patient-1",
            "template": "geral",
            "archived_at": datetime.now(),
            "created_at": datetime.now(),
        },
    ])
    monkeypatch.setattr(
        clinic,
        "db",
        SimpleNamespace(
            records=records,
            patients=MemoryCollection([
                {"id": "patient-1", "tenant_id": "tenant-1", "name": "Paciente"}
            ]),
            users=MemoryCollection(),
        ),
    )

    result = await clinic.list_records(
        None,
        {"id": "admin-1", "tenant_id": "tenant-1", "role": "clinic_admin"},
    )

    assert [record.id for record in result] == ["record-active"]
