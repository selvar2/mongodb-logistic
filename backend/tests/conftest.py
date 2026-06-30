"""Pytest fixtures / path setup for the backend test suite."""
import sys
from pathlib import Path

# ensure `import app...` works when running pytest from anywhere
BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
