import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Client, type QueryResultRow } from "pg";

/**
 * 以真實 PostgreSQL 執行 RLS 測試。
 * 需要環境變數 TEST_DATABASE_URL 指向「可建立資料庫」的 superuser 連線，
 * 例如 postgres://postgres@127.0.0.1:54322/postgres
 * 每次測試建立獨立暫存資料庫，套用 Supabase 模擬層 + 全部 migrations，結束後刪除。
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const ROOT = join(__dirname, "..", "..", "supabase");

export class TestDb {
  private admin!: Client;
  db!: Client;
  private dbName = `rea_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  async setup() {
    this.admin = new Client({ connectionString: TEST_DATABASE_URL });
    await this.admin.connect();
    await this.admin.query(`create database ${this.dbName}`);

    const url = new URL(TEST_DATABASE_URL!);
    url.pathname = `/${this.dbName}`;
    this.db = new Client({ connectionString: url.toString() });
    await this.db.connect();

    await this.db.query(readFileSync(join(ROOT, "tests", "supabase_shim.sql"), "utf8"));
    const migrations = readdirSync(join(ROOT, "migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of migrations) {
      await this.db.query(readFileSync(join(ROOT, "migrations", file), "utf8"));
    }
  }

  async teardown() {
    await this.db?.end();
    if (this.admin) {
      await this.admin.query(`drop database if exists ${this.dbName} with (force)`);
      await this.admin.end();
    }
  }

  /** 以 superuser 執行（模擬資料準備，不受 RLS） */
  async sql<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
    const res = await this.db.query<T>(text, params);
    return res.rows;
  }

  async createUser(email: string): Promise<string> {
    const [row] = await this.sql<{ id: string }>(
      "insert into auth.users (email) values ($1) returning id",
      [email],
    );
    return row.id;
  }

  /**
   * 以指定角色（authenticated / anon / service_role）與 JWT sub 執行，
   * 等同 Supabase PostgREST 對每個請求所做的事。失敗時會 rollback。
   */
  async as<T>(
    who: { role: "authenticated" | "anon" | "service_role"; sub?: string },
    fn: (q: <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<R[]>) => Promise<T>,
  ): Promise<T> {
    await this.db.query("begin");
    try {
      const claims = JSON.stringify(who.sub ? { sub: who.sub, role: who.role } : { role: who.role });
      await this.db.query("select set_config('request.jwt.claims', $1, true)", [claims]);
      await this.db.query(`set local role ${who.role}`);
      const result = await fn(async (text, params = []) => (await this.db.query(text, params)).rows);
      await this.db.query("commit");
      return result;
    } catch (err) {
      await this.db.query("rollback");
      throw err;
    }
  }

  asUser<T>(sub: string, fn: (q: Query) => Promise<T>) {
    return this.as<T>({ role: "authenticated", sub }, fn);
  }
}

export type Query = <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<R[]>;
