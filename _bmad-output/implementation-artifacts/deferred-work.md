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

- 실행 중 질의 유사도 임계값(`lib/services/query.ts::MIN_SIMILARITY = 0.42`)은 실제 OpenAI 임베딩 호출로 측정해 정했지만(관련 0.500~0.674 / 무관 0.183~0.366, 문서 3건×질의 8건) 표본이 작다 — 실제 피드백이 쌓이면 SM-2 검수 세트와 `query_no_match` 로그의 `topSimilarity` 분포로 재보정 필요. 게이트가 무력화되지 않도록 0.4~0.9 범위 회귀 테스트가 걸려 있다.
- **NFR-4의 예시 쌍을 임베딩 검색만으로는 만족할 수 없음(측정으로 확인)** — PRD가 명시한 "주례자가 순서를 바꿈" ≒ "목사님이 애드리브함"은 실측 유사도 0.277로, 무관 질의(주차장 0.366)보다 낮다. 어휘가 완전히 어긋나는 동의 관계는 어떤 임계값을 잡아도 무관 사례를 함께 들이지 않고는 매칭되지 않는다. 후보: (a) 확정 시 LLM으로 동의어·별칭을 케이스 텍스트에 덧붙여 임베딩, (b) 하이브리드 검색(pgvector + 전문검색), (c) 질의 확장. v1 범위 밖 — 실제 케이스가 쌓인 뒤 SM-1/SM-2 실측으로 필요성 판단.
- 변수 케이스 임베딩 텍스트에 단계명·태그를 포함하면 관련 질의 유사도가 소폭(+0.01~0.02) 오르고 무관 질의는 소폭(-0.03) 내려가는 것을 실측 — 분리폭이 조금 개선되지만 위 NFR-4 한계를 해소하지는 못한다. 임베딩 텍스트 구성은 Story 3.2 경로(`lib/services/feedback.ts`)이며 기존 케이스 재임베딩이 필요하므로 별도 스토리로 다룬다.
- `query_no_match` 로그를 집계하는 대시보드/알림 없음 — AD-10이 구조화 로깅까지만 정하고 알림 채널은 v1 범위 밖이라는 기존 결정과 동일. 임계값 재보정 시에는 Vercel 로그를 직접 조회해야 한다.
