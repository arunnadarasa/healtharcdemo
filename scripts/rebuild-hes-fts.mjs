#!/usr/bin/env node
/**
 * Rebuild SQLite FTS5 index from hes_ae / hes_op / hes_apc (e.g. after legacy ingest).
 * Usage: node scripts/rebuild-hes-fts.mjs
 */
import { getHesDb, rebuildHesFtsFromBaseTables } from '../server/neighbourhood/hesDb.js'

getHesDb()
const stats = rebuildHesFtsFromBaseTables()
console.log('FTS rebuilt. Stats:', stats)
