export function fail(res, status, code, message, details) {
  return res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}

export function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
