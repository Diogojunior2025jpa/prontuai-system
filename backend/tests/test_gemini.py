import httpx

import lib.gemini as gemini


class MockGeminiClient:
    def __init__(self, **kwargs):
        self.generate_calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def post(self, url, headers, json):
        self.generate_calls.append(url)
        if len(self.generate_calls) == 1:
            return httpx.Response(
                404,
                request=httpx.Request("POST", url),
                json={"error": {"message": "model not found"}},
            )
        return httpx.Response(
            200,
            request=httpx.Request("POST", url),
            json={"candidates": [{"content": {"parts": [{"text": "Resumo do sistema"}]}}]},
        )

    async def get(self, url, headers):
        return httpx.Response(
            200,
            request=httpx.Request("GET", url),
            json={
                "models": [
                    {
                        "name": "models/gemini-2.5-flash",
                        "supportedGenerationMethods": ["generateContent"],
                    }
                ]
            },
        )


async def test_generate_summary_falls_back_to_a_supported_model(monkeypatch):
    client = MockGeminiClient()
    monkeypatch.setattr(gemini.httpx, "AsyncClient", lambda **kwargs: client)
    monkeypatch.setattr(gemini, "get_provider_key", lambda provider: _key())
    monkeypatch.setenv("GEMINI_MODEL", "gemini-1.5-pro")

    answer, model = await gemini.generate_summary("instrução", "pergunta")

    assert answer == "Resumo do sistema"
    assert model == "gemini-2.5-flash"
    assert len(client.generate_calls) == 2
    assert "gemini-1.5-pro" in client.generate_calls[0]
    assert "gemini-2.5-flash" in client.generate_calls[1]


async def _key():
    return "unit-test-gemini-key"
