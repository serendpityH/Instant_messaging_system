const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization').replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 获取用户信息
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      throw new Error();
    }
    
    req.userId = decoded.userId;
    req.user = user;  // 添加用户信息到请求对象
    next();
  } catch (error) {
    res.status(401).json({ message: '请先登录' });
  }
};

module.exports = auth; 