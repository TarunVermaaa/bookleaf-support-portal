// A small error vocabulary for the API. Every error response has the same shape:
//   { "error": { "code": "NOT_FOUND", "message": "Ticket not found", "details"?: ... } }
// so the frontend (and any API consumer) can branch on `code` instead of parsing messages.
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, 'VALIDATION_ERROR', message, details);
  }
  static unauthenticated(message = 'Please log in to continue') {
    return new ApiError(401, 'UNAUTHENTICATED', message);
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(resource: string) {
    return new ApiError(404, 'NOT_FOUND', `${resource} not found`);
  }
  static conflict(message: string) {
    return new ApiError(409, 'CONFLICT', message);
  }
}
