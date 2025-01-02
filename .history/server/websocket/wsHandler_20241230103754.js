const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Group = require('../models/Group');
const GroupMessage = require('../models/GroupMessage');

// 存储在线用户的Map: key为用户ID，value为WebSocket连接和最后活动时间
const onlineUsers = new Map();

// 心跳检测间隔（毫秒）
const HEARTBEAT_INTERVAL = 30000;
// 超时时间（毫秒）
const CONNECTION_TIMEOUT = 60000;

const init = (server) => {
  const wss = new WebSocket.Server({ server });

  // 定期检查连接状态
  setInterval(() => {
    checkConnections(wss);
  }, HEARTBEAT_INTERVAL);

  wss.on('connection', async (ws, req) => {
    try {
      const token = new URL(req.url, 'http://localhost').searchParams.get('token');
      if (!token) {
        ws.close();
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      ws.userId = decoded.userId;

      // 存储用户连接信息
      const userConnection = {
        ws,
        lastActivity: Date.now()
      };
      
      // 检查是否存在旧连接
      const existingConnection = onlineUsers.get(ws.userId);
      if (existingConnection) {
        // 关闭旧连接
        existingConnection.ws.close();
        console.log(`关闭用户 ${ws.userId} 的旧连接`);
      }

      // 更新用户连接信息
      onlineUsers.set(ws.userId, userConnection);
      console.log(`用户 ${ws.userId} 已连接，当前在线用户数: ${onlineUsers.size}`);
      
      // 广播用户上线消息
      broadcastUserStatus(ws.userId, true);

      // 发送当前在线用户列表给新连接的用户
      sendOnlineUsersList(ws);

      // 设置心跳检测
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
        const connection = onlineUsers.get(ws.userId);
        if (connection) {
          connection.lastActivity = Date.now();
        }
      });

      ws.on('close', () => {
        handleUserDisconnect(ws.userId);
      });

      ws.on('error', (error) => {
        console.error(`用户 ${ws.userId} WebSocket错误:`, error);
        handleUserDisconnect(ws.userId);
      });

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          
          // 更新用户最后活动时间
          const connection = onlineUsers.get(ws.userId);
          if (connection) {
            connection.lastActivity = Date.now();
          }

          // 处理心跳消息
          if (data.type === 'heartbeat') {
            // 响应心跳
            ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
            return;
          }
          
          if (data.type === 'message') {
            try {
              // 验证消息格式
              if (!data.content || !data.content.content) {
                throw new Error('消息格式不正确');
              }

              console.log('接收到私聊消息:', {
                sender: ws.userId,
                receiver: data.receiver,
                content: {
                  hasReceiverKey: !!data.content.receiverKey,
                  hasSenderKey: !!data.content.senderKey,
                  hasContent: !!data.content.content,
                  hasSignature: !!data.content.signature
                }
              });

              // 保存消息到数据库
              const newMessage = new Message({
                sender: ws.userId,
                receiver: data.receiver,
                content: {
                  receiverKey: data.content.receiverKey,
                  senderKey: data.content.senderKey,
                  iv: data.content.iv,
                  content: data.content.content,
                  signature: data.content.signature
                }
              });

              await newMessage.save();
              console.log('消息已保存到数据库:', newMessage._id);

              // 发送给接收者
              wss.clients.forEach((client) => {
                if (client.userId === data.receiver && client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'message',
                    sender: ws.userId,
                    content: {
                      key: data.content.receiverKey,  // 发送接收者的密钥
                      iv: data.content.iv,
                      content: data.content.content,
                      signature: data.content.signature
                    },
                    createdAt: newMessage.createdAt
                  }));
                }
              });
            } catch (error) {
              console.error('处理私聊消息失败:', error);
              ws.send(JSON.stringify({
                type: 'error',
                message: '发送消息失败: ' + error.message
              }));
            }
          } else if (data.type === 'groupMessage') {
            // 处理群组消息
            console.log('收到群组消息:', data);
            
            const group = await Group.findById(data.groupId);
            if (!group) {
              console.log('群组不存在:', data.groupId);
              return;
            }

            // 验证发送者是否是群组成员
            const isMember = group.members.some(
              member => member.user.toString() === ws.userId
            );

            if (!isMember) {
              console.log('发送者不是群组成员:', ws.userId);
              return;
            }

            // 获取发送者信息
            const sender = await User.findById(ws.userId);
            console.log('发送者信息:', sender.username);

            try {
              // 保存加密的消息
              const newMessage = new GroupMessage({
                sender: ws.userId,
                group: data.groupId,
                content: data.encryptedContent,  // 直接使用加密内容
                iv: data.iv,                     // 保存 IV
                senderName: sender.username      // 保存发送者名称
              });

              const savedMessage = await newMessage.save();
              console.log('消息已保存到数据库:', savedMessage);

              // 广播加密消息
              const groupMessage = {
                type: 'groupMessage',
                groupId: data.groupId,
                sender: ws.userId,
                senderName: sender.username,
                content: {
                  text: data.encryptedContent,
                  iv: data.iv
                },
                createdAt: savedMessage.createdAt
              };

              console.log('准备广播群组消息:', {
                message: groupMessage,
                encryptedContent: data.encryptedContent,
                iv: data.iv
              });

              // 获取群组所有成员ID
              const memberIds = group.members.map(member => member.user.toString());
              console.log('群组成员:', memberIds);

              // 向所有在线的群组成员发送消息
              let sentCount = 0;
              wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN && memberIds.includes(client.userId)) {
                  console.log('发送消息给成员:', client.userId);
                  client.send(JSON.stringify(groupMessage));
                  sentCount++;
                }
              });
              console.log(`消息已发送给 ${sentCount} 个在线成员`);

            } catch (error) {
              console.error('保存或发送群组消息失败:', error);
            }
          }
        } catch (error) {
          console.error('处理WebSocket消息失败:', error);
        }
      });

    } catch (error) {
      console.error('WebSocket连接验证失败:', error);
      ws.close();
    }
  });

  return wss;
};

