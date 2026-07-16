const jwt = require('jsonwebtoken');

// Every 401 from this API means "your session is no longer good" — the client
// signs the user out on any of them. Permission denials must use 403 instead,
// or the user gets logged out for merely touching something they can't have.
const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization']; // Extract the Authorization header
    if (!authHeader) {
      return res.status(401).json({ code: 'NO_TOKEN', message: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1]; // Extract the token after "Bearer"
    if (!token) {
      return res.status(401).json({ code: 'BAD_TOKEN', message: 'Access denied. Invalid token format.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verify the token
    req.user = decoded; // Attach decoded token to req.user
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        code: 'TOKEN_EXPIRED',
        message: 'Your session has expired. Please sign in again.',
      });
    }
    console.error('Error in authenticate middleware:', err.message); // Log any error
    return res.status(401).json({ code: 'BAD_TOKEN', message: 'User not authenticated.' });
  }
};

module.exports = authenticate;
