from datetime import date, timedelta
from types import SimpleNamespace

import pytest

import routers.clinic as clinic


class MemoryAggregateCursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, length=None):
        return self.rows if length is None else self.rows[:length]


class MemoryAppointments:
    def __init__(self, rows):
        self.rows = rows
        self.pipeline = None

    def aggregate(self, pipeline):
        self.pipeline = pipeline
        return MemoryAggregateCursor(self.rows)


@pytest.mark.asyncio
async def test_finance_overview_returns_monthly_values_and_comparison(monkeypatch):
    today = date.fromisoformat(clinic.today_iso())
    current_month = today.strftime("%Y-%m")
    previous_month_date = today.replace(day=1) - timedelta(days=1)
    previous_month = previous_month_date.strftime("%Y-%m")
    appointments = MemoryAppointments([
        {
            "_id": {"month": current_month, "status": "done"},
            "value": 260,
            "count": 4,
        },
        {
            "_id": {"month": current_month, "status": "scheduled"},
            "value": 180,
            "count": 2,
        },
        {
            "_id": {"month": current_month, "status": "cancelled"},
            "value": 50,
            "count": 1,
        },
        {
            "_id": {"month": previous_month, "status": "done"},
            "value": 200,
            "count": 3,
        },
    ])
    monkeypatch.setattr(clinic, "db", SimpleNamespace(appointments=appointments))
    user = {"id": "finance-user", "tenant_id": "clinic-1", "role": "finance"}

    result = await clinic.finance_overview(user)

    assert appointments.pipeline[0]["$match"]["tenant_id"] == "clinic-1"
    assert len(result["months"]) == 6
    assert result["current_month"]["completed_value"] == 260
    assert result["current_month"]["scheduled_value"] == 180
    assert result["current_month"]["cancelled_count"] == 1
    assert result["completed_change_percent"] == 30
    assert "não representam pagamentos confirmados" in result["data_note"]
