// src/utils/db.ts
/**
 * Utility functions for working with D1 database
 */

/**
 * Safely converts a value to a JSON string
 *
 * @param value Value to stringify
 * @returns JSON string or empty object string
 */
export function toJsonString(value: any): string {
  if (value === null || value === undefined) {
    return "{}";
  }

  try {
    if (typeof value === "string") {
      // Check if it's already a JSON string
      JSON.parse(value);
      return value;
    }

    return JSON.stringify(value);
  } catch (error) {
    // If parsing fails, stringify it
    try {
      return JSON.stringify(value);
    } catch (e) {
      // If that fails too, return empty object
      return "{}";
    }
  }
}

/**
 * Safely parses a JSON string
 *
 * @param jsonString JSON string to parse
 * @param defaultValue Default value if parsing fails
 * @returns Parsed object or default value
 */
export function parseJsonSafe<T = any>(
  jsonString: string | null | undefined,
  defaultValue: T,
): T {
  if (!jsonString) {
    return defaultValue;
  }

  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    return defaultValue;
  }
}

/**
 * Generate a SQL SET clause from an object
 *
 * @param obj Object with column values
 * @param exclude Keys to exclude
 * @returns Object with SQL SET clause and values array
 */
export function generateSetClause(
  obj: Record<string, any>,
  exclude: string[] = [],
): { setClause: string; values: any[] } {
  const entries = Object.entries(obj).filter(([key]) => !exclude.includes(key));
  const setClause = entries.map(([key]) => `${key} = ?`).join(", ");
  const values = entries.map(([_, value]) => value);

  return { setClause, values };
}

/**
 * Generate placeholders for SQL VALUES clause
 *
 * @param count Number of placeholders
 * @returns String of comma-separated placeholders
 */
export function generatePlaceholders(count: number): string {
  return Array(count).fill("?").join(", ");
}

/**
 * Safely bind SQL parameters, handling undefined values
 *
 * @param statement D1 prepared statement
 * @param params Parameters to bind
 * @returns Bound D1 prepared statement
 */
export function safeBind(
  statement: D1PreparedStatement,
  params: any[],
): D1PreparedStatement {
  // Replace undefined values with null
  const safeParams = params.map((p) => (p === undefined ? null : p));
  return statement.bind(...safeParams);
}

/**
 * Create a transaction function for D1
 *
 * @param db D1 database
 * @returns Transaction executor function
 */
export function createTransaction(db: D1Database) {
  return async function transaction<T>(
    callback: (txn: {
      execute: (sql: string, params?: any[]) => Promise<D1Result>;
    }) => Promise<T>,
  ): Promise<T> {
    // Start transaction
    await db.exec("BEGIN TRANSACTION");

    try {
      // Create transaction object
      const txn = {
        execute: async (sql: string, params: any[] = []) => {
          const stmt = db.prepare(sql);
          return safeBind(stmt, params).run();
        },
      };

      // Run callback with transaction
      const result = await callback(txn);

      // Commit transaction
      await db.exec("COMMIT");

      return result;
    } catch (error) {
      // Rollback transaction on error
      await db.exec("ROLLBACK");
      throw error;
    }
  };
}

/**
 * Get the first row from a D1 result or null
 *
 * @param result D1 result
 * @returns First row or null
 */
export function getFirstRow<T = any>(result: D1Result): T | null {
  if (!result || !result.results || result.results.length === 0) {
    return null;
  }

  return result.results[0] as T;
}
