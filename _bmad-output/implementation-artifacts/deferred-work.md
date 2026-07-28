# Deferred Work

## Deferred from: code review of story-3-2-feedback-structuring-confirmation (2026-07-27)

- LLMPort.generate의 모델 선택이 responseSchema 유무로 암묵적으로 갈림(포트 추상화 우회 소지) — 스파인의 Sonnet/Haiku 모델 분리 근거와 일치하는 설계라 지금은 결함 아님, 3.3/3.4에서 structured+sonnet 조합이 필요해지면 재검토.
- Anthropic structured outputs 요청 형태에 대한 자동화된 벤더 계약 테스트 없음 — 벤더 실키 없이는 CI에서 검증 불가, Dev Notes에 이미 범위 밖으로 명시된 결정.
- LLM outcome 판단이 오퍼레이터 자기 서술에만 의존(대필/편향 가능성) — 오퍼레이터는 이미 updateStructuredFields로 outcome을 직접 편집할 수 있는 정당한 권한이 있어 새로운 보안 경계 침해는 아니지만, 다수 오퍼레이터의 교차 검증이 필요해지면 재검토.
- embedding 텍스트가 stepName/outcome을 포함하지 않아 3.3/3.4 검색 품질에 영향 가능 — 검색 구현 시(Story 3.3/3.4) 재검토.
- variable_cases.outcome에 DB CHECK 제약 없음 — feedback.status 등 기존 컬럼과 동일한 컨벤션(plain text + 앱 레이어 검증), 프로젝트 전체 컨벤션이 바뀌면 재검토.
- updateStructuredFields PATCH가 4필드 전체를 요구해 Task 8 원문("일부/전부 수정")과 문구가 다름 — 현재 UI가 4필드를 항상 함께 보내 실질적 기능 격차 없음, 부분 업데이트가 실제로 필요해지면 재검토.
- AD-6에 따라 variable_cases가 홀 간 검색 격리 없이 사업체 전체를 대상으로 함 — 스파인 AD-6에 이미 명시적으로 결정된 사항, PRD §11 Q7 대표 확인 시 재검토.
