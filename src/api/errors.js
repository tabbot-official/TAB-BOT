export class ApiError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}
export const badRequest = (m, d) => new ApiError(400, 'bad_request', m, d);
export const unauthorized = (m = 'Authentication required') => new ApiError(401, 'unauthorized', m);
export const forbidden = (m = 'Not allowed for this role') => new ApiError(403, 'forbidden', m);
export const notFound = (m = 'Not found') => new ApiError(404, 'not_found', m);
export const tooMany = (retry) => Object.assign(new ApiError(429, 'rate_limited', 'Too many requests'), {retry});
