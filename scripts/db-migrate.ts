import { resolve } from 'node:path';
import { applyMigrations, openDatabase } from '@releaseproof/core';

const database = openDatabase(process.env.DATABASE_PATH ?? resolve('var/releaseproof.sqlite'));
try {
  const applied = applyMigrations(database, resolve('migrations'));
  process.stdout.write(`${applied.length === 0 ? 'No pending migrations.' : `Applied: ${applied.join(', ')}`}\n`);
} finally {
  database.close();
}
