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
    // AD-9: 계약 형태 조건부 포함 여부의 데이터 표현. 이 스토리는 컬럼만 확정하고 기본값
    // {}(모든 계약 형태에 포함)만 쓴다 — 편집 UI는 Epic 2까지 미룬다.
    applicableContractConditions: jsonb("applicable_contract_conditions")
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
    templateItemId: uuid("template_item_id")
      .notNull()
      .references(() => checklistTemplateItems.id),
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
