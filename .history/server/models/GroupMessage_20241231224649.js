const mongoose = require('mongoose');


const groupMessageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  content: {
    type: String,
    required: true
  },
  iv: {
    type: String,
    required: true
  },
  senderName: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('GroupMessage', groupMessageSchema); 