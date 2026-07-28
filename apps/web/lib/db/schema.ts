import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  uuid,
  integer,
  jsonb,
  unique,
  vector,
  primaryKey,
} from "drizzle-orm/pg-core";

// FR-1: 홀(예식 진행 공간). 홀 종속 엔티티(checklist_template_items 등)와 달리
// halls 자체는 홀 격리 대상이 아니라 그 기준이 되는 루트 엔티티다(AD-2).
export const halls = pgTable("halls", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // AC 3: 연결된 데이터 유무와 무관하게 삭제는 항상 비활성화로만 처리한다(하드 삭제 없음).
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// FR-2: 홀에 속한 체크리스트 템플릿의 "단계"(이름만). 별도의 checklist_templates
// 테이블은 만들지 않는다 — PRD §3 용어집상 "체크리스트 템플릿"은 한 홀의 이 단계들의
// 집합을 가리키는 개념어일 뿐 물리적 엔티티가 아니며, 스파인의 ERD도 HALL이
// CHECKLIST_TEMPLATE_ITEM을 직접 갖는 것으로 그린다(Story 1.3 Dev Notes [ASSUMPTION] 참고).
// AD-2의 홀 종속 엔티티라 hallId 필터링이 모든 리포지토리 쿼리에 강제된다.
// Story 5.5: description은 이 테이블에서 제거됐다 — 실제 확인 사항(제목·설명·영상)은
// 이제 자식 테이블 checklistTemplateItemChecks("체크리스트 항목")가 갖는다. 이 테이블은
// 순수하게 단계 이름 + 정렬 순서 + 계약 형태 조건(AD-9, 단계 단위 유지)만 갖는다.
export const checklistTemplateItems = pgTable(
  "checklist_template_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hallId: uuid("hall_id")
      .notNull()
      .references(() => halls.id),
    stepName: text("step_name").notNull(),
    sortOrder: integer("sort_order").notNull(),
    // AD-9: 계약 형태 조건부 포함 여부의 데이터 표현. Story 1.3은 컬럼만 확정하고 기본값
    // {}(모든 계약 형태에 포함)만 썼다 — 편집 UI와 실제 매칭은 Story 2.2에서 구현.
    // ceremonies.contractConditions와 동일한 키 셰이프(Record<string, boolean>)를
    // 가정한다(부분집합 매칭 @> 연산에 필요) — $type으로 명시해 unknown 캐스팅 없이 쓴다.
    applicableContractConditions: jsonb("applicable_contract_conditions")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // 동시 생성 시 같은 sortOrder가 중복 저장되는 것을 DB가 직접 막는다(코덱스 리뷰 5차
    // P1 반영). 마이그레이션에서 DEFERRABLE INITIALLY DEFERRED로 수기 조정 — moveAdjacent의
    // 스왑 UPDATE가 두 행의 값을 맞바꾸는 중간 상태에서 즉시 위반으로 걸리지 않게 하기 위함
    // (drizzle의 unique() 빌더는 deferrable을 지원하지 않아 생성된 SQL을 직접 수정함).
    unique("checklist_template_items_hall_id_sort_order_unique").on(
      table.hallId,
      table.sortOrder,
    ),
  ],
);

// Story 5.5(FR-15): 단계 안의 개별 확인 항목("체크리스트"). 제목은 필수, 설명·시연
// 영상은 선택. 실제 큐시트를 반영한 시드 데이터가 한 단계 안에 여러 독립적 확인
// 사항(조명 준비/사전 안내 등)을 담아야 해서 도입됐다 — 오퍼레이터가 실제로 체크하는
// 최소 단위는 이 테이블이고, checklistTemplateItems("단계")는 그룹핑 + 계약 형태
// 조건(AD-9) 필터링 단위로만 남는다. AD-2 홀 종속 엔티티라 hallId를 templateItemId를
// 거치지 않고 직접 저장한다(demo_videos/checklist_instances와 동일 원칙).
export const checklistTemplateItemChecks = pgTable(
  "checklist_template_item_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hallId: uuid("hall_id")
      .notNull()
      .references(() => halls.id),
    // onDelete cascade — 단계 삭제(하드 삭제, Story 1.3 정책)는 소속 체크리스트 항목도
    // 함께 삭제되는 것이 맞다(부모 없는 체크리스트 항목은 의미가 없다).
    templateItemId: uuid("template_item_id")
      .notNull()
      .references(() => checklistTemplateItems.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // checklist_template_items와 동일한 이유로 DEFERRABLE INITIALLY DEFERRED로 마이그레이션
    // SQL을 수기 조정한다 — moveAdjacent 스왑 중간 상태의 즉시 위반을 피하기 위함.
    unique("checklist_template_item_checks_template_item_id_sort_order_unique").on(
      table.templateItemId,
      table.sortOrder,
    ),
  ],
);

