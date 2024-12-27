const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const auth = require('../middleware/auth');
const LogService = require('../services/logService');
const Message = require('../models/Message');
const User = require('../models/User');
const crypto = require('crypto');
const GroupMessage = require('../models/GroupMessage');

// 创建群组
router.post('/', auth, async (req, res) => {
  try {
    const { name, description } = req.body;

    // 生成群组密钥（32字节的随机密钥）
    const groupKey = crypto.randomBytes(32).toString('hex');

    // 获取创建者的公钥
    const creator = await User.findById(req.userId).select('+publicKey');
    if (!creator || !creator.publicKey) {
      throw new Error('无法获取创建者的公钥');
    }

    // 使用创建者的公钥加密群组密钥
    const encryptedGroupKey = crypto.publicEncrypt(
      {
        key: creator.publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
      },
      Buffer.from(groupKey)
    ).toString('base64');

    const existingGroup = await Group.findOne({ name });
    if (existingGroup) {
      return res.status(400).json({ message: '群组名已存在' });
    }

    const group = new Group({
      name,
      description,
      creator: req.userId,
      groupKey, // 存储原始群组密钥
      members: [{
        user: req.userId,
        role: 'owner',
        encryptedGroupKey
      }]
    });

    const savedGroup = await group.save();
    
    // 添加日志
    await LogService.createLog({
      userId: req.userId,
      username: req.user.username,
      type: 'create',
      action: `创建群组 ${name}`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'success'
    });

    // 返回保存的群组数据，并确保设置正确的状态码
    return res.status(201).json({
      message: '群组创建成功',
      group: savedGroup
    });

  } catch (error) {
    console.error('创建群组失败:', error);
    
    // 添加失败日志
    await LogService.createLog({
      userId: req.userId,
      username: req.user.username,
      type: 'create',
      action: `创建群组失败`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'failed'
    });

    // 返回具体的错误信息
    return res.status(500).json({ 
      message: error.code === 11000 ? '群组名已存在' : '创��群组失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 获取群组列表
router.get('/', auth, async (req, res) => {
  try {
    const groups = await Group.find()
      .populate('creator', 'username')
      .populate('members.user', 'username')
      .sort({ createdAt: -1 });
    res.json(groups);
  } catch (error) {
    res.status(500).json({ message: '获取群组列表失败' });
  }
});

// 申请加入群组
router.post('/:groupId/join', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: '群组不存在' });
    }

    // 检查是否已经是成员
    if (group.members.some(member => member.user.toString() === req.userId)) {
      return res.status(400).json({ message: '您已经是群组成员' });
    }

    // 检查是否已经申请
    if (group.pendingMembers.some(member => member.user.toString() === req.userId)) {
      return res.status(400).json({ message: '您已经申请加入该群组' });
    }

    group.pendingMembers.push({ user: req.userId });
    await group.save();

    await LogService.createLog({
      userId: req.userId,
      username: req.user.username,
      type: 'request',
      action: `申请加入群组 ${group.name}`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'success'
    });

    res.json({ message: '申请已提交' });
  } catch (error) {
    res.status(500).json({ message: '申请加入群组失败' });
  }
});

