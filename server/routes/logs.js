const express = require('express');
const router = express.Router();
const LogService = require('../services/logService');
const adminAuth = require('../middleware/admin');

// 获取日志列表
router.get('/', adminAuth, async (req, res) => {
  try {
    const { page, limit, type, username, startDate, endDate } = req.query;
    
    const query = {};
    if (type) query.type = type;
    if (username) query.username = new RegExp(username, 'i');
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const options = {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20
    };

    const result = await LogService.getLogs(query, options);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: '获取日志失败' });
  }
});

module.exports = router; 