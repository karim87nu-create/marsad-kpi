// Node: imports the old server's database file (opened read-only, never modified). See import-convert.js.
import Database from 'better-sqlite3';
import { convertOld, HEADER } from './import-convert.js';

function importOldDatabase(target, oldPath, options) {
  const old = new Database(oldPath, { readonly: true, fileMustExist: true });
  try { return convertOld(target, old, options); } finally { old.close(); }
}

export { importOldDatabase, HEADER };
