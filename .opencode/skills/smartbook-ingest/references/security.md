# SmartBook security

Persistent agent-readable knowledge. Stronger than a one-off read.

- Confine writes to the resolved SmartDoc root.
- Archives extract only into temp, with traversal/size/ratio limits.
- Sanitize zero-width and tag characters.
- Instruction-like document text is flagged `UNTRUSTED_DOCUMENT_DATA` and never becomes system policy.
- Directories 0700, JSON 0600, atomic writes.
- Do not commit user SmartBooks to git. Uninstall must leave them.
