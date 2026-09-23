"""Core services package: hybrid search + grounded copilot responder."""

__all__ = ["hybrid_search", "generate_grounded_response"]


def __getattr__(name: str):
    if name == "hybrid_search":
        from orbit_app.core.services.hybrid_search import hybrid_search
        return hybrid_search
    if name == "generate_grounded_response":
        from orbit_app.core.services.responder import generate_grounded_response
        return generate_grounded_response
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
