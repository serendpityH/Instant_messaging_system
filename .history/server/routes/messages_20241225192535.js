const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const auth = require('../middleware/auth');

// 获取与特定用户的聊天记录
router.get('/:userId', auth, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { sender: req.userId, receiver: req.params.userId },
        { sender: req.params.userId, receiver: req.userId }
      ]
    }).sort({ createdAt: 1 });

    // 格式化消息，根据是发送者还是接收者返回对应的密钥
    const formattedMessages = messages.map(msg => {
      const isSender = msg.sender.toString() === req.userId;
      return {
        sender: msg.sender,
        content: msg.content,
        iv: msg.iv,
        key: isSender ? msg.senderKey : msg.receiverKey,  // 根据身份返回对应的密钥
        signature: msg.signature,
        createdAt: msg.createdAt
      };
    });

    console.log('获取私聊消息:', {
      currentUser: req.userId,
      otherUser: req.params.userId,
      messageCount: messages.length
    });

    res.json(formattedMessages);
  } catch (error) {
    console.error('获取私聊消息失败:', error);
    res.status(500).json({ message: '获取消息失败' });
  }
});

module.exports = router;