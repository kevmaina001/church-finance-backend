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
const { requireUserManagement } = require('../middlewares/permit');
const { authLimiter } = require('../middlewares/rateLimit');

const router = express.Router();

// Public routes (rate-limited to slow brute-force / email bombing)
router.post('/register', register);
router.post('/login', authLimiter, login);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password/:token', authLimiter, resetPassword);

// Authenticated route for any user
router.get('/me', authenticate, getUserDetails);

// User management: admin, vicar, and the parish treasurer
router.post('/invite', authenticate, requireUserManagement, inviteUser);
router.get('/', authenticate, requireUserManagement, listUsers);
router.put('/:id', authenticate, requireUserManagement, updateUser);
router.delete('/:id', authenticate, requireUserManagement, deleteUser);

module.exports = router;
