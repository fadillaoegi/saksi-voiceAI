import type { Session } from '../entities/session'
import type { ComplianceReport, Obligation } from '../entities/compliance'

/** Kontrak yang dipakai use case. Implementasinya ada di infrastructure. */
export interface SessionRepository {
  start(officerId: string, productId: string): Promise<Session>
  end(sessionId: string): Promise<Session>
  report(sessionId: string): Promise<ComplianceReport>
  obligations(): Promise<Obligation[]>
}