// FR-3: 체크리스트 항목에 연결된 시연 영상. AD-2가 명시하는 홀 종속 엔티티라 hall_id를
// checklist_template_item_checks를 거치지 않고 직접 저장한다(스파인 §57의 "스키마 확정,
// JOIN 대체 금지" 원칙을 checklist_instances와 동일하게 적용). 항목당 최대 1개(unique,
// Story 1.4 Dev Notes [ASSUMPTION] — ERD는 1:N이지만 재업로드는 교체로 처리).
// Story 5.5: 연결 대상이 단계(checklistTemplateItems)에서 체크리스트 항목
// (checklistTemplateItemChecks)으로 바뀌었다 — 영상은 이제 개별 체크리스트 항목에 붙는다.
export const demoVideos = pgTable(
  "demo_videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hallId: uuid("hall_id")
      .notNull()
      .references(() => halls.id),
    // onDelete cascade — 항목 삭제(하드 삭제, Story 1.3 정책)는 이 FK가 없으면
    // NO ACTION으로 막혀버린다(영상 첨부 전에는 되던 삭제가 첨부 후 실패, 코덱스 P1).
    checklistItemId: uuid("checklist_item_id")
      .notNull()
      .references(() => checklistTemplateItemChecks.id, { onDelete: "cascade" }),
    videoUrl: text("video_url").notNull(),
    fileName: text("file_name").notNull(),
    // 500MB 상한(PRD FR-3 [ASSUMPTION])은 integer 범위(최대 ~2.1GB) 안이라 bigint 불필요.
    fileSizeBytes: integer("file_size_bytes").notNull(),
    // 업로드 경로 구분 — Story 1.4 로컬/프로덕션 듀얼 스토리지 전략([ASSUMPTION]):
    // BLOB_READ_WRITE_TOKEN 부재 시 "local"(파일시스템 폴백), 있으면 "vercel-blob"(AD-4).
    storageProvider: text("storage_provider").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    unique("demo_videos_checklist_item_id_unique").on(table.checklistItemId),
  ],
);

