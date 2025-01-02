const WebSocket = require('ws'); // 引入WebSocket库
const jwt = require('jsonwebtoken'); // 引入jwt库
const User = require('../models/User');
const Message = require('../models/Message');
const Group = require('../models/Group');
const GroupMessage = require('../models/GroupMessage');

const init = (server) => {
  const wss = new WebSocket.Server({ server }); // 创建websocket服务器

  // jian'tin
  wss.on('connection', async (ws, req) => {
    try {
      const token = new URL(req.url, 'http://localhost').searchParams.get('token');
      if (!token) {
        ws.close();
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      ws.userId = decoded.userId;

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          
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

      ws.on('error', (error) => {
        console.error('WebSocket错误:', error);
      });

    } catch (error) {
      console.error('WebSocket连接验证失败:', error);
      ws.close();
    }
  });

  return wss;
};

module.exports = { init }; 