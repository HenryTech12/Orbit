# Each table lives in its own sub-package; import them here so Django registers them.
from orbitbackend.messages.models import Message  # noqa: F401
from orbitbackend.chunks.models import Chunk  # noqa: F401
from orbitbackend.classifications.models import Classification  # noqa: F401
from orbitbackend.topics.models import Topic  # noqa: F401
from orbitbackend.topics_history.models import TopicHistory  # noqa: F401
from orbitbackend.action_items.models import ActionItem  # noqa: F401
