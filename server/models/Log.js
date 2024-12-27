const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['login', 'logout', 'register', 'update', 'delete', 'request', 'create'],
    required: true
  },
  action: String,
  ip: String,
  device: String,
  status: {
    type: String,
    enum: ['success', 'failed'],
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Log', logSchema); 