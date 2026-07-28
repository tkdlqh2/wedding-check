# Deferred Work

## Deferred from: code review of story-3-2-feedback-structuring-confirmation (2026-07-27)

- LLMPort.generate의 모델 선택이 responseSchema 유무로 암묵적으로 갈림(포트 추상화 우회 소지) — 스파인의 Sonnet/Haiku 모델 분리 근거와 일치하는 설계라 지금은 결함 아님, 3.3/3.4에서 structured+sonnet 조합이 필요해지면 재검토.
- Anthropic structured outputs 요청 형태에 대한 자동화된 벤더 계약 테스트 없음 — 벤더 실키 없이는 CI에서 검증 불가, Dev Notes에 이미 범위 밖으로 명시된 결정.
- LLM outcome 판단이 오퍼레이터 자기 서술에만 의존(대필/편향 가능성) — 오퍼레이터는 이미 updateStructuredFields로 outcome을 직접 편집할 수 있는 정당한 권한이 있어 새로운 보안 경계 침해는 아니지만, 다수 오퍼레이터의 교차 검증이 필요해지면 재검토.
- embedding 텍스트가 stepName/outcome을 포함하지 않아 3.3/3.4 검색 품질에 영향 가능 — 3.3에서 재검토해 현행 유지로 결론(임베딩 대상 `${situation} ${rationale}`가 질의와 같은 의미 평면에 있고, stepName/outcome을 섞으면 상황 의미가 희석됨). 3.4도 임베딩 대상을 바꾸지 않았다. 다음 재검토 트리거는 실데이터 검수(SM-2 검수 세트) 시점.
- variable_cases.outcome에 DB CHECK 제약 없음 — feedback.status 등 기존 컬럼과 동일한 컨벤션(plain text + 앱 레이어 검증), 프로젝트 전체 컨벤션이 바뀌면 재검토.
- updateStructuredFields PATCH가 4필드 전체를 요구해 Task 8 원문("일부/전부 수정")과 문구가 다름 — 현재 UI가 4필드를 항상 함께 보내 실질적 기능 격차 없음, 부분 업데이트가 실제로 필요해지면 재검토.
- AD-6에 따라 variable_cases가 홀 간 검색 격리 없이 사업체 전체를 대상으로 함 — 스파인 AD-6에 이미 명시적으로 결정된 사항, PRD §11 Q7 대표 확인 시 재검토.

## Deferred from: story-3-4-evidence-based-response (2026-07-28)

- 실행 중 질의 유사도 임계값(`lib/services/query.ts::MIN_SIMILARITY = 0.5`)이 실데이터 없이 정해진 `[ASSUMPTION]` — 현 벤더(OpenAI `text-embedding-3-large` 1024차원)의 일반 코퍼스 기준선(≈0.45)에 도메인이 좁다는 점과 거짓 양성 비용이 더 크다는 점을 반영해 보수적으로 올려 잡은 값이다. OpenAI 키 투입 후 SM-2 검수 세트와 `query_no_match` 구조화 로그의 `topSimilarity` 분포로 재보정 필요. 게이트가 무력화되지 않도록 0.4~0.9 범위 회귀 테스트가 걸려 있다.
- `query_no_match` 로그를 집계하는 대시보드/알림 없음 — AD-10이 구조화 로깅까지만 정하고 알림 채널은 v1 범위 밖이라는 기존 결정과 동일. 임계값 재보정 시에는 Vercel 로그를 직접 조회해야 한다.
