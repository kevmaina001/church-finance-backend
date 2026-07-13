const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  // Login identifiers. At least one of email/phone is required (validated in the controller).
  // sparse so multiple users may omit one without tripping the unique index.
  email: { type: String, unique: true, sparse: true },
  phone: { type: String, unique: true, sparse: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['User', 'Admin', 'Special User', 'Member', 'Vicar', 'Treasurer', 'Secretary'],
    default: 'Member',
  },
  // Church a Treasurer/Secretary is scoped to. Null = parish-level (full parish authority).
  localChurch: { type: mongoose.Schema.Types.ObjectId, ref: 'LocalChurch' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  mustChangePassword: { type: Boolean, default: true },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
}, { timestamps: true });

// Password hashing before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

const User = mongoose.model('User', userSchema);
module.exports = User;
