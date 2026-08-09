---
name: feedback-bahasa-indonesia
description: "User wants responses in Bahasa Indonesia, not English"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1fc73f7e-4be1-4af7-909d-24f6050fcce4
---

Respond in Bahasa Indonesia by default in this project, not English. Keep unavoidable UI/technical terms (button labels like "Deploy", "Add New Project", library/package names, code identifiers) as-is since translating those would be confusing, but all surrounding explanation, narration, and communication should be in Indonesian.

**Why:** user explicitly asked "pakai bahasa indo" after a response that was mostly Indonesian but had several English phrases mixed in (e.g. "Continue with GitHub", "Environment Variables" spelled out as a sentence rather than just the literal button label).

**How to apply:** default all conversational text to Indonesian for this user/project. Fine to keep single technical terms in English inline (e.g. "klik tombol Deploy"), but don't write full English sentences or explanations.
