import asyncio
import pytest
from chatbot import config, store, ingest
from chatbot.service import Orbit
import time


# class FakeLLM:
#     def __init__(self):
#         self.calls = []

#     async def complete(self, system, user, max_tokens=600):
#         if "search keywords" in system:
#             return ""           # keyword step: not counted as an answer call
#         self.calls.append(user)
#         return "fake answer"

class FakeLLM:
    def __init__(self):
        self.calls = []

    async def complete(self, system, user, max_tokens=600, model=None):
        if "search keywords" in system:
            return ""
        self.calls.append(user)
        return "fake answer"


@pytest.fixture
def bot(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "test.db"))
    return Orbit(llm=FakeLLM())


def run(bot, text, author="Sam", is_dm=False):
    return asyncio.run(bot.handle("g1", author, text, is_dm))


def test_normal_message_is_saved_and_bot_stays_quiet(bot):
    assert run(bot, "Demo is on Friday at 5pm") is None
    assert len(store.search("demo")) == 1


def test_question_uses_past_messages(bot):
    run(bot, "Demo is on Friday at 5pm")
    assert run(bot, "/ask when is the demo?", author="Ada") == "fake answer"
    assert "Demo is on Friday" in bot.llm.calls[0]


def test_no_match_skips_llm(bot):
    assert "couldn't find" in run(bot, "/ask what is the budget?")
    assert bot.llm.calls == []


def test_questions_to_bot_are_not_saved(bot):
    run(bot, "/ask what is the budget?")
    assert store.search("budget") == []


def test_summary(bot):
    run(bot, "We agreed to launch on Monday")
    assert run(bot, "/summary 24") == "fake answer"
    assert "launch on Monday" in bot.llm.calls[0]


def test_call_transcripts_are_searchable(bot):
    ingest.add_call("Weekly sync", "We decided the prize will be announced Thursday.")
    run(bot, "/ask when is the prize announced")
    assert "call: Weekly sync" in bot.llm.calls[0]

def test_other_bots_are_ignored(bot, monkeypatch):
    monkeypatch.setattr(config, "IGNORED_AUTHORS", ["+229 01 49 48 62 56"])
    run(bot, "Max 2 members per country", author="+229 01 49 48 62 56")
    assert store.search("country") == []

def test_import_parses_us_dates_and_multiline(bot, tmp_path):
    f = tmp_path / "chat.txt"
    f.write_text(
        "[9/19/26, 7:46:42 AM] Ada: hello\n"
        "[9/19/26, 8:26:44 AM] Sam: hi there\n"
        "second line\n",
        encoding="utf-8",
    )
    assert ingest.import_whatsapp_export(str(f)) == 2
    rows = store.recent_chat("main", 0)
    assert rows[0]["created_at"] < rows[1]["created_at"]
    assert time.strftime("%Y-%m-%d", time.localtime(rows[0]["created_at"])) == "2026-09-19"
    assert "second line" in rows[1]["text"]