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
            if self.matches(document, query)
        ])

    async def find_one(self, query, _projection=None):
        return next((document.copy() for document in self.documents if self.matches(document, query)), None)

    async def update_one(self, query, update):
        document = next((document for document in self.documents if self.matches(document, query)), None)
        if not document:
            return SimpleNamespace(matched_count=0)
        document.update(update["$set"])
        return SimpleNamespace(matched_count=1)

    async def find_one_and_update(self, query, update, **_kwargs):
        document = next((document for document in self.documents if self.matches(document, query)), None)
        if not document:
            return None
        document.update(update["$set"])
        return document.copy()

    async def count_documents(self, query):
        return sum(
            1 for document in self.documents
            if self.matches(document, query)
        )

    @staticmethod
    def matches(document, query):
        for key, expected in query.items():
            if isinstance(expected, dict) and "$ne" in expected:
                if document.get(key) == expected["$ne"]:
                    return False
            elif document.get(key) != expected:
                return False
        return True


@pytest.mark.asyncio
async def test_tenant_out_includes_clinic_admin_name(monkeypatch):
    monkeypatch.setattr(
        superadmin,
        "db",
        SimpleNamespace(
            users=MemoryCollection([
                {"id": "admin-1", "tenant_id": "tenant-1", "role": "clinic_admin", "name": "Ana Responsável", "email": "ana@example.com"},
            ]),
            patients=MemoryCollection(),
        ),
    )

    tenant = await superadmin._tenant_out(
        {"id": "tenant-1", "name": "Clínica Exemplo"},
        {},
    )

    assert tenant.admin_name == "Ana Responsável"
    assert tenant.admin_email == "ana@example.com"


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
    assert tenant.admin_email is None


@pytest.mark.asyncio
async def test_super_admin_can_edit_clinic_and_primary_admin(monkeypatch):
    tenants = MemoryCollection([{
        "id": "tenant-1",
        "name": "Clínica antiga",
        "specialty": "geral",
        "plan_id": "plan-1",
        "status": "active",
    }])
    users = MemoryCollection([{
        "id": "admin-1",
        "tenant_id": "tenant-1",
        "role": "clinic_admin",
        "name": "Ana Antiga",
        "email": "ana@example.com",
    }])
    plans = MemoryCollection([{"id": "plan-1", "name": "Básico", "price": 149}])
    monkeypatch.setattr(
        superadmin,
        "db",
        SimpleNamespace(tenants=tenants, users=users, plans=plans, patients=MemoryCollection()),
    )

    result = await superadmin.patch_tenant(
        "tenant-1",
        superadmin.TenantPatch(
            name="Clínica Atualizada",
            specialty="odonto",
            admin_name="Ana Nova",
            admin_email="ana.nova@example.com",
        ),
    )

    assert result.name == "Clínica Atualizada"
    assert result.specialty == "odonto"
    assert result.admin_name == "Ana Nova"
    assert result.admin_email == "ana.nova@example.com"
    assert users.documents[0]["email"] == "ana.nova@example.com"


@pytest.mark.asyncio
async def test_super_admin_cannot_assign_email_used_by_another_account(monkeypatch):
    tenants = MemoryCollection([{"id": "tenant-1", "name": "Clínica", "specialty": "geral"}])
    users = MemoryCollection([
        {"id": "admin-1", "tenant_id": "tenant-1", "role": "clinic_admin", "name": "Ana", "email": "ana@example.com"},
        {"id": "other-1", "tenant_id": "tenant-2", "role": "clinic_admin", "name": "Bia", "email": "bia@example.com"},
    ])
    monkeypatch.setattr(
        superadmin,
        "db",
        SimpleNamespace(
            tenants=tenants,
            users=users,
            plans=MemoryCollection(),
            patients=MemoryCollection(),
        ),
    )

    with pytest.raises(superadmin.HTTPException) as error:
        await superadmin.patch_tenant(
            "tenant-1",
            superadmin.TenantPatch(admin_email="bia@example.com"),
        )

    assert error.value.status_code == 409
    assert users.documents[0]["email"] == "ana@example.com"
