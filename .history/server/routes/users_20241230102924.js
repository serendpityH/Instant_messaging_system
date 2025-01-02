const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const LogService = require('../services/logService');
const { isUserOnline } = require('../websocket/wsHandler');

// 获取当前用户信息
router.get('/current', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: '获取用户信息失败' });
  }
});

// 更新用户信息
router.put('/update', auth, async (req, res) => {
  try {
    const { username, email } = req.body;

    // 检查用户名是否已被使用
    const existingUsername = await User.findOne({ 
      username, 
      _id: { $ne: req.userId } 
    });
    if (existingUsername) {
      return res.status(400).json({ message: '用户名已被使用' });
    }

    // 检查邮箱是否已被使用
    const existingEmail = await User.findOne({ 
      email, 
      _id: { $ne: req.userId } 
    });
    if (existingEmail) {
      return res.status(400).json({ message: '邮箱已被使用' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { username, email },
      { new: true }
    ).select('-password');

    // 记录更新日志
    await LogService.createLog({
      userId: req.userId,
      username: user.username,
      type: 'update',
      action: '更新个人信息',
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
      action: '更新个人信息',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'failed'
    });
    console.error('更新用户信息失败:', error);
    res.status(500).json({ message: '更新用户信息失败' });
  }
});

// 修改密码
router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 验证当前密码
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: '当前密码错误' });
    }

    // 更新密码
    user.password = newPassword;
    await user.save();

    // 记录密码修改日志
    await LogService.createLog({
      userId: req.userId,
      username: user.username,
      type: 'update',
      action: '修改密码',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'success'
    });

    res.json({ message: '密码修改成功' });
  } catch (error) {
    // 记录失败日志
    await LogService.createLog({
      userId: req.userId,
      username: req.user.username,
      type: 'update',
      action: '修改密码',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'failed'
    });
    console.error('修改密码失败:', error);
    res.status(500).json({ message: '修改密码失败' });
  }
});

// 获取用户列表（除了当前用户和管理员）
router.get('/', auth, async (req, res) => {
  try {
    const users = await User.find({ 
      _id: { $ne: req.userId },  // 排除当前用户
      role: { $ne: 'admin' }     // 排除管理员
    })
      .select('-password')
      .sort({ username: 1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: '获取用户列表失败' });
  }
});

// 获取用户列表（包含在线状态）
router.get('/list', auth, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user.id } });
    const usersWithStatus = users.map(user => ({
      ...user.toObject(),
      isOnline: isUserOnline(user._id.toString())
    }));
    res.json(usersWithStatus);
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ message: '获取用户列表失败' });
  }
});

module.exports = router;