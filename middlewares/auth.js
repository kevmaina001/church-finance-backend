const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization']; // Extract the Authorization header
    if (!authHeader) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1]; // Extract the token after "Bearer"
    if (!token) {
      return res.status(401).json({ message: 'Access denied. Invalid token format.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verify the token
    req.user = decoded; // Attach decoded token to req.user
    next();
  } catch (err) {
    console.error('Error in authenticate middleware:', err.message); // Log any error
    return res.status(401).json({ message: 'User not authenticated.' });
  }
};

module.exports = authenticate;
