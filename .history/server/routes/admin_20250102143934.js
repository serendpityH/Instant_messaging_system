const express = require('express');
const router = express.Router();
const User = require('../models/User');
const adminAuth = require('../middleware/admin');
const LogService = require('../services/logService');

// 获取所有用户列表
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: '获取用户列表失败' });
  }
});

// 更新用户信息
router.put('/users/:id', adminAuth, async (req, res) => {
  try {
    const { username, email } = req.body;

    // 检查用户名是否已被使用
    const existingUsername = await User.findOne({ 
      username, 
      _id: { $ne: req.params.id } 
    });
    if (existingUsername) {
      return res.status(400).json({ message: '用户名已被使用' });
    }

    // 检查邮箱是否已被使用
    const existingEmail = await User.findOne({ 
      email, 
      _id: { $ne: req.params.id } 
    });
    if (existingEmail) {
      return res.status(400).json({ message: '邮箱已被使用' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { username, email },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 记录管理员操作日志
    await LogService.createLog({
      userId: req.userId,
      username: req.user.username,
      type: 'update',
      action: `修改用户 ${user.username} 的信息`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'success'
    });

    res.json(user);
  } catch (error) {
    // 记录失败日志
    await LogService.createLog({
      userId: req.userId,
      username: req.user.username,
      type: 'update',
      action: '修改用户信息',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'failed'
    });
    res.status(500).json({ message: '更新用户信息失败' });
  }
});

// 删除用户
router.delete('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ message: '不能删除管理员账号' });
    }

    await User.findByIdAndDelete(req.params.id);

    // 记录删除操作日志
    await LogService.createLog({
      userId: req.userId,
      username: req.user.username,
      type: 'delete',
      action: `删除用户 ${user.username}`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'success'
    });

    res.json({ message: '用户删除成功' });
  } catch (error) {
    // 记录失败日志
    await LogService.createLog({
      userId: req.userId,
      username: req.user.username,
      type: 'delete',
      action: '删除用户',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'failed'
    });
    res.status(500).json({ message: '删除用户失败' });
  }
});

module.exports = router; 