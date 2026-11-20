import { createHash } from 'node:crypto'
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { AgentJournalRenderItem } from '../../../shared/agent-session/journal/agent-session-journal-types'
import { openJournalDomainDatabase } from './database/journal-domain-database'
import { runJournalTransaction } from './database/journal-database'
import { writeJournalDomainCurrentItem } from './journal-domain-current-item'
import { readJournalDomainItems } from './journal-sql-item-reads'
import {
  readJournalDomainClientForms,
  readJournalDomainItemDetail
} from './journal-domain-item-presentation'
import { JOURNAL_STORED_OUTPUT_WRITES } from './journal-stored-output'

const FIXTURE = join(__dirname, 'zz-downgrade-fixture')
const target = { sessionId: 'chat', epoch: 'epoch' }
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const head = (item: AgentJournalRenderItem | undefined) =>
  item?.body.kind === 'tool-call' ? (item.body.output?.head ?? '') : ''

it('1.4.263 opens, reads, rewrites and copies outputs a newer build stored compressed', () => {
  expect(JOURNAL_STORED_OUTPUT_WRITES).toBe(false)
  const { expected, stored } = JSON.parse(readFileSync(join(FIXTURE, 'expected.json'), 'utf8'))
  const dir = mkdtempSync(join(tmpdir(), 'v263-downgrade-'))
  try {
    copyFileSync(join(FIXTURE, 'agent-session-domain.db'), join(dir, 'agent-session-domain.db'))
    const opened = openJournalDomainDatabase(join(dir, 'agent-session-domain.db'))
    expect(opened.readOnly).toBe(false)
    const db = opened.db
    expect(stored.length).toBe(2)
    const read = () => {
      const result = readJournalDomainItems(db, target, {
        kind: 'items-by-kind',
        kinds: ['tool-call'],
        afterOrdinal: 0,
        limit: 10
      })
      return result.kind === 'items-by-kind' ? result.items : []
    }
    const items = read()
    expect(items.map((item) => item.itemId).sort()).toEqual(Object.keys(expected).sort())
    for (const item of items) {
      expect(sha(head(item))).toBe(expected[item.itemId])
      expect(item.body).toMatchObject({ output: { truncated: false } })
      expect(sha(head(readJournalDomainItemDetail(db, target, item.itemId)!))).toBe(
        expected[item.itemId]
      )
    }
    const client = readJournalDomainClientForms(db, target, Object.keys(expected))
    expect(client.size).toBe(2)

    // A later revision and a copy written by 1.4.263 from its own read keep every byte.
    for (const item of items) {
      runJournalTransaction(db, () => {
        writeJournalDomainCurrentItem(db, target, {
          item: { ...item, revision: item.revision + 1 },
          hidden: false,
          ownerFence: 1
        })
        writeJournalDomainCurrentItem(db, target, {
          item: { ...item, itemId: `${item.itemId}-copy`, sequence: item.sequence + 100 },
          hidden: false,
          ownerFence: 1
        })
      })
    }
    for (const item of read()) {
      expect(sha(head(item))).toBe(expected[item.itemId.replace(/-copy$/, '')])
    }
    db.close()
    console.log(`DOWNGRADE-READ ok items=${read.length} rows=${stored.length}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
