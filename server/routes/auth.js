const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const LogService = require('../services/logService');
const auth = require('../middleware/auth');

// 注册路由
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, publicKey, privateKey } = req.body;

    // 检查必要字段
    if (!username || !email || !password || !publicKey || !privateKey) {
      return res.status(400).json({ message: '所有字段都是必需的' });
    }

    // 检查公钥格式
    if (!publicKey.includes('-----BEGIN PUBLIC KEY-----')) {
      console.error('Invalid public key format:', publicKey);
      return res.status(400).json({ message: '无效的公钥格式' });
    }

    // 检查用户名是否已存在
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ message: '用户名已被使用' });
    }

    // 检查邮箱是否已存在
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: '邮箱已被使用' });
    }

    // 创建新用户
    const newUser = new User({
      username,
      email,
      password,
      publicKey: publicKey.trim(),
      privateKey: privateKey.trim()
    });

    // 保存用户
    await newUser.save();
    console.log('User registered successfully:', username);

    // 记录注册日志
    await LogService.createLog({
      userId: newUser._id,
      username: newUser.username,
      type: 'register',
      action: '注册账号',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'success'
    });

    res.status(201).json({ message: '注册成功' });
  } catch (error) {
    console.error('Registration error:', error);
    
    // 处理 MongoDB 唯一键约束错误
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        message: `该${field === 'username' ? '用户名' : '邮箱'}已被使用`
      });
    }

    // 处理验证错误
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }

    // 记录失败日志
    if (req.body.username) {
      await LogService.createLog({
        username: req.body.username,
        type: 'register',
        action: '注册账号',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'failed'
      });
    }

    res.status(500).json({ message: '服务器错误，请稍后重试' });
  }
});

// 登录路由
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    const token = jwt.sign(
      { 
        userId: user._id,
        role: user.role  // 在 token 中包含角色信息
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // 记录登录日志
    await LogService.createLog({
      userId: user._id,
      username: user.username,
      type: 'login',
      action: '登录系统',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'success'
    });

    // 返回用户信息和token（不包含密码）
    const userResponse = {
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,  // 返回角色信息
      publicKey: user.role === 'user' ? user.publicKey : undefined,
      privateKey: user.role === 'user' ? user.privateKey : undefined
    };

    res.json({
      user: userResponse,
      token
    });
  } catch (error) {
    // 记录失败日志
    if (req.body.username) {
      await LogService.createLog({
        username: req.body.username,
        type: 'login',
        action: '登录系统',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'failed'
      });
    }
    console.error('登录错误:', error);
    res.status(500).json({ message: '登录失败' });
  }
});

// 登出路由
router.post('/logout', auth, async (req, res) => {
  try {
    await LogService.createLog({
      userId: req.userId,
      username: req.user.username,
      type: 'logout',
      action: '退出系统',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'success'
    });
    res.json({ message: '登出成功' });
  } catch (error) {
    console.error('登出失败:', error);
    res.status(500).json({ message: '登出失败' });
  }
});

module.exports = router; 