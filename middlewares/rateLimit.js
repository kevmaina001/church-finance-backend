const rateLimit = require('express-rate-limit');

// Limits repeated attempts against auth-sensitive endpoints (login, password reset)
// to slow down brute-force and email-bombing. Keyed by client IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                  // 20 requests per window per IP (generous for shared office IPs)
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in a few minutes.' },
});

module.exports = { authLimiter };
