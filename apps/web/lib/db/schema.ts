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

// FR-2: 홀에 속한 체크리스트 항목(단계명·설명). 별도의 checklist_templates 테이블은
// 만들지 않는다 — PRD §3 용어집상 "체크리스트 템플릿"은 한 홀의 이 항목들의 집합을
// 가리키는 개념어일 뿐 물리적 엔티티가 아니며, 스파인의 ERD도 HALL이 CHECKLIST_TEMPLATE_ITEM을
// 직접 갖는 것으로 그린다(Story 1.3 Dev Notes [ASSUMPTION] 참고). AD-2의 홀 종속 엔티티라
// hallId 필터링이 모든 리포지토리 쿼리에 강제된다.
export const checklistTemplateItems = pgTable(
  "checklist_template_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hallId: uuid("hall_id")
      .notNull()
      .references(() => halls.id),
    stepName: text("step_name").notNull(),
    description: text("description"),
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

// FR-3: 체크리스트 항목에 연결된 시연 영상. AD-2가 명시하는 홀 종속 엔티티라 hall_id를
// checklist_template_items를 거치지 않고 직접 저장한다(스파인 §57의 "스키마 확정,
// JOIN 대체 금지" 원칙을 checklist_instances와 동일하게 적용). 항목당 최대 1개(unique,
// Story 1.4 Dev Notes [ASSUMPTION] — ERD는 1:N이지만 재업로드는 교체로 처리).
export const demoVideos = pgTable(
  "demo_videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hallId: uuid("hall_id")
      .notNull()
      .references(() => halls.id),
    // onDelete cascade — 항목 삭제(하드 삭제, Story 1.3 정책)는 이 FK가 없으면
    // NO ACTION으로 막혀버린다(영상 첨부 전에는 되던 삭제가 첨부 후 실패, 코덱스 P1).
    templateItemId: uuid("template_item_id")
      .notNull()
      .references(() => checklistTemplateItems.id, { onDelete: "cascade" }),
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
    unique("demo_videos_template_item_id_unique").on(table.templateItemId),
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

// FR-4/5: 인스턴스에 조합된 항목들. PRD §3 용어집 — 인스턴스는 템플릿의 "실행용 사본".
// stepName/description/sortOrder를 생성 시점에 스냅샷으로 복사 저장한다 — templateItemId를
// 라이브 참조로 남겨 매번 JOIN하면 이후 관리자가 템플릿 항목을 수정/삭제할 때 이미 만들어진
// 예식의 체크리스트가 조용히 바뀌거나(Story 1.4의 FK 삭제 차단 버그와 같은 클래스로) 삭제가
// 막힌다. templateItemId는 onDelete: "set null"인 소프트 참조로만 남긴다.
export const checklistInstanceItems = pgTable("checklist_instance_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  hallId: uuid("hall_id")
    .notNull()
    .references(() => halls.id),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => checklistInstances.id, { onDelete: "cascade" }),
  templateItemId: uuid("template_item_id").references(
    () => checklistTemplateItems.id,
    { onDelete: "set null" },
  ),
  stepName: text("step_name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull(),
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
