declare module "better-sqlite3" {
  namespace Database {
    interface Statement<Result = unknown> {
      run(params?: unknown): unknown;
      get(...params: unknown[]): Result;
      all(...params: unknown[]): Result[];
    }

    interface Transaction {
      (): void;
    }

    interface Database {
      pragma(source: string): unknown;
      exec(source: string): this;
      close(): void;
      prepare<Result = unknown>(source: string): Statement<Result>;
      transaction(fn: () => void): Transaction;
    }
  }

  interface DatabaseOptions {
    readonly?: boolean;
  }

  interface DatabaseConstructor {
    new (path?: string, options?: DatabaseOptions): Database.Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
