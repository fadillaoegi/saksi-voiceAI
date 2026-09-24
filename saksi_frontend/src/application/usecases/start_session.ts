import type { SessionRepository } from '../../domain/repositories/session_repository'
import type { Session } from '../../domain/entities/session'

export class StartSessionUseCase {
  private readonly repo: SessionRepository

  constructor(repo: SessionRepository) {
    this.repo = repo
  }

  async execute(officerId: string, productId: string): Promise<Session> {
    if (!officerId.trim()) throw new Error('ID petugas wajib diisi')
    return this.repo.start(officerId, productId)
  }
}
