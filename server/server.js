require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const wsHandler = require('./websocket/wsHandler');
const adminRoutes = require('./routes/admin');
const logsRoutes = require('./routes/logs');
const groupRoutes = require('./routes/groups');

const app = express();
const server = http.createServer(app);

// 中间件
app.use(cors());
app.use(express.json());
app.set('trust proxy', true);  // 信任代理，这样可以获取到真实的客户端IP

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/logs', logsRoutes);
app.use('/api/groups', groupRoutes);

// 初始化WebSocket
wsHandler.init(server);

// 数据库连接
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000, // 超时时间
  socketTimeoutMS: 45000, // Socket 超时
})
.then(() => console.log('MongoDB连接成功'))
.catch(err => {
  console.error('MongoDB连接失败:', err);
  process.exit(1);
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  
  // 处理 MongoDB 错误
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    return res.status(500).json({ message: '数据库错误，请稍后重试' });
  }

  // 处理验证错误
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(error => error.message);
    return res.status(400).json({ message: messages.join(', ') });
  }

  res.status(500).json({ message: '服务器内部错误' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
}); 