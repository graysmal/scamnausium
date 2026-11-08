import { analyze, isLinkable, type ExternalSource } from '../../../spacetimedb/src/domain';
import type { DbConnection } from '../../../src/module_bindings/index';

export type IngestOutcome = 'created' | 'resumed' | 'duplicate';
export interface ExternalReport { eventId: string; source: ExternalSource; summary: string }

/** Minimal surface of the generated connection used here; lets tests pass a fake. */
export interface IngestConnection {
  reducers: Pick<DbConnection['reducers'], 'reportExternalIncident' | 'analyzeIncident' | 'linkIncident'>;
  db: { incidents: { id: { find(id: string): { status: string } | null | undefined } } };
}

/**
 * Serializes provider ingestion so report -> analyze -> link run in order.
 * Idempotent and resumable: the incident primary key is a hash of the provider event id, and a replay
 * of a partially processed event (e.g. gateway crashed after report) continues from the stored status.
 */
export function createIngestor(conn: IngestConnection) {
  let chain: Promise<unknown> = Promise.resolve();
  async function run(report: ExternalReport): Promise<IngestOutcome> {
    const linkable = isLinkable(analyze(report.summary).key);
    const existing = conn.db.incidents.id.find(report.eventId);
    if (existing && (existing.status !== 'reported' && !(existing.status === 'analyzed' && linkable))) return 'duplicate';
    if (!existing) await conn.reducers.reportExternalIncident(report);
    if (!existing || existing.status === 'reported') await conn.reducers.analyzeIncident({ incidentId: report.eventId });
    if (linkable) await conn.reducers.linkIncident({ incidentId: report.eventId });
    return existing ? 'resumed' : 'created';
  }
  return {
    ingest(report: ExternalReport): Promise<IngestOutcome> {
      const next = chain.then(() => run(report));
      chain = next.catch(() => undefined);
      return next;
    },
  };
}