// 处理加入申请
router.put('/:groupId/members/:userId', auth, async (req, res) => {
  try {
    const { approve } = req.body;
    const group = await Group.findById(req.params.groupId);
    
    if (!group) {
      return res.status(404).json({ message: '群组不存在' });
    }

    // 验证操作者是否是群主
    const isOwner = group.members.some(
      member => member.user.toString() === req.userId && member.role === 'owner'
    );

    if (!isOwner) {
      return res.status(403).json({ message: '只有群主可以处理申请' });
    }

    if (approve) {
      try {
        // 获取新成员的公钥
        const newMember = await User.findById(req.params.userId).select('+publicKey');
        if (!newMember || !newMember.publicKey) {
          throw new Error('无法获取新成员的公钥');
        }

        // 获取群主的信息
        const owner = group.members.find(m => m.role === 'owner');
        const ownerUser = await User.findById(owner.user).select('+privateKey');
        if (!ownerUser || !ownerUser.privateKey) {
          throw new Error('无法获取群主的私钥');
        }

        // 获取群主的私钥解密群组密钥
        const ownerEncryptedKey = owner.encryptedGroupKey;
        const groupKey = crypto.privateDecrypt(
          {
            key: ownerUser.privateKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
          },
          Buffer.from(ownerEncryptedKey, 'base64')
        ).toString();

        // 使用新成员的公钥加密群组密钥
        const encryptedGroupKey = crypto.publicEncrypt(
          {
            key: newMember.publicKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
          },
          Buffer.from(groupKey)
        ).toString('base64');

        // 添加为成员
        group.members.push({
          user: req.params.userId,
          encryptedGroupKey
        });

        // 从待处理列表中移除
        group.pendingMembers = group.pendingMembers.filter(
          member => member.user.toString() !== req.params.userId
        );

        await group.save();

        await LogService.createLog({
          userId: req.userId,
          username: req.user.username,
          type: 'update',
          action: `同意用户加入群组 ${group.name}`,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          status: 'success'
        });

        res.json({ message: '已同意加入申请' });
      } catch (error) {
        console.error('处理群组加入申请失败:', error);
        throw error;
      }
    } else {
      // 直接从待处理列表中移除
      group.pendingMembers = group.pendingMembers.filter(
        member => member.user.toString() !== req.params.userId
      );
      await group.save();

      await LogService.createLog({
        userId: req.userId,
        username: req.user.username,
        type: 'update',
        action: `拒绝用户加入群组 ${group.name}`,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'success'
      });

      res.json({ message: '已拒绝加入申请' });
    }
  } catch (error) {
    console.error('处理申请失败:', error);
    res.status(500).json({ message: '处理申请失败' });
  }
});

// 获取我的群组列表（包括我创建的和加入的）
router.get('/my', auth, async (req, res) => {
  try {
    const groups = await Group.find({
      $or: [
        { creator: req.userId },
        { 'members.user': req.userId }
      ]
    })
    .populate('creator', 'username')
    .populate('members.user', 'username')
    .sort({ createdAt: -1 });
    res.json(groups);
  } catch (error) {
    res.status(500).json({ message: '���取群组列表失败' });
  }
});

// 获取可加入的群组列表（我未加入的群组）
router.get('/available', auth, async (req, res) => {
  try {
    const groups = await Group.find({
      creator: { $ne: req.userId },
      'members.user': { $ne: req.userId },
      'pendingMembers.user': { $ne: req.userId }
    })
    .populate('creator', 'username')
    .select('name description creator createdAt')
    .sort({ createdAt: -1 });
    res.json(groups);
  } catch (error) {
    res.status(500).json({ message: '获取可加入群组列表失败' });
  }
});

// 获取群组的待审核成员
router.get('/:groupId/pending', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
      .populate('pendingMembers.user', 'username email');
    
    if (!group) {
      return res.status(404).json({ message: '群组不存在' });
    }

    // 验证是否是群主
    const isOwner = group.members.some(
      member => member.user.toString() === req.userId && member.role === 'owner'
    );

    if (!isOwner) {
      return res.status(403).json({ message: '只有群主可以查看待审核列表' });
    }

    res.json(group.pendingMembers);
  } catch (error) {
    res.status(500).json({ message: '获取待审核成员失败' });
  }
});

// 获取群组成员列表
router.get('/:groupId/members', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
      .populate('members.user', 'username email')
      .select('members');
    
    if (!group) {
      return res.status(404).json({ message: '群组不存在' });
    }

    // 验证请求者是否是群组成员
    const isMember = group.members.some(
      member => member.user._id.toString() === req.userId
    );

    if (!isMember) {
      return res.status(403).json({ message: '只有群组成员可以查看成员列表' });
    }

    res.json(group.members);
  } catch (error) {
    res.status(500).json({ message: '获取群组成员列表失败' });
  }
});

