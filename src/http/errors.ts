import type { ErrorResponse } from '@/types/common/errors'

export class ApiError extends Error {
  readonly status: number
  readonly body: ErrorResponse
  readonly raw: Response

  constructor(status: number, body: ErrorResponse, raw: Response) {
    super(
      'fields' in body
        ? `API validation error (${status})`
        : `API error (${status}): ${body.message}`
    )
    this.name = 'ApiError'
    this.status = status
    this.body = body
    this.raw = raw
  }

  /** Whether this error represents a field-level validation failure. */
  isValidationError(): boolean {
    return 'fields' in this.body
  }
}
