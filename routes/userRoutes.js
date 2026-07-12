const express = require('express');
const {
    register,
    login,
    forgotPassword,
    resetPassword,
    inviteUser,
    listUsers,
    updateUser,
    deleteUser,
    getUserDetails
} = require('../controllers/userController');
const authenticate = require('../middlewares/auth'); // Import authenticate middleware
const roleMiddleware = require('../middlewares/role'); // Import roleMiddleware
const { authLimiter } = require('../middlewares/rateLimit');

const router = express.Router();

// Public routes (rate-limited to slow brute-force / email bombing)
router.post('/register', register);
router.post('/login', authLimiter, login);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password/:token', authLimiter, resetPassword);

// Authenticated route for any user
router.get('/me', authenticate, getUserDetails);

// Admin-only routes for user management
router.post('/invite', authenticate, roleMiddleware('Admin'), inviteUser);
router.get('/', authenticate, roleMiddleware('Admin'), listUsers);
router.put('/:id', authenticate, roleMiddleware('Admin'), updateUser);
router.delete('/:id', authenticate, roleMiddleware('Admin'), deleteUser);

module.exports = router;