// FR-4: 예식(hall·일시·계약 형태). 홀 종속 엔티티(AD-2) — hallId 직접 저장.
export const ceremonies = pgTable("ceremonies", {
  id: uuid("id").primaryKey().defaultRandom(),
  hallId: uuid("hall_id")
    .notNull()
    .references(() => halls.id),
  ceremonyAt: timestamp("ceremony_at").notNull(),
  // Story 5.3(FR-12): nullable — 폼은 필수 입력으로 처리하지만(action 레이어 검증),
  // 이 마이그레이션 이전에 생성된 기존 예식 데이터와의 하위 호환을 위해 컬럼 자체는
  // nullable로 둔다.
  groomName: text("groom_name"),
  brideName: text("bride_name"),
  // AD-9: 부분집합 매칭이 checklist_template_items.applicable_contract_conditions와
  // 대칭되는 셰이프를 요구하므로 동일하게 JSONB로 저장한다(정규화 규칙 테이블 대신,
  // AD-9 rationale 그대로). [ASSUMPTION] 키는 PRD §4.1 예시 그대로 두 개만 정의:
  // { requiresOfficiant?: boolean; hasAdditionalEvent?: boolean } — 부분집합 매칭
  // 알고리즘 자체는 Story 2.2(FR-5) 범위. 이 스토리는 값을 받아 저장만 한다.
  contractConditions: jsonb("contract_conditions")
    .$type<Record<string, boolean>>()
    .notNull()
    .default({}),
  // 예식 진행 상태 'upcoming' | 'ongoing' | 'done' — 오퍼레이터가 실행 화면의 예식
  // 시작/종료 버튼으로 직접 변경한다(2026-07-27 대표 지시, prototype RunScreen.js).
  // 시간 기반 추정이 아니다. user.role과 동일하게 pgEnum 대신 plain text + 앱 레이어
  // 검증(기존 컨벤션). 예정이 아닌 상태에서는 관리자 단 수정이 잠긴다.
  status: text("status").notNull().default("upcoming"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// FR-18(2026-07-27 대표 지시로 다중 배정으로 확장): 예식 1건에 담당 오퍼레이터 여러 명 —
// 프로토타입(WeddingScreen.js)의 assignees 배열과 동일 모델. Story 5.8의 단일 컬럼
// (ceremonies.assigned_operator_id)을 이 조인 테이블이 대체한다(마이그레이션 0019에서
// 기존 배정 데이터 이관). operator_id는 better-auth user.id라 uuid가 아닌 text.
// AD-2 홀 종속 엔티티 — hall_id를 ceremony JOIN 없이 직접 저장한다.
export const ceremonyAssignees = pgTable(
  "ceremony_assignees",
  {
    ceremonyId: uuid("ceremony_id")
      .notNull()
      .references(() => ceremonies.id, { onDelete: "cascade" }),
    operatorId: text("operator_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    hallId: uuid("hall_id")
      .notNull()
      .references(() => halls.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.ceremonyId, table.operatorId] })],
);

// FR-4: 예식 1건의 실행용 체크리스트 인스턴스. ERD상 CEREMONY 1:1 CHECKLIST_INSTANCE.
// AD-2(2026-07-24 adversarial review로 확정된 최종 룰) — ceremony→hall JOIN으로
// 대체하지 말고 hall_id를 이 테이블 자신의 컬럼으로 저장한다.
export const checklistInstances = pgTable(
  "checklist_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hallId: uuid("hall_id")
      .notNull()
      .references(() => halls.id),
    ceremonyId: uuid("ceremony_id")
      .notNull()
      .references(() => ceremonies.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("checklist_instances_ceremony_id_unique").on(table.ceremonyId),
  ],
);

// FR-4/5: 인스턴스에 조합된 체크리스트 항목들. PRD §3 용어집 — 인스턴스는 템플릿의
// "실행용 사본". stepName/title/description/sortOrder를 생성 시점에 스냅샷으로 복사
// 저장한다 — templateItemCheckId를 라이브 참조로 남겨 매번 JOIN하면 이후 관리자가
// 템플릿 항목을 수정/삭제할 때 이미 만들어진 예식의 체크리스트가 조용히 바뀌거나
// (Story 1.4의 FK 삭제 차단 버그와 같은 클래스로) 삭제가 막힌다. templateItemCheckId는
// onDelete: "set null"인 소프트 참조로만 남긴다.
// Story 5.5: 이 테이블의 한 행이 이제 "단계"가 아니라 "체크리스트 항목" 1개를 가리킨다
// (오퍼레이터가 실제로 체크하는 최소 단위가 바뀌었으므로). stepName은 표시용 텍스트로
// 유지하되, 그룹핑 키로는 쓰지 않는다 — 코덱스 리뷰 3차 P2: stepName은 유일함이
// 보장되지 않아(관리자가 같은 이름의 단계를 두 번 만들 수 있음) 텍스트로만 그룹핑하면
// 서로 다른 두 단계가 하나로 합쳐질 수 있었다. templateItemId(단계로의 소프트 참조,
// templateItemCheckId와 별개 — 체크리스트 항목이 아니라 그 부모 단계를 가리킴)를
// 안정적인 그룹핑 키로 저장한다(별도의 "인스턴스 단계" 테이블은 만들지 않는다 — 과설계 방지).
export const checklistInstanceItems = pgTable(
  "checklist_instance_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hallId: uuid("hall_id")
      .notNull()
      .references(() => halls.id),
    instanceId: uuid("instance_id")
      .notNull()
      .references(() => checklistInstances.id, { onDelete: "cascade" }),
    templateItemId: uuid("template_item_id").references(() => checklistTemplateItems.id, {
      onDelete: "set null",
    }),
    templateItemCheckId: uuid("template_item_check_id").references(
      () => checklistTemplateItemChecks.id,
      { onDelete: "set null" },
    ),
    // Story 5.8: 이 예식에만 존재하는 임시(ad-hoc) 단계를 만들 때(템플릿에 없는 단계) 그
    // 단계에 속한 항목들을 함께 그룹핑하기 위한 태그. templateItemId는 실제 템플릿
    // 단계에만 걸리므로 ad-hoc 단계는 이 값이 항상 null이라 그룹핑 키로 못 쓴다 — 진짜
    // FK가 아니라 순수 그룹핑 태그라 참조 무결성 제약을 걸지 않는다(같은 그룹의 첫 항목이
    // 생성될 때 새 uuid를 발급해 이후 항목들이 같은 값을 그대로 복사해 쓴다).
    adHocGroupRootId: uuid("ad_hoc_group_root_id"),
    stepName: text("step_name").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Story 2.2 코덱스 리뷰 P2: 재전송/두 탭 동시 제출로 같은 항목이 인스턴스에 중복
    // 추가되는 것을 막는다. templateItemCheckId가 NULL인 행(원본 삭제됨)끼리는 Postgres가
    // NULL을 서로 다른 값으로 취급해 이 제약에 걸리지 않는다 — 의도된 동작.
    unique(
      "checklist_instance_items_instance_id_template_item_check_id_unique",
    ).on(table.instanceId, table.templateItemCheckId),
    // 코덱스 리뷰 4차 P2: 관리자가 서로 다른 두 항목을 거의 동시에 addItem()하면 두
    // INSERT가 같은 max(sort_order)+1을 계산해 이 제약이 없으면 둘 다 그대로 성공,
    // 순서가 비결정적이 되고 같은 단계 항목이 비연속으로 흩어질 수 있었다. 위반 시
    // addItem()이 재시도(withConcurrencyRetry, template-item.ts와 동일 패턴)한다.
    // 코덱스 리뷰 6차 P1: checklist_template_items/checklist_template_item_checks의
    // 동류 제약과 마찬가지로 DEFERRABLE INITIALLY DEFERRED로 마이그레이션 SQL을 수기
    // 수정해야 한다(0013) — addItem()의 "밀기" UPDATE가 한 문장 안에서 여러 행의
    // sort_order를 +1씩 올릴 때, NOT DEFERRABLE이면 아직 갱신 전인 행과 일시적으로
    // 충돌한다(moveAdjacent 스왑과 동일한 클래스의 문제).
    unique("checklist_instance_items_instance_id_sort_order_unique").on(
      table.instanceId,
      table.sortOrder,
    ),
  ],
);

// FR-8/AD-8: 오퍼레이터가 예식 종료 후 남기는 자유 서술 피드백. `status`가
// 'confirmed'로 바뀌는 시점(Story 3.2 범위)에만 variable_case가 생성·임베딩된다 — 이
// 스토리는 'draft'만 만든다(안전 경계, PRD §6 Safety). AD-6: hallId는 격리용이 아니라
// 표시 태그로만 저장(검색/집계에서 홀 필터링하지 않음, Story 3.4에서 실제로 쓰임).
// AD-2가 명시하는 홀 종속 엔티티 목록(checklist_templates 등)에 feedback은 포함되지
// 않는다 — 리포지토리 레벨 hallId 격리 쿼리 대상이 아니다(서비스 레이어가
// ceremonyRepo.findById(hallId, ceremonyId)로 소속을 검증). templateItemId는
// checklistInstanceItems와 동일한 소프트 참조(onDelete: set null) + stepName 스냅샷
// 병행 패턴 — 단계가 나중에 삭제/개명돼도 피드백엔 원래 맥락이 남는다. 개인 실명 등
// 사용자 식별자 컬럼은 의도적으로 두지 않는다(NFR-5, AC 4) — "이어 쓰기"는 예식+단계
// 단위로만 이어진다.
export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hallId: uuid("hall_id")
      .notNull()
      .references(() => halls.id),
    ceremonyId: uuid("ceremony_id")
      .notNull()
      .references(() => ceremonies.id),
    templateItemId: uuid("template_item_id").references(() => checklistTemplateItems.id, {
      onDelete: "set null",
    }),
    stepName: text("step_name").notNull(),
    content: text("content").notNull().default(""),
    // 'draft' | 'confirmed' — user.role과 동일하게 pgEnum 대신 plain text + 앱 레이어
    // 검증(이 프로젝트 기존 컨벤션). confirmed로의 전환은 Story 3.2 범위.
    status: text("status").notNull().default("draft"),
    // Story 3.2(FR-9): 자동 구조화 초안 4필드. 구조화 실행 전에는 null/빈 배열이며,
    // content(원본 자연어)는 그대로 보존한다 — 구조화는 파생 데이터를 추가하는 것이지
    // 원본을 대체하지 않는다. outcome은 'well_handled' | 'mishandled'만 허용하되
    // status와 동일한 컨벤션으로 plain text + 서비스 레이어 검증.
    situation: text("situation"),
    outcome: text("outcome"),
    rationale: text("rationale"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // 예식 1건의 같은 단계에는 피드백이 최대 1건만 존재 — 재방문 시 "이어 쓰기"가
    // 자연스럽게 같은 행을 가리키게 하는 핵심 불변조건(AC 2). templateItemId가 NULL인
    // 행끼리는 Postgres가 서로 다른 값으로 취급해 이 제약에 걸리지 않는다
    // (checklist_instance_items와 동일하게 이미 검증된 동작).
    unique("feedback_ceremony_id_template_item_id_unique").on(
      table.ceremonyId,
      table.templateItemId,
    ),
  ],
);

