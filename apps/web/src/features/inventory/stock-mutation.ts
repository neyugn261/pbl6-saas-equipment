import { ApiError, api } from '../../api/client'
import { getSessionGeneration } from '../../auth/session'

export type StockRequest = {
  readonly mode: 'RECEIVE' | 'ADJUST' | 'ISSUE' | 'RETURN'
  readonly path: string
  readonly body: Readonly<Record<string, string>>
}
type Intent = StockRequest & { key: string }

function validIntent(value: unknown): value is Intent {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Intent>
  const paths = {
    RECEIVE: /^\/stock-transactions\/receive$/,
    ADJUST: /^\/stock-transactions\/adjust$/,
    ISSUE: /^\/work-orders\/[^/]+\/parts$/,
    RETURN: /^\/work-order-parts\/[^/]+\/return$/,
  }
  return typeof item.key === 'string' && /^[\da-f-]{36}$/i.test(item.key)
    && typeof item.mode === 'string' && Object.hasOwn(paths, item.mode)
    && typeof item.path === 'string' && paths[item.mode].test(item.path)
    && Boolean(item.body && typeof item.body === 'object' && !Array.isArray(item.body)
      && Object.values(item.body).every((value) => typeof value === 'string'))
}

// One unresolved stock intent per tab and tenant/user. Persist BEFORE sending so
// navigation/reload cannot turn a lost response into a fresh stock movement.
export class StockMutation {
  private readonly storageKey: string
  private readonly generation: number
  private intent: Intent | null = null
  private running = false
  readonly storageError: string

  constructor(scope: string, generation: number) {
    this.storageKey = `pbl6.inventory.intent.${encodeURIComponent(scope)}`
    this.generation = generation
    let error = ''
    try {
      const raw = sessionStorage.getItem(this.storageKey)
      if (raw !== null) {
        const saved: unknown = JSON.parse(raw)
        if (!validIntent(saved)) throw new Error('Invalid saved stock intent')
        this.intent = saved
      }
    } catch {
      error = 'Không đọc được giao dịch đang chờ. Kiểm tra lịch sử kho và dữ liệu của tab trước khi tiếp tục.'
    }
    this.storageError = error
  }

  get pending(): Readonly<Intent> | null { return this.intent }

  private assertSession() {
    if (this.generation !== getSessionGeneration())
      throw new Error('Phiên đăng nhập đã thay đổi. Tải lại dữ liệu kho.')
  }

  private clear(key: string) {
    this.assertSession()
    if (this.intent?.key !== key) return
    // A response from a page that was left open must not erase a newer intent
    // created after another page already recovered this one.
    const raw = sessionStorage.getItem(this.storageKey)
    if (raw !== null) {
      const stored: unknown = JSON.parse(raw)
      if (!validIntent(stored)) throw new Error('Không đọc được giao dịch đang chờ.')
      if (stored.key === key) sessionStorage.removeItem(this.storageKey)
    }
    this.intent = null
  }

  async execute(request?: StockRequest) {
    this.assertSession()
    if (this.storageError) throw new Error(this.storageError)
    if (this.running) throw new Error('Đang xử lý giao dịch kho.')
    if (request && this.intent) throw new Error('Cần xác nhận giao dịch đang chờ trước khi tạo giao dịch khác.')
    const retry = Boolean(this.intent)
    if (request) {
      const intent = { ...request, body: { ...request.body }, key: crypto.randomUUID() }
      // If storage is unavailable, fail before the HTTP mutation starts.
      sessionStorage.setItem(this.storageKey, JSON.stringify(intent))
      this.intent = intent
    }
    const intent = this.intent
    if (!intent) throw new Error('Không có giao dịch đang chờ để thử lại.')
    this.running = true
    try {
      await api.inventory(intent.path, {
        method: 'POST', headers: { 'Idempotency-Key': intent.key }, body: { ...intent.body },
      })
      this.clear(intent.key)
    } catch (cause) {
      this.assertSession()
      // A first, explicit rejection permits correction. Once the outcome was
      // unknown, a later 403/404 cannot prove the earlier POST did not commit.
      if (!retry && cause instanceof ApiError && [400, 403, 404, 409, 422].includes(cause.status)
        && !['IDEMPOTENCY_KEY_REUSED', 'SESSION_CHANGED'].includes(cause.code))
        this.clear(intent.key)
      else if (intent.mode === 'ISSUE' && await this.reconcileIssue(intent.key) === 'COMMITTED') return
      throw cause
    } finally { this.running = false }
  }

  private async reconcileIssue(key: string) {
    try {
      const proof = await api.inventory<{ key: string; operation: string; state: string }>(
        `/inventory-operations/${encodeURIComponent(key)}`,
      )
      if (proof.key === key && proof.operation === 'ISSUE' && ['COMMITTED', 'ABORTED'].includes(proof.state)) {
        this.clear(key)
        return proof.state
      }
    } catch {
      // Lookup failure (including 404) leaves the original intent recoverable.
    }
  }

  async recover(key: string, kind: 'retry' | 'abort') {
    this.assertSession()
    if (this.running) throw new Error('Đang xử lý giao dịch kho.')
    this.running = true
    try {
      await api.inventory(`/inventory-operations/${encodeURIComponent(key)}/${kind}`, { method: 'POST' })
      if (this.intent?.mode === 'ISSUE') this.clear(key)
    } catch (cause) {
      this.assertSession()
      if (this.intent?.mode === 'ISSUE' && this.intent.key === key) {
        const state = await this.reconcileIssue(key)
        if (kind === 'retry' && state === 'COMMITTED') return
      }
      throw cause
    } finally { this.running = false }
  }
}
