import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './Chat.css';
import { api } from '../../config/api';
import cryptoService from '../../utils/crypto';
import KeyManagement from '../auth/KeyManagement';

const ChatRoom = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const ws = useRef(null);
  const reconnectTimeout = useRef(null);
  const errorTimeoutRef = useRef(null);
  const [showKeyManagement, setShowKeyManagement] = useState(false);
  const [groups, setGroups] = useState([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupFormData, setGroupFormData] = useState({
    name: '',
    description: ''
  });
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showAvailableGroups, setShowAvailableGroups] = useState(false);
  const [availableGroups, setAvailableGroups] = useState([]);
  const [showPendingMembers, setShowPendingMembers] = useState(false);
  const [pendingMembers, setPendingMembers] = useState([]);
  const [showMembers, setShowMembers] = useState(false);
  const [groupMembers, setGroupMembers] = useState([]);
  const [showProfile, setShowProfile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showUserList, setShowUserList] = useState(false);
  const [showGroupList, setShowGroupList] = useState(false);

  const handleError = (message, duration = 3000, type = 'error') => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }

    setError({ message, type });

    errorTimeoutRef.current = setTimeout(() => {
      setError('');
    }, duration);
  };

  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    const init = async () => {
      setIsLoading(true);
      try {
        await initializeChat();
      } finally {
        setIsLoading(false);
      }
    };
    init();

    return cleanup;
  }, []);

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      console.log('群组变化，重新加载消息');
      loadMessages();
    }
  }, [selectedGroup]);

  const cleanup = () => {
    if (ws.current) {
      ws.current.closeIntentionally = true;
      ws.current.close();
    }
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
    }
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
  };

  const initializeChat = async () => {
    try {
      // 1. 获取并设置私钥
      const privateKey = localStorage.getItem('privateKey');
      if (!privateKey) {
        console.error('未找到私钥');
        navigate('/login');
        return;
      }
      cryptoService.setPrivateKey(privateKey);

      // 2. 获取当前用户信息
      const user = await fetchCurrentUser();
      if (!user) {
        throw new Error('获取用户信息失败');
      }

      // 3. 设置当前用户的公钥
      cryptoService.myPublicKey = user.publicKey;
      console.log('设置当前用户公钥:', user.publicKey);

      // 4. 获取其他用户列表并设置他们的公钥
      await fetchUsers();

      // 5. 初始化WebSocket连接
      initializeWebSocket();
    } catch (error) {
      console.error('初始化聊天失败:', error);
      handleError('初始化聊天失败: ' + error.message);
    }
  };

  const initializeWebSocket = () => {
    cleanup();

    const token = localStorage.getItem('token');
    ws.current = new WebSocket(`${api.ws}?token=${token}`);

    ws.current.onopen = () => {
      console.log('WebSocket连接已建立');
    };

    ws.current.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('收到WebSocket消息:', message);

        if (!currentUser) {
          console.log('等待当前用户加载...');
          return;
        }

        if (message.type === 'message') {
          await handlePrivateMessage(message);
        } else if (message.type === 'groupMessage') {
          await handleGroupMessage(message);
        }
      } catch (error) {
        console.error('处理消息失败:', error);
      }
    };

    ws.current.onclose = () => {
      console.log('WebSocket连接已断开，正在重新连接...');
      reconnectTimeout.current = setTimeout(initializeWebSocket, 3000);
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket错误:', error);
    };
  };

  const handlePrivateMessage = async (message) => {
    try {
      console.log('处理接收到的实时���聊消息:', {
        messageId: message._id,
        sender: message.sender,
        hasKey: !!message.content.key,
        currentUser: currentUser._id
      });

      // 获取发送者的公钥
      const sender = users.find(u => u._id === message.sender);
      if (!sender) {
        throw new Error('找不到发送者信息');
      }

      // 解密消息
      const decryptedContent = cryptoService.decryptMessage({
        key: message.content.key,  // 使用接收的密钥
        iv: message.content.iv,
        content: message.content.content,
        signature: message.content.signature
      }, sender.publicKey);

      console.log('实时消息解密结果:', {
        messageId: message._id,
        hasContent: !!decryptedContent,
        length: decryptedContent?.length
      });

      // 添加到消息列表
      const newMessage = {
        _id: message._id || Date.now(),
        sender: message.sender,
        content: decryptedContent,
        createdAt: message.createdAt || new Date().toISOString()
      };

      setMessages(prev => [...prev, newMessage]);
      scrollToBottom();
    } catch (error) {
      console.error('处理实时私聊消息失败:', {
        error: error.message,
        stack: error.stack,
        messageId: message._id
      });
      handleError('处理消���失败: ' + error.message);
    }
  };

  const handleGroupMessage = async (message) => {
    try {
      if (!currentUser) {
        console.log('当前用户未加载');
        return;
      }

      if (message.sender === currentUser._id) {
        console.log('跳过自己发送的消息');
        return;
      }

      if (selectedGroup && message.groupId === selectedGroup._id) {
        console.log('收到群组消息:', message);
        console.log('加密内容:', message.content.text);
        console.log('IV:', message.content.iv);
        
        // 1. 获取群组密钥
        const response = await fetch(api.groups.key(selectedGroup._id), {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (!response.ok) {
          throw new Error('获取群组密钥失败');
        }

        const { groupKey } = await response.json();
        console.log('获取到群组密钥:', groupKey);

        // 2. 解密消息
        console.log('准备解密实时消息:', {
          content: message.content.text || message.content,
          iv: message.content.iv || message.iv,
          groupKey: groupKey
        });

        const decryptedContent = cryptoService.decryptGroupMessage(
          message.content.text || message.content,
          groupKey,
          message.content.iv || message.iv
        );

        console.log('实时消息解密结果:', decryptedContent);

        // 3. 添加到消息列表
        setMessages(prev => [...prev, {
          sender: message.sender,
          senderName: message.senderName,
          content: decryptedContent,
          createdAt: message.createdAt
        }]);
        scrollToBottom();
      }
    } catch (error) {
      console.error('处理群组消息失败:', error);
      handleError('处理群组消息失败: ' + error.message);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      let message;
      if (selectedUser) {
        // 私聊消息加密
        const encryptedContent = cryptoService.encryptMessage(newMessage, selectedUser._id);
        
        message = {
          type: 'message',
          receiver: selectedUser._id,
          content: {
            receiverKey: encryptedContent.receiverKey,
            senderKey: encryptedContent.senderKey,
            content: encryptedContent.content,
            iv: encryptedContent.iv,
            signature: encryptedContent.signature
          }
        };

        // 添加到本地消息列表
        const localMessage = {
          sender: currentUser._id,
          content: newMessage,  // 使用原始消息
          createdAt: new Date().toISOString()
        };
        setMessages(prev => [...prev, localMessage]);
      } else if (selectedGroup) {
        console.log('准备发送群组消息:', selectedGroup._id);
        
        const response = await fetch(api.groups.key(selectedGroup._id), {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (!response.ok) {
          throw new Error('获取群组密钥失败');
        }

        const { groupKey } = await response.json();
        console.log('获取到群组密钥:', groupKey);

        // 加密消息
        const { encryptedContent, iv } = cryptoService.encryptGroupMessage(newMessage, groupKey);
        console.log('消息加密结果:', { encryptedContent, iv });
        
        message = {
          type: 'groupMessage',
          groupId: selectedGroup._id,
          encryptedContent,
          iv
        };

        // 添加到本地消息列表（示原文）
        setMessages(prev => [...prev, {
          sender: currentUser._id,
          senderName: '我',
          content: newMessage,
          createdAt: new Date().toISOString()
        }]);
      }

      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify(message));
        setNewMessage('');
        scrollToBottom();
      } else {
        handleError('WebSocket连接已断开');
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      handleError('发送消息失败: ' + error.message);
    }
  };

  const fetchCurrentUser = async () => {
    try {
      const response = await fetch(api.user.current, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('获取当前用户信息失败');
      }

      const user = await response.json();
      console.log('当前用户信息:', user);
      setCurrentUser(user);
      return user;
    } catch (error) {
      console.error('获取当前用户信息失败:', error);
      handleError('获取当前用户信息失败');
      navigate('/login');
      return null;
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch(api.user.list, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const usersList = await response.json();
        setUsers(usersList);

        // 为每个用户设置公钥
        usersList.forEach(user => {
          if (user.publicKey) {
            cryptoService.setOtherPublicKey(user._id, user.publicKey);
            console.log('设置用户公钥:', user.username, user.publicKey);
          }
        });
      }
    } catch (error) {
      console.error('获取用户列表失败:', error);
      handleError('获取用户列表失败');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleUserSelect = async (user) => {
    try {
      setSelectedUser(user);
      setSelectedGroup(null);
      setMessages([]); // 清空之前的消息

      // 获取历史消息
      const response = await fetch(api.messages.list(user._id), {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('获取消息失败');
      }

      const historicalMessages = await response.json();
      console.log('获取到的历史消息:', historicalMessages);

      // 处理每条历史消息
      const processedMessages = await Promise.all(historicalMessages.map(async msg => {
        try {
          // 确定哪个密钥
          const isReceived = msg.sender === user._id;
          const messageKey = isReceived ? msg.content.receiverKey : msg.content.senderKey;
          
          console.log('处理历史消息:', {
            messageId: msg._id,
            isReceived,
            hasKey: !!messageKey,
            sender: msg.sender,
            currentUser: currentUser._id
          });

          const decryptedContent = cryptoService.decryptMessage({
            key: messageKey,
            iv: msg.content.iv,
            content: msg.content.content,
            signature: msg.content.signature
          }, isReceived ? user.publicKey : currentUser.publicKey);

          return {
            _id: msg._id,
            sender: msg.sender,
            content: decryptedContent,
            createdAt: msg.createdAt
          };
        } catch (error) {
          console.error('解密历史消息失败:', {
            error: error.message,
            messageId: msg._id,
            sender: msg.sender
          });
          return {
            _id: msg._id,
            sender: msg.sender,
            content: '消息解密失败',
            createdAt: msg.createdAt
          };
        }
      }));

      console.log('处理后的消息:', processedMessages);
      setMessages(processedMessages);
      scrollToBottom();
    } catch (error) {
      console.error('选择用户失败:', error);
      handleError('加载消息失败: ' + error.message);
    }
  };

  const fetchGroups = async () => {
    try {
      const response = await fetch(api.groups.my, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setGroups(data);
      }
    } catch (error) {
      console.error('获取群组列表失败:', error);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(api.groups.base, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(groupFormData)
      });

      const data = await response.json();

      if (response.ok) {
        setGroupFormData({ name: '', description: '' });
        setShowCreateGroup(false);
        handleError('群组创建成功', 2000, 'success');
        await fetchGroups();
      } else {
        handleError(data.message || '创建群组失败');
      }
    } catch (error) {
      console.error('创建群组失败:', error);
      handleError('创建群���失败');
    }
  };

  const handleGroupSelect = async (group) => {
    try {
      console.log('选择群组:', group.name);
      setSelectedGroup(group);
      setSelectedUser(null);
      setShowProfile(false);
      
      // 加载群组消息
      await loadMessages();
    } catch (error) {
      console.error('选择群组失败:', error);
      handleError('选择群组失败: ' + error.message);
    }
  };

  const fetchAvailableGroups = async () => {
    try {
      const response = await fetch(api.groups.available, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setAvailableGroups(data);
      }
    } catch (error) {
      console.error('获取可加入群组列表失败:', error);
    }
  };

  const handleJoinGroup = async (groupId) => {
    try {
      const response = await fetch(api.groups.join(groupId), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        setShowAvailableGroups(false);
        handleError('申请已提交，请等待群主审核', 2000);
        fetchAvailableGroups();
      } else {
        const data = await response.json();
        handleError(data.message);
      }
    } catch (error) {
      console.error('申请加入群组失败:', error);
      handleError('申请加入群组失败');
    }
  };

  const fetchPendingMembers = async (groupId) => {
    try {
      const response = await fetch(api.groups.pending(groupId), {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setPendingMembers(data);
      }
    } catch (error) {
      console.error('获取待审核成员失败:', error);
    }
  };

  const handleMemberApproval = async (groupId, userId, approve) => {
    try {
      const response = await fetch(api.groups.members(groupId, userId), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ approve })
      });

      if (response.ok) {
        await fetchPendingMembers(groupId);
        handleError(approve ? '已同意加入申请' : '已拒绝申请', 2000, 'success');
      } else {
        const data = await response.json();
        handleError(data.message);
      }
    } catch (error) {
      console.error('处理审核失败:', error);
      handleError('处理审核失败');
    }
  };

  const fetchGroupMembers = async (groupId) => {
    try {
      const response = await fetch(api.groups.membersList(groupId), {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setGroupMembers(data);
      }
    } catch (error) {
      console.error('获取群组成员列表失败:', error);
    }
  };

  const handleLeaveGroup = async (groupId) => {
    if (!window.confirm('确定要退出该群聊吗？')) return;
    
    try {
      console.log('准备退出群组:', groupId);
      const response = await fetch(`/api/groups/${groupId}/leave`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('退出群聊失败');
      }

      console.log('成功退出群组');
      // 更新群组列表
      await fetchGroups();
      setSelectedGroup(null);
      handleError('已退出群聊', 2000, 'success');
    } catch (error) {
      console.error('退出群聊失败:', error);
      handleError('退出群聊失败: ' + error.message);
    }
  };

  const handleDisbandGroup = async (groupId) => {
    if (!window.confirm('确定要解散该群聊吗？此操作不可恢复！')) return;

    try {
      console.log('准备解散群组:', groupId);
      const response = await fetch(`/api/groups/${groupId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('解散群聊失败');
      }

      console.log('成功解散群组');
      // 更新群组列表
      await fetchGroups();
      setSelectedGroup(null);
      handleError('群聊已解散', 2000, 'success');
    } catch (error) {
      console.error('解散群组失败:', error);
      handleError('解散群组失败: ' + error.message);
    }
  };

  const handleRemoveMember = async (groupId, userId) => {
    if (!window.confirm('确定要移除该成员吗？')) return;

    try {
      console.log('准备移除群组成员:', { groupId, userId });
      const response = await fetch(`/api/groups/${groupId}/members/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('移除成员失败');
      }

      console.log('成��移除群组成员');
      // 重新获取群组成员列表
      await fetchGroupMembers(groupId);
      handleError('已移除成员', 2000, 'success');
    } catch (error) {
      console.error('移除成员失败:', error);
      handleError('移除成员失败: ' + error.message);
    }
  };

  const handleProfileClick = () => {
    setShowProfile(true);
    setSelectedUser(null);
    setSelectedGroup(null);
  };

  const loadMessages = async () => {
    try {
      setMessages([]);
      
      if (selectedGroup) {
        console.log('加载群组消息:', selectedGroup._id);

        // 1. 获取群组密钥
        const keyResponse = await fetch(api.groups.key(selectedGroup._id), {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (!keyResponse.ok) {
          throw new Error('获取群组密钥失败');
        }

        const { groupKey } = await keyResponse.json();
        console.log('获取到群组密钥:', groupKey);

        // 2. 获取消息列表
        const messagesResponse = await fetch(api.groups.messages(selectedGroup._id), {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (!messagesResponse.ok) {
          throw new Error('��取群组消息失败');
        }

        const messages = await messagesResponse.json();
        console.log('获取到原始消息:', messages);

        // 3. 解密所有消息，包括自己发送的
        const decryptedMessages = messages.map(msg => {
          try {
            console.log('准备解密消息:', {
              content: msg.content,
              iv: msg.iv,
              groupKey: groupKey,
              sender: msg.sender,
              currentUser: currentUser._id
            });
            
            // 不再区分是否是自己发送的消息，统一解密
            const messageContent = cryptoService.decryptGroupMessage(
              msg.content,
              groupKey,
              msg.iv
            );
            console.log('消息解密结果:', messageContent);

            return {
              sender: msg.sender,
              senderName: msg.sender === currentUser._id ? '我' : msg.senderName,
              content: messageContent,
              createdAt: msg.createdAt
            };
          } catch (error) {
            console.error('解密消息失败:', {
              error: error,
              message: msg
            });
            return {
              sender: msg.sender,
              senderName: msg.sender === currentUser._id ? '我' : msg.senderName,
              content: '消息解密失败',
              createdAt: msg.createdAt
            };
          }
        });

        console.log('所有消息解密完成:', decryptedMessages);
        setMessages(decryptedMessages);
        scrollToBottom();
      }
    } catch (error) {
      console.error('加载消息失败:', error);
      handleError('加载消息失败: ' + error.message);
    }
  };

  const renderMessage = (msg) => {
    const isSentByMe = msg.sender === currentUser?._id;
    console.log('渲染消息:', {
      messageId: msg._id,
      content: msg.content,
      isSentByMe
    });
    
    return (
      <div 
        key={msg._id || msg.createdAt} 
        className={`message ${isSentByMe ? 'sent' : 'received'}`}
      >
        {selectedGroup && (
          <div className="message-sender">
            {isSentByMe ? '我' : msg.senderName}
          </div>
        )}
        <div className="message-wrapper">
          <div className="message-content">
            <div className="message-text">
              {typeof msg.content === 'string' ? msg.content : '消息格式错误'}
            </div>
          </div>
          <div className="message-time">
            {new Date(msg.createdAt).toLocaleString()}
          </div>
        </div>
      </div>
    );
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('token');
      await fetch(api.auth.logout, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (error) {
      console.error('登出失败:', error);
    } finally {
      // 清除本地存储的数据
      localStorage.removeItem('token');
      localStorage.removeItem('privateKey');
      navigate('/login');
    }
  };

  if (isLoading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="chat-container">
      {/* 左侧导航栏 */}
      <div className="nav-sidebar">
        <div 
          className={`nav-item profile ${showProfile ? 'active' : ''}`}
          onClick={() => {
            setShowProfile(true);
            setSelectedUser(null);
            setSelectedGroup(null);
            setShowUserList(false);
            setShowGroupList(false);
          }}
        />
        <div 
          className={`nav-item group ${showGroupList ? 'active' : ''}`}
          onClick={() => {
            setShowGroupList(true);
            setShowUserList(false);
            setShowProfile(false);
          }}
        />
        <div 
          className={`nav-item chat ${showUserList ? 'active' : ''}`}
          onClick={() => {
            setShowUserList(true);
            setShowGroupList(false);
            setShowProfile(false);
          }}
        />
        <div 
          className="nav-item logout"
          onClick={handleLogout}
        />
      </div>

      {/* 中间列表区域 */}
      {showProfile && (
        <div className="list-sidebar">
          <div className="list-header">
            <h3>个人中心</h3>
          </div>
          <div className="profile-menu">
            <div 
              className={`menu-item ${!showKeyManagement ? 'active' : ''}`}
              onClick={() => setShowKeyManagement(false)}
            >
              <i className="fas fa-user"></i>
              <span>个人信息</span>
            </div>
            <div 
              className={`menu-item ${showKeyManagement ? 'active' : ''}`}
              onClick={() => setShowKeyManagement(true)}
            >
              <i className="fas fa-key"></i>
              <span>密钥管理</span>
            </div>
          </div>
          <div className="profile-content">
            {!showKeyManagement ? (
              <div className="user-info-content">
                <div className="info-item">
                  <label>用户名</label>
                  <span>{currentUser?.username}</span>
                </div>
                <div className="info-item">
                  <label>邮箱</label>
                  <span>{currentUser?.email}</span>
                </div>
                <div className="info-item">
                  <label>注册时间</label>
                  <span>{new Date(currentUser?.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <KeyManagement />
            )}
          </div>
        </div>
      )}
      
      {showGroupList && (
        <div className="list-sidebar">
          <div className="list-header">
            <h3>群聊</h3>
          </div>
          <div className="group-menu">
            <div 
              className={`menu-item ${showCreateGroup ? 'active' : ''}`}
              onClick={() => {
                setShowCreateGroup(true);
                setShowAvailableGroups(false);
              }}
            >
              <i className="fas fa-plus-circle"></i>
              <span>创建群组</span>
            </div>
            <div 
              className={`menu-item ${showAvailableGroups ? 'active' : ''}`}
              onClick={() => {
                setShowAvailableGroups(true);
                setShowCreateGroup(false);
                fetchAvailableGroups();
              }}
            >
              <i className="fas fa-users"></i>
              <span>加入群组</span>
            </div>
          </div>
          <div className="group-content">
            {!showCreateGroup && !showAvailableGroups && (
              <div className="group-list">
                <div className="list-title">我的群组</div>
                {groups.map(group => (
                  <div
                    key={group._id}
                    className={`list-item ${selectedGroup?._id === group._id ? 'active' : ''}`}
                    onClick={() => handleGroupSelect(group)}
                  >
                    <div className="item-icon">
                      <i className="fas fa-users"></i>
                    </div>
                    <div className="item-info">
                      <div className="item-name">{group.name}</div>
                      <div className="item-desc">{group.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {showCreateGroup && (
              <div className="create-group-content">
                {/* 创建群组的表单内容 */}
              </div>
            )}
            {showAvailableGroups && (
              <div className="available-groups-content">
                {/* 可加入群组的列表内容 */}
              </div>
            )}
          </div>
        </div>
      )}

      {showUserList && (
        <div className="list-sidebar">
          <div className="list-header">
            <h3>私聊</h3>
          </div>
          <div className="search-container">
            <input
              type="text"
              placeholder="搜索用户..."
              onChange={(e) => {/* 添加搜索功能 */}}
            />
          </div>
          <div className="users-content">
            <div className="users-list">
              <div className="list-title">在线用户</div>
              {users.map(user => (
                <div
                  key={user._id}
                  className={`list-item ${selectedUser?._id === user._id ? 'active' : ''}`}
                  onClick={() => handleUserSelect(user)}
                >
                  <div className="item-icon">
                    <i className="fas fa-user"></i>
                  </div>
                  <div className="item-info">
                    <div className="item-name">{user.username}</div>
                    <div className="item-status">在线</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 主聊天区域 */}
      {(selectedUser || selectedGroup) && (
        <div className="chat-main">
          <div className="chat-header">
            <div className="header-title">
              {selectedUser?.username || selectedGroup?.name}
            </div>
            {selectedGroup && (
              <div className="header-actions">
                <button 
                  className="header-button"
                  onClick={() => {
                    setShowMembers(true);
                    fetchGroupMembers(selectedGroup._id);
                  }}
                >
                  成员列表
                </button>
                {/* 群主功能 */}
                {selectedGroup.members?.some(member => 
                  member.user === currentUser?._id && 
                  member.role === 'owner'
                ) && (
                  <>
                    <button 
                      className="header-button"
                      onClick={() => {
                        setShowPendingMembers(true);
                        fetchPendingMembers(selectedGroup._id);
                      }}
                    >
                      审核申请
                    </button>
                    <button 
                      className="header-button dissolve-button"
                      onClick={() => handleDisbandGroup(selectedGroup._id)}
                    >
                      解散群聊
                    </button>
                  </>
                )}
                {/* 普通成员功能 */}
                {selectedGroup.members?.some(member => 
                  member.user === currentUser?._id && 
                  member.role !== 'owner'
                ) && (
                  <button 
                    className="header-button leave-button"
                    onClick={() => handleLeaveGroup(selectedGroup._id)}
                  >
                    退出群聊
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="messages-container" ref={messagesEndRef}>
            {messages.map(msg => renderMessage(msg))}
          </div>

          <div className="message-form">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage(e)}
              placeholder="输入消息..."
            />
            <button onClick={handleSendMessage}>发送</button>
          </div>
        </div>
      )}

      {/* 群组成员���理模态框 */}
      {showMembers && selectedGroup && (
        <div className="modal">
          <div className="modal-content">
            <h3>群组成员</h3>
            <div className="members-list">
              {groupMembers.map(member => (
                <div key={member.user._id} className="member-item">
                  <span>{member.user.username}</span>
                  <span>{member.role === 'owner' ? '群主' : '成员'}</span>
                  {selectedGroup.members.some(m => 
                    m.user.toString() === currentUser?._id.toString() && 
                    m.role === 'owner' &&
                    member.user._id.toString() !== currentUser?._id.toString()
                  ) && (
                    <button 
                      className="member-action-btn"
                      onClick={() => handleRemoveMember(selectedGroup._id, member.user._id)}
                    >
                      移除
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setShowMembers(false)}>关闭</button>
          </div>
        </div>
      )}

      {/* 待审核成员模态框 */}
      {showPendingMembers && selectedGroup && (
        <div className="modal">
          <div className="modal-content">
            <h3>待审核成员</h3>
            <div className="pending-list">
              {pendingMembers.map(member => (
                <div key={member._id} className="pending-item">
                  <span>{member.username}</span>
                  <div className="pending-actions">
                    <button onClick={() => handleMemberApproval(selectedGroup._id, member._id, true)}>
                      同意
                    </button>
                    <button onClick={() => handleMemberApproval(selectedGroup._id, member._id, false)}>
                      拒绝
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowPendingMembers(false)}>关闭</button>
          </div>
        </div>
      )}

      {/* 创建群组模态框 */}
      {showCreateGroup && (
        <div className="modal">
          <div className="modal-content">
            <h3>创建群组</h3>
            <form onSubmit={handleCreateGroup}>
              <div className="form-group">
                <label>群组名称</label>
                <input
                  type="text"
                  value={groupFormData.name}
                  onChange={(e) => setGroupFormData({...groupFormData, name: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>群组描述</label>
                <textarea
                  value={groupFormData.description}
                  onChange={(e) => setGroupFormData({...groupFormData, description: e.target.value})}
                />
              </div>
              <div className="form-actions">
                <button type="submit">创建</button>
                <button type="button" onClick={() => setShowCreateGroup(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 可加入群组模态框 */}
      {showAvailableGroups && (
        <div className="modal">
          <div className="modal-content">
            <h3>可加入的群组</h3>
            <div className="available-groups-list">
              {availableGroups.map(group => (
                <div key={group._id} className="available-group-item">
                  <div className="group-info">
                    <h4>{group.name}</h4>
                    <p>{group.description}</p>
                  </div>
                  <button onClick={() => handleJoinGroup(group._id)}>申请加入</button>
                </div>
              ))}
            </div>
            <button onClick={() => setShowAvailableGroups(false)}>关闭</button>
          </div>
        </div>
      )}

      {error && (
        <div className={`message-alert ${error.type}`}>
          {error.message}
        </div>
      )}
    </div>
  );
};

export default ChatRoom; 