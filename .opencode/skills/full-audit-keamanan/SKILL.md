---
name: full-audit-keamanan
description: Comprehensive security auditing, code vulnerability scanning, and threat surface mapping.
metadata:
  swanwright_original_id: swanwright__full-audit-keamanan
  swanwright_original_name: Full Audit Keamanan
---

# Full Security Audit Skill

## Audit Methodology

1. **Static Analysis & Surface Mapping:**
   - Scan for secrets, credentials, and API keys.
   - Review dependency manifests for known CVEs.
   - Trace untrusted input from API endpoints through data validation layers to database/shell sinks.

2. **OWASP Top 10 Verification:**
   - Injection (SQLi, Command Injection, XSS, SSRF).
   - Broken Authentication & Session Management.
   - Sensitive Data Exposure.
   - Broken Access Control.

3. **NFR11 Pentest Separation:**
   - White-box code auditing and vulnerability mapping do NOT require offensive C2 infrastructure.
   - If intrusive exploit verification is required, halt and demand `--pentest` flag and signed consent documentation.
