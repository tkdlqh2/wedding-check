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
  // AD-9: 부분집합 매칭이 checklist_template_items.applicable_contract_conditions와
  // 대칭되는 셰이프를 요구하므로 동일하게 JSONB로 저장한다(정규화 규칙 테이블 대신,
  // AD-9 rationale 그대로). [ASSUMPTION] 키는 PRD §4.1 예시 그대로 두 개만 정의:
  // { requiresOfficiant?: boolean; hasAdditionalEvent?: boolean } — 부분집합 매칭
  // 알고리즘 자체는 Story 2.2(FR-5) 범위. 이 스토리는 값을 받아 저장만 한다.
  contractConditions: jsonb("contract_conditions")
    .$type<Record<string, boolean>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

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
    unique("checklist_instance_items_instance_id_sort_order_unique").on(
      table.instanceId,
      table.sortOrder,
    ),
  ],
);

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