// 退出群组
router.delete('/:groupId/leave', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: '群组不存在' });
    }

    // 检查是否是群主
    const isOwner = group.members.some(
      member => member.user.toString() === req.userId && member.role === 'owner'
    );

    if (isOwner) {
      return res.status(400).json({ message: '群主不能退出群组，请先转让群主或解散群组' });
    }

    // 从成员列表中移除
    group.members = group.members.filter(
      member => member.user.toString() !== req.userId
    );

    await group.save();

    await LogService.createLog({
      userId: req.userId,
      username: req.user.username,
      type: 'update',
      action: `退出群组 ${group.name}`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'success'
    });

    res.json({ message: '已退出群组' });
  } catch (error) {
    res.status(500).json({ message: '退出群组失败' });
  }
});

// 解散群组
router.delete('/:groupId', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: '群组不存在' });
    }

    // 验证是否是群主
    const isOwner = group.members.some(
      member => member.user.toString() === req.userId && member.role === 'owner'
    );

    if (!isOwner) {
      return res.status(403).json({ message: '只有群主可以解散群组' });
    }

    await group.deleteOne();

    await LogService.createLog({
      userId: req.userId,
      username: req.user.username,
      type: 'delete',
      action: `解散群组 ${group.name}`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'success'
    });

    res.json({ message: '群组已解散' });
  } catch (error) {
    res.status(500).json({ message: '解散群组失败' });
  }
});

// 移除群组成员
router.delete('/:groupId/members/:userId', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: '群组不存在' });
    }

    // 验证操作者是否是群主
    const isOwner = group.members.some(
      member => member.user.toString() === req.userId && member.role === 'owner'
    );

    if (!isOwner) {
      return res.status(403).json({ message: '只有群主可以移除成员' });
    }

    // 不能移除群主自己
    if (req.params.userId === req.userId) {
      return res.status(400).json({ message: '群主不能移除自己' });
    }

    // 检查要移除的用户是否在群组中
    const memberExists = group.members.some(
      member => member.user.toString() === req.params.userId
    );

    if (!memberExists) {
      return res.status(404).json({ message: '该用户不是群组成员' });
    }

    // 从成员列表中移除
    group.members = group.members.filter(
      member => member.user.toString() !== req.params.userId
    );

    await group.save();

    await LogService.createLog({
      userId: req.userId,
      username: req.user.username,
      type: 'update',
      action: `从群组 ${group.name} 中移除成员`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'success'
    });

    res.json({ message: '已移除该成员' });
  } catch (error) {
    res.status(500).json({ message: '移除成员失败' });
  }
});

// 获取群组消息
router.get('/:groupId/messages', auth, async (req, res) => {
  try {
    // 验证用户是否是群组成员
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: '群组不存在' });
    }

    const isMember = group.members.some(
      member => member.user.toString() === req.userId
    );

    if (!isMember) {
      return res.status(403).json({ message: '只有群组成员可以查看消息' });
    }

    // 获取群组消息
    const messages = await GroupMessage.find({ group: req.params.groupId })
      .populate('sender', 'username')
      .sort({ createdAt: 1 });

    console.log('获取群组消息:', {
      groupId: req.params.groupId,
      messageCount: messages.length
    });

    // 格式化消息
    const formattedMessages = messages.map(msg => ({
      _id: msg._id,
      sender: msg.sender._id,
      senderName: msg.senderName,
      content: msg.content,
      iv: msg.iv,
      createdAt: msg.createdAt
    }));

    res.json(formattedMessages);
  } catch (error) {
    console.error('获取群组消息失败:', error);
    res.status(500).json({ message: '获取群组消息失败' });
  }
});

// 获取群组密钥
router.get('/:groupId/key', auth, async (req, res) => {
  try {
    console.log('获取群组密钥请求:', req.params.groupId);
    
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      console.log('群组不存在');
      return res.status(404).json({ message: '群组不存在' });
    }

    // 验证用户是否是群组成员
    const isMember = group.members.some(
      member => member.user.toString() === req.userId
    );

    if (!isMember) {
      console.log('用户不是群组成员:', req.userId);
      return res.status(403).json({ message: '只有群组成员可以获取密钥' });
    }

    console.log('群组密钥获取成功:', group.groupKey);
    res.json({ groupKey: group.groupKey });
  } catch (error) {
    console.error('获取群组密钥失败:', error);
    res.status(500).json({ message: '获取群组密钥失败' });
  }
});

module.exports = router; 