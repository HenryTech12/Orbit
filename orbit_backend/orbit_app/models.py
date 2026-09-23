# Each table lives in its own sub-package; import them here so Django registers them.
from orbit_app.messages.models import Message  # noqa: F401
from orbit_app.chunks.models import Chunk  # noqa: F401
from orbit_app.classifications.models import Classification  # noqa: F401
from orbit_app.topics.models import Topic  # noqa: F401
from orbit_app.topics_history.models import TopicHistory  # noqa: F401
from orbit_app.action_items.models import ActionItem  # noqa: F401
