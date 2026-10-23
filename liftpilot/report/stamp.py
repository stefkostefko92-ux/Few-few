"""What every PDF of report/ carries besides its pages: its language (the documents are in Italian: /Lang it-IT in the
catalogue) and its date — the record's, given as meta.created (ISO 8601) by the caller, so that every download of a
record gives the same bytes. ReportLab (3.6 and later) dates the file and seeds its /ID from SOURCE_DATE_EPOCH: a fixed
date, not its invariant mode, which writes 1 January 2000. Without meta.created the file is dated now.
"""
import os
from datetime import datetime

LANG = "it-IT"


def date_from(meta):
    """Dates the PDF made next in this process at meta['created'], when given."""
    created = meta.get("created")
    if created:
        at = datetime.fromisoformat(created.replace("Z", "+00:00"))
        os.environ["SOURCE_DATE_EPOCH"] = str(int(at.timestamp()))
