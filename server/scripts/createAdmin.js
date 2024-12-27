require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const adminExists = await User.findOne({ role: 'admin' });
    if (adminExists) {
      console.log('管理员账号已存在');
      process.exit(0);
    }

    const admin = new User({
      username: 'admin',
      email: 'admin@example.com',
      password: 'admin123456',  // 请修改为更安全的密码
      role: 'admin'
    });

    await admin.save();
    console.log('管理员账号创建成功');
    process.exit(0);
  } catch (error) {
    console.error('创建管理员账号失败:', error);
    process.exit(1);
  }
};

createAdmin();