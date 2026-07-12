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

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

// Authenticated route for any user
router.get('/me', authenticate, getUserDetails);

// Admin-only routes for user management
router.post('/invite', authenticate, roleMiddleware('Admin'), inviteUser);
router.get('/', authenticate, roleMiddleware('Admin'), listUsers);
router.put('/:id', authenticate, roleMiddleware('Admin'), updateUser);
router.delete('/:id', authenticate, roleMiddleware('Admin'), deleteUser);

module.exports = router;
