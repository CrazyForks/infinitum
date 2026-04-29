# Issue Tracker

Forge Loop can read from and write to an issue tracker during issue intake and triage.

## Tracker

| Field | Value |
| --- | --- |
| Type | local markdown |
| GitHub Repository | N/A |
| Local Issue Directory | `tasks/quick/` or `specs/requirements/` |

## Rules

- If the user provides a GitHub Issue URL or `#123`, fetch the full issue body, comments, labels, and state when the GitHub CLI or connector is available.
- If GitHub access is unavailable, record the issue reference and ask for the missing body/comments only when they affect scope, acceptance, security, data, or permissions.
- Local markdown issues may be converted into Quick tasks or Feature Iteration requirements.
- Do not close, relabel, or comment on external issues unless the user explicitly asks.

