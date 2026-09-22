import os

from groq import AsyncGroq, APIStatusError

from . import config


class LLM:
    def __init__(self, client=None):
        self.client = client or AsyncGroq(
            api_key=config.GROQ_API_KEY, timeout=30, max_retries=2
        )

    async def complete(self, system, user, max_tokens=700, model=None):
        models = [model or config.GROQ_MODEL]
        if config.GROQ_FALLBACK_MODEL and config.GROQ_FALLBACK_MODEL not in models:
            models.append(config.GROQ_FALLBACK_MODEL)
        last_error = None
        for m in models:
            try:
                r = await self.client.chat.completions.create(
                    model=m,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    temperature=0.2,
                    max_tokens=max_tokens,
                    reasoning_effort="low",
                )
                return (r.choices[0].message.content or "").strip()
            except APIStatusError as e:
                if e.status_code in (413, 429, 503):  # too big / rate limit / busy: try next model
                    last_error = e
                    continue
                raise
        raise last_error

    async def transcribe(self, path):
        with open(path, "rb") as f:
            data = f.read()
        r = await self.client.audio.transcriptions.create(
            file=(os.path.basename(path), data), model=config.WHISPER_MODEL
        )
        return r.text

