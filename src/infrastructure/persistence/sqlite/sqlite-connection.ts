import { injectable } from 'inversify';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type SqliteStatementBindings = Record<string, unknown>;

@injectable()
export class SqliteConnection {
  private readonly db: Database.Database;

  public constructor(filePath: string) {
    const resolvedFilePath = path.resolve(filePath);
    const directoryPath = path.dirname(resolvedFilePath);

    fs.mkdirSync(directoryPath, { recursive: true });

    this.db = new Database(resolvedFilePath);
    this.db.pragma('journal_mode = WAL');
  }

  public exec(sql: string): void {
    this.db.exec(sql);
  }

  public run(sql: string, bindings: SqliteStatementBindings = {}): void {
    this.db.prepare(sql).run(bindings);
  }

  public get<T>(sql: string, bindings: SqliteStatementBindings = {}): T | undefined {
    return this.db.prepare(sql).get(bindings) as T | undefined;
  }

  public all<T>(sql: string, bindings: SqliteStatementBindings = {}): T[] {
    return this.db.prepare(sql).all(bindings) as T[];
  }
}
