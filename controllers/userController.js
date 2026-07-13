const User = require('../models/User');
const Tenant = require('../models/Tenant');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const sendMail = require('../config/email');
const seedTenant = require('../utils/seedTenant');

// Base URL of the frontend, used to build password-reset links
const FRONTEND_BASE_URL = (process.env.FRONTEND_URL || 'https://ackamune-fund-manager.vercel.app').replace(/\/+$/, '');

const register = async (req, res) => {
  const { name, email, password, tenantName } = req.body;
  try {
    // Create a new tenant
    const tenant = new Tenant({ name: tenantName });
    await tenant.save();

    // Create a new user as an Admin for the new tenant
    // The password will be hashed by the pre-save hook in the User model
    const user = new User({
      name,
      email: email ? email.trim().toLowerCase() : undefined,
      password, // Pass the plain password
      role: 'Admin', // Assign Admin role on registration
      mustChangePassword: false,
      tenantId: tenant._id,
    });
    await user.save();

    // Seed the new tenant with a starter setup + demonstration data so it isn't empty.
    // Non-fatal: if seeding fails, registration still succeeds.
    try {
      await seedTenant(tenant._id);
    } catch (seedErr) {
      console.error('Demo seeding failed for tenant', String(tenant._id), '-', seedErr.message);
    }

    // Log the new admin straight in so the app can send them to choose a context.
    const token = jwt.sign(
      { id: user._id, name: user.name, role: user.role, tenantId: user.tenantId, localChurch: null },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(201).json({
      message: 'Tenant and Admin user registered successfully',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId, localChurch: null },
      tenant,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const login = async (req, res) => {
    // Accept a single `identifier` (email or phone), or the legacy `email` field.
    const { identifier, email, phone, password } = req.body;
    const loginId = (identifier || email || phone || '').trim();

    try {
      if (!loginId || !password) {
        return res.status(400).json({ message: 'Enter your email or phone and password.' });
      }

      // Match by email or phone (case-insensitive email)
      const user = await User.findOne({
        $or: [{ email: loginId.toLowerCase() }, { email: loginId }, { phone: loginId }],
      });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Validate password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      // Generate JWT token (localChurch drives per-church write scoping)
      const payload = {
        id: user._id,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        localChurch: user.localChurch || null,
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });

      // Respond with token and user details
      res.status(200).json({
        message: 'Login successful',
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          localChurch: user.localChurch || null,
          tenantId: user.tenantId,
          mustChangePassword: user.mustChangePassword,
        },
      });
    } catch (error) {
      console.error('Error during login:', error.message); // Log the error for debugging
      res.status(500).json({ message: 'An error occurred during login. Please try again later.' });
    }
  };

// @desc    Request a password reset link
// @route   POST /api/users/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  // Always respond the same way to avoid leaking which emails are registered
  const genericMessage = 'If an account exists for that email, a password reset link has been sent.';

  try {
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(200).json({ message: genericMessage });
    }

    // Create a raw token for the link and store only its hash
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const resetUrl = `${FRONTEND_BASE_URL}/reset-password/${rawToken}`;

    try {
      await sendMail({
        to: user.email,
        subject: 'Reset your Church Accounting System password',
        text: `Hello ${user.name},\n\nWe received a request to reset your password.\n\nReset link (valid for 1 hour):\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`,
        html: `<p>Hello <b>${user.name}</b>,</p><p>We received a request to reset your password.</p><p><a href="${resetUrl}">Click here to reset your password</a> (valid for 1 hour).</p><p>If you did not request this, you can safely ignore this email.</p>`
      });
    } catch (mailErr) {
      // Roll back the token so a failed email doesn't leave a dangling reset request
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      console.error('Failed to send reset email:', mailErr.message);
      return res.status(500).json({ message: 'Failed to send reset email. Please try again later.' });
    }

    return res.status(200).json({ message: genericMessage });
  } catch (error) {
    console.error('Error in forgotPassword:', error.message);
    return res.status(500).json({ message: 'An error occurred. Please try again later.' });
  }
};

// @desc    Reset password using a token from the email link
// @route   POST /api/users/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Password reset link is invalid or has expired.' });
    }

    user.password = password; // pre-save hook hashes it
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.mustChangePassword = false;
    await user.save();

    return res.status(200).json({ message: 'Password has been reset successfully. You can now log in.' });
  } catch (error) {
    console.error('Error in resetPassword:', error.message);
    return res.status(500).json({ message: 'An error occurred. Please try again later.' });
  }
};

