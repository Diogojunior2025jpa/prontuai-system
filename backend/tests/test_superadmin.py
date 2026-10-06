from types import SimpleNamespace

import pytest

import routers.superadmin as superadmin


class MemoryCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, field, direction):
        self.documents.sort(key=lambda document: document.get(field) or "")
        if direction < 0:
            self.documents.reverse()
        return self

    async def to_list(self, length):
        return self.documents[:length]


class MemoryCollection:
    def __init__(self, documents=None):
        self.documents = documents or []

    def find(self, query, _projection=None):
        return MemoryCursor([
            document for document in self.documents
            if all(document.get(key) == value for key, value in query.items())
        ])

    async def count_documents(self, query):
        return sum(
            1 for document in self.documents
            if all(document.get(key) == value for key, value in query.items())
        )


@pytest.mark.asyncio
async def test_tenant_out_includes_clinic_admin_name(monkeypatch):
    monkeypatch.setattr(
        superadmin,
        "db",
        SimpleNamespace(
            users=MemoryCollection([
                {"tenant_id": "tenant-1", "role": "clinic_admin", "name": "Ana Responsável"},
            ]),
            patients=MemoryCollection(),
        ),
    )

    tenant = await superadmin._tenant_out(
        {"id": "tenant-1", "name": "Clínica Exemplo"},
        {},
    )

    assert tenant.admin_name == "Ana Responsável"


@pytest.mark.asyncio
async def test_tenant_out_leaves_admin_name_empty_without_clinic_admin(monkeypatch):
    monkeypatch.setattr(
        superadmin,
        "db",
        SimpleNamespace(users=MemoryCollection(), patients=MemoryCollection()),
    )

    tenant = await superadmin._tenant_out(
        {"id": "tenant-1", "name": "Clínica Exemplo"},
        {},
    )

    assert tenant.admin_name is None
