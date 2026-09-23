from __future__ import absolute_import, unicode_literals

import os
import sys
from pathlib import Path

# Guard against this file shadowing the installed ``celery`` package: with
# ``PYTHONPATH=orbit_app`` (or cwd == orbit_app/) the bare name ``celery``
# would otherwise resolve to THIS file instead of the third-party package.
# We find the real package on the remaining path (ignoring entries that
# expose this file) and load it by path, then alias this module to it so
# ``import celery`` / ``from celery import Celery`` works from anywhere.
_this_file = Path(__file__).resolve()
_real_spec = None
for _entry in list(sys.path):
    try:
        _base = Path(_entry or '.').resolve()
    except Exception:
        continue
    if (_base / 'celery.py') == _this_file:
        continue  # this very file shadowing as top-level ``celery``
    if (_base / 'orbit_app' / 'celery.py') == _this_file:
        continue  # this package shadowing as top-level ``celery``
    _candidate = _base / 'celery' / '__init__.py'
    if _candidate.is_file():
        import importlib.util as _ilu
        _real_spec = _ilu.spec_from_file_location(
            'celery', str(_candidate),
            submodule_search_locations=[str(_base / 'celery')])
        break
if _real_spec is None:  # pragma: no cover - celery must be installed
    raise ImportError('installed celery package not found on sys.path')

_real_module = _ilu.module_from_spec(_real_spec)
sys.modules['celery'] = _real_module
_real_spec.loader.exec_module(_real_module)
del _entry, _this_file, _real_spec, _candidate, _base
try:
    del _ilu
except Exception:
    pass
del _real_module

from celery import Celery  # noqa: E402  (import after sys.path guard)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'orbit_app.settings')

app = Celery('orbit_app')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