// 处理用户断开连接
const handleUserDisconnect = (userId) => {
  const connection = onlineUsers.get(userId);
  if (connection) {
    // 清理连接
    onlineUsers.delete(userId);
    console.log(`用户 ${userId} 已断开连接，当前在线用户数: ${onlineUsers.size}`);
    // 广播用户下线消息
    broadcastUserStatus(userId, false);
  }
};

// 检查所有连接的状态
const checkConnections = (wss) => {
  const now = Date.now();
  
  onlineUsers.forEach((connection, userId) => {
    // 检查最后活动时间
    if (now - connection.lastActivity > CONNECTION_TIMEOUT) {
      console.log(`用户 ${userId} 连接超时`);
      handleUserDisconnect(userId);
      connection.ws.terminate();
      return;
    }

    // 发送心跳
    if (connection.ws.isAlive === false) {
      console.log(`用户 ${userId} 心跳检测失败`);
      handleUserDisconnect(userId);
      connection.ws.terminate();
      return;
    }

    connection.ws.isAlive = false;
    connection.ws.ping();
  });
};

// 向新连接的用户发送当前在线用户列表
const sendOnlineUsersList = (ws) => {
  // 过滤出真正在线的用户
  const onlineUsersList = Array.from(onlineUsers.entries())
    .filter(([userId, connection]) => {
      const now = Date.now();
      return connection.ws.readyState === WebSocket.OPEN && 
             (now - connection.lastActivity) <= CONNECTION_TIMEOUT;
    })
    .map(([userId]) => userId);

  console.log('发送在线用户列表:', onlineUsersList);
  
  ws.send(JSON.stringify({
    type: 'onlineUsers',
    users: onlineUsersList
  }));
};

// 广播用户在线状态
const broadcastUserStatus = (userId, isOnline) => {
  const statusMessage = JSON.stringify({
    type: 'userStatus',
    userId: userId,
    status: isOnline ? 'online' : 'offline',
    timestamp: Date.now()
  });

  onlineUsers.forEach((connection) => {
    if (connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(statusMessage);
    }
  });
};

// 检查用户是否在线
const isUserOnline = (userId) => {
  const connection = onlineUsers.get(userId);
  if (!connection) return false;
  
  // 检查连接是否仍然有效
  const now = Date.now();
  if (now - connection.lastActivity > CONNECTION_TIMEOUT) {
    handleUserDisconnect(userId);
    return false;
  }
  
  return connection.ws.readyState === WebSocket.OPEN;
};

module.exports = { init, isUserOnline }; 