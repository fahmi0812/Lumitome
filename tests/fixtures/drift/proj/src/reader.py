import logging
from pathlib import Path

log = logging.getLogger(__name__)


def read(p):
    log.info("membaca %s", p)
    return Path(p).read_text()