// FR-9/AD-8: 확정(confirmed)된 피드백에서만 생성되는 변수 케이스 — 검색 인덱스의
// 실체. feedbackId를 unique FK로 걸어 ERD의 "0..1" 관계(FEEDBACK -> VARIABLE_CASE)를
// DB 레벨에서 강제한다(피드백 하나당 변수 케이스는 최대 1개). AD-6: hallId는 검색
// 격리 조건이 아니라 표시용 태그일 뿐이다 — pgvector 유사도 검색(Story 3.3/3.4)은
// 홀 필터 없이 사업체 전체를 대상으로 한다. embedding은 1024차원으로 고정
// (2026-07-28 벤더 교체 후 OpenAI text-embedding-3-large의 dimensions=1024 — 차원이
// 같아 스키마 무변경, lib/ai/adapters/embedding-response.ts의 EXPECTED_DIMENSIONS와
// 일치해야 한다) — 이 프로젝트 최초의 pgvector 컬럼이라 마이그레이션이
// CREATE EXTENSION vector를 함께 수행해야 한다.
export const variableCases = pgTable("variable_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  hallId: uuid("hall_id")
    .notNull()
    .references(() => halls.id),
  feedbackId: uuid("feedback_id")
    .notNull()
    .unique()
    .references(() => feedback.id),
  stepName: text("step_name").notNull(),
  situation: text("situation").notNull(),
  outcome: text("outcome").notNull(),
  rationale: text("rationale").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  embedding: vector("embedding", { dimensions: 1024 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  role: text("role").notNull(),
  // 로그인 식별자 — better-auth phone-number 플러그인이 관리(unique 필수, sign-in/sign-up
  // 경로는 email이 아니라 이 필드를 쓴다). email 컬럼은 better-auth 코어가 구조적으로
  // 요구해 남아있을 뿐 실제로 수집/노출하지 않는다.
  phoneNumber: text("phone_number").unique(),
  phoneNumberVerified: boolean("phone_number_verified").default(false).notNull(),
  // Story 5.4: better-auth 공식 admin 플러그인이 요구하는 필드(node_modules/better-auth/dist/
  // plugins/admin/schema.mjs와 필드명/타입 일치 필수) — 계정 비활성화(회원 관리)와 로그인 시
  // 자동 차단을 플러그인이 직접 처리하므로 커스텀 isActive 컬럼을 만들지 않는다.
  banned: boolean("banned").default(false).notNull(),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