const getUserDetails = async (req, res) => {
    try {
        // req.user is populated by the authenticate middleware
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// @desc    Invite a new user to the tenant
// @route   POST /api/users/invite
// @access  Admin
const VALID_ROLES = ['Admin', 'Vicar', 'Treasurer', 'Secretary', 'Member'];

const inviteUser = async (req, res) => {
    let { name, email, phone, password, role, localChurch } = req.body;
    const { tenantId } = req.user;

    email = email && email.trim() ? email.trim().toLowerCase() : undefined;
    phone = phone && phone.trim() ? phone.trim() : undefined;

    // Need a name, a role, and at least one login identifier (email or phone)
    if (!name || !role) {
        return res.status(400).json({ message: 'Please provide a name and a role.' });
    }
    if (!email && !phone) {
        return res.status(400).json({ message: 'Provide an email or a phone number for login.' });
    }
    if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ message: `Role must be one of: ${VALID_ROLES.join(', ')}` });
    }
    // Scoped roles may be tied to a local church; parish-level roles never are.
    const scopedChurch = ['Treasurer', 'Secretary'].includes(role) && localChurch ? localChurch : undefined;

    try {
        if (email && await User.findOne({ email })) {
            return res.status(400).json({ message: 'A user with this email already exists' });
        }
        if (phone && await User.findOne({ phone })) {
            return res.status(400).json({ message: 'A user with this phone number already exists' });
        }

        // Auto-generate a temporary password if none supplied
        const tempPassword = password && password.trim() ? password.trim() : crypto.randomBytes(4).toString('hex');

        const user = new User({
            name,
            email,
            phone,
            password: tempPassword, // hashed by the pre-save hook
            role,
            localChurch: scopedChurch,
            tenantId,
            mustChangePassword: true,
        });
        await user.save();

        // Email the invite only when we have an address to send to
        let emailed = false;
        if (email) {
            try {
                await sendMail({
                    to: email,
                    subject: 'You have been invited to Church Accounting System',
                    text: `Hello ${name},\n\nYou have been invited to join the Church Accounting System as ${role}.\n\nLogin: ${email}${phone ? ' or ' + phone : ''}\nTemporary password: ${tempPassword}\n\nPlease log in and change your password immediately.\n\nLogin URL: ${FRONTEND_BASE_URL}/login\n\nThank you!`,
                    html: `<p>Hello <b>${name}</b>,</p><p>You have been invited to join the <b>Church Accounting System</b> as <b>${role}</b>.</p><ul><li><b>Login:</b> ${email}${phone ? ' or ' + phone : ''}</li><li><b>Temporary password:</b> ${tempPassword}</li></ul><p>Please log in and <b>change your password immediately</b>.</p><p><a href="${FRONTEND_BASE_URL}/login">Login</a></p>`
                });
                emailed = true;
            } catch (mailErr) {
                console.error('Invite email failed:', mailErr.message);
            }
        }

        const safeUser = user.toObject();
        delete safeUser.password;
        // Return the temp password so the admin can pass it on when no email was sent.
        res.status(201).json({
            message: emailed ? 'User created and invite emailed.' : 'User created.',
            user: safeUser,
            tempPassword: emailed ? undefined : tempPassword,
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: err.message || 'Server Error' });
    }
};

// @desc    List all users in the tenant
// @route   GET /api/users
// @access  Admin
const listUsers = async (req, res) => {
    try {
        const users = await User.find({ tenantId: req.user.tenantId }).select('-password');
        res.json(users);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Update user details (e.g., role)
// @route   PUT /api/users/:id
// @access  Admin
const updateUser = async (req, res) => {
    const { role, localChurch } = req.body;
    const { id } = req.params;

    try {
        // Ensure the user being updated is in the same tenant as the admin
        const userToUpdate = await User.findOne({ _id: id, tenantId: req.user.tenantId });

        if (!userToUpdate) {
            return res.status(404).json({ message: 'User not found in this tenant' });
        }

        // Prevent a user from changing their own role (avoid self-lockout / privilege games)
        if (userToUpdate._id.toString() === req.user.id && role && role !== userToUpdate.role) {
            return res.status(400).json({ message: 'You cannot change your own role.' });
        }

        if (role !== undefined) {
            if (!VALID_ROLES.includes(role)) {
                return res.status(400).json({ message: `Role must be one of: ${VALID_ROLES.join(', ')}` });
            }
            userToUpdate.role = role;
        }

        // localChurch only applies to scoped roles; parish-level roles are always unscoped.
        if (localChurch !== undefined) {
            const effectiveRole = role || userToUpdate.role;
            userToUpdate.localChurch = (['Treasurer', 'Secretary'].includes(effectiveRole) && localChurch)
                ? localChurch
                : undefined;
        } else if (role && !['Treasurer', 'Secretary'].includes(role)) {
            userToUpdate.localChurch = undefined; // moving to a parish-level role clears the church
        }

        await userToUpdate.save();

        const safeUser = userToUpdate.toObject();
        delete safeUser.password;
        res.json({ message: 'User updated successfully.', user: safeUser });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: err.message || 'Server Error' });
    }
};

// @desc    Delete a user from the tenant
// @route   DELETE /api/users/:id
// @access  Admin
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent an admin from deleting themselves
        if (id === req.user.id) {
            return res.status(400).json({ message: 'You cannot delete your own admin account.' });
        }

        // Find the user within the admin's tenant
        const userToDelete = await User.findOne({ _id: id, tenantId: req.user.tenantId });

        if (!userToDelete) {
            return res.status(404).json({ message: 'User not found in this tenant' });
        }

        await userToDelete.deleteOne();

        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

module.exports = {
    register,
    login,
    forgotPassword,
    resetPassword,
    getUserDetails,
    inviteUser,
    listUsers,
    updateUser,
    deleteUser
};
  