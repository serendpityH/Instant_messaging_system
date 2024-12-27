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
      const privateKey = localStorage.getItem('privateKey');
      if (!privateKey) {
        console.error('未找到私钥');
        navigate('/login');
        return;
      }
      cryptoService.setPrivateKey(privateKey);

      await fetchCurrentUser();
      await fetchUsers();
      initializeWebSocket();
    } catch (error) {
      console.error('初始化聊天失败:', error);
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
      if (message.sender === currentUser._id) {
        return;
      }

      if (selectedUser && message.sender === selectedUser._id) {
        const senderPublicKey = selectedUser.publicKey;
        const decryptedContent = cryptoService.decryptMessage(message.content, senderPublicKey);

        setMessages(prev => [...prev, {
          sender: message.sender,
          content: {
            ...message.content,
            originalContent: decryptedContent
          },
          createdAt: message.createdAt
        }]);
        scrollToBottom();
      }
    } catch (error) {
      console.error('处理私聊消息失败:', error);
      handleError('处理消息失败: ' + error.message);
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
        // 确保我们有发送者（自己）的公钥
        const myPublicKey = localStorage.getItem('publicKey');
        if (!myPublicKey) {
          throw new Error('未找到您的公钥');
        }

        // 确保我们有接收者的公钥
        if (!selectedUser.publicKey) {
          throw new Error('未找到接收者的公钥');
        }

        // 设置接收者的公钥
        cryptoService.setOtherPublicKey(selectedUser._id, selectedUser.publicKey);
        // 设置发送者（自己）的公钥
        cryptoService.setMyPublicKey(myPublicKey);

        const encryptedContent = cryptoService.encryptMessage(newMessage, selectedUser._id);
        message = {
          type: 'message',
          content: {
            receiverKey: encryptedContent.receiverKey,
            senderKey: encryptedContent.senderKey,
            iv: encryptedContent.iv,
            content: encryptedContent.content,
            signature: encryptedContent.signature
          },
          receiver: selectedUser._id
        };

        // 本地显示时直接使用原文
        setMessages(prev => [...prev, {
          sender: currentUser._id,
          content: newMessage,
          createdAt: new Date().toISOString()
        }]);
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

        // 添加到本地消息列表（显示原文）
        setMessages(prev => [...prev, {
          sender: currentUser._id,
          senderName: '我',
          content: newMessage,
          createdAt: new Date().toISOString()
        }]);
      }

      // 发送消息
      if (message) {
        console.log('发送消息:', message);
        ws.current.send(JSON.stringify(message));
        setNewMessage('');
        scrollToBottom();
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
    } catch (error) {
      console.error('获取当前用户信息失败:', error);
      handleError('获取当前用户信息失败');
      navigate('/login');
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
        const data = await response.json();
        const filteredUsers = data.filter(user => user._id !== currentUser?._id);
        setUsers(filteredUsers);
        
        filteredUsers.forEach(user => {
          cryptoService.setOtherPublicKey(user._id, user.publicKey);
        });
      }
    } catch (error) {
      console.error('获取用户列表失败:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleUserSelect = async (user) => {
    setSelectedUser(user);
    setMessages([]);
    
    try {
      const response = await fetch(`${api.messages}/${user._id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        
        const processedMessages = data.map(msg => {
          if (msg.sender === currentUser._id) {
            return {
              ...msg,
              content: msg.content.originalContent || msg.content
            };
          } else {
            try {
              const sender = users.find(u => u._id === msg.sender);
              if (!sender) {
                return {
                  ...msg,
                  content: '[无法验证的消息]'
                };
              }
              const decryptedContent = cryptoService.decryptMessage(msg.content, sender.publicKey);
              return {
                ...msg,
                content: decryptedContent
              };
            } catch (error) {
              console.error('解密历史消息失败:', error);
              return {
                ...msg,
                content: error.message.includes('签名验证失败') ? 
                  '[消息可能被篡改]' : '[加密消息]'
              };
            }
          }
        });

        setMessages(processedMessages);
        scrollToBottom();
      }
    } catch (error) {
      console.error('获取聊天记录失败:', error);
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
      handleError('创建群组失败');
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
        handleError(approve ? '已同意加入申请' : '已拒绝加入申请', 2000, 'success');
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
    if (!window.confirm('确定要退出该群组吗？')) {
      return;
    }

    try {
      const response = await fetch(api.groups.leave(groupId), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        handleError('已退出群组', 2000, 'success');
        setShowMembers(false);
        setSelectedGroup(null);
        await fetchGroups();
      } else {
        const data = await response.json();
        handleError(data.message);
      }
    } catch (error) {
      console.error('退出群组失败:', error);
      handleError('退出群组失败');
    }
  };

  const handleDisbandGroup = async (groupId) => {
    if (!window.confirm('确定要解散该群组吗？此操作不可恢复！')) {
      return;
    }

    try {
      const response = await fetch(api.groups.delete(groupId), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        handleError('群组已解散', 2000, 'success');
        setShowMembers(false);
        setSelectedGroup(null);
        await fetchGroups();
      } else {
        const data = await response.json();
        handleError(data.message);
      }
    } catch (error) {
      console.error('解散群组失败:', error);
      handleError('解散群组失败');
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm('确定要移除该成员吗？')) {
      return;
    }

    try {
      const response = await fetch(api.groups.removeMember(selectedGroup._id, userId), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        handleError('已移除该成员', 2000, 'success');
        await fetchGroupMembers(selectedGroup._id);
      } else {
        const data = await response.json();
        handleError(data.message);
      }
    } catch (error) {
      console.error('移除成员失败:', error);
      handleError('移除成员失败');
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
      
      if (selectedUser) {
        console.log('加载私聊消息');
        const response = await fetch(api.messages.list(selectedUser._id), {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (!response.ok) {
          throw new Error('获取私聊消息失败');
        }

        const messages = await response.json();
        console.log('获取到原始私聊消息:', messages);

        // 解密私聊消息
        const decryptedMessages = messages.map(msg => {
          try {
            const isSentByMe = msg.sender === currentUser._id;
            const messageContent = cryptoService.decryptMessage({
              key: msg.key,  // 服务器已经返回了正确的密钥
              iv: msg.iv,
              content: msg.content,
              signature: msg.signature
            }, isSentByMe ? selectedUser.publicKey : selectedUser.publicKey);

            return {
              sender: msg.sender,
              content: messageContent,
              createdAt: msg.createdAt
            };
          } catch (error) {
            console.error('解密私聊消息失败:', error);
            return {
              sender: msg.sender,
              content: '消息解密失败',
              createdAt: msg.createdAt
            };
          }
        });

        setMessages(decryptedMessages);
      } else if (selectedGroup) {
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
          throw new Error('获取群组消息失败');
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
    console.log('渲染消息:', msg);
    
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
              {msg.content.originalContent || msg.content}
            </div>
          </div>
          <div className="message-time">
            {new Date(msg.createdAt).toLocaleString()}
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="chat-container">
      <div className="users-list">
        <div className="list-header">
          <button onClick={handleProfileClick}>个人信息</button>
        </div>
        <div className="list-section">
          <div className="list-header">
            <button onClick={() => setShowCreateGroup(true)}>创建群组</button>
            <button onClick={() => {
              setShowAvailableGroups(true);
              fetchAvailableGroups();
            }}>加入群组</button>
          </div>
          <h3>我的群组</h3>
          {groups.map(group => (
            <div
              key={group._id}
              className={`list-item ${selectedGroup?._id === group._id ? 'selected' : ''}`}
              onClick={() => handleGroupSelect(group)}
            >
              {group.name}
            </div>
          ))}
        </div>
        <div className="list-section">
          <h3>用户</h3>
          {users.map(user => (
            <div
              key={user._id}
              className={`list-item ${selectedUser?._id === user._id ? 'selected' : ''}`}
              onClick={() => handleUserSelect(user)}
            >
              {user.username}
            </div>
          ))}
        </div>
        <div className="key-management-button">
          <button onClick={() => setShowKeyManagement(!showKeyManagement)}>
            {showKeyManagement ? '隐藏密钥管理' : '密钥管理'}
          </button>
        </div>
        {showKeyManagement && <KeyManagement />}
      </div>
      {selectedUser ? (
        <div className="chat-main">
          <div className="chat-header">
            与 {selectedUser.username} 聊天中
          </div>
          <div className="chat-content">
            <div className="messages-container">
              {messages.map(renderMessage)}
              <div ref={messagesEndRef} />
            </div>
            <form className="message-form" onSubmit={handleSendMessage}>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="输入消息..."
              />
              <button type="submit">发送</button>
            </form>
          </div>
        </div>
      ) : selectedGroup ? (
        <div className="chat-main">
          <div className="chat-header">
            <div className="group-info-header">
              <h3>{selectedGroup.name}</h3>
              <div className="group-actions">
                <button 
                  className="members-button"
                  onClick={() => {
                    setShowMembers(true);
                    fetchGroupMembers(selectedGroup._id);
                  }}
                >
                  成员列表
                </button>
                {selectedGroup.members.some(
                  member => member.user._id === currentUser?._id && member.role === 'owner'
                ) && (
                  <button 
                    className="review-button"
                    onClick={() => {
                      setShowPendingMembers(true);
                      fetchPendingMembers(selectedGroup._id);
                    }}
                  >
                    审核申请
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="chat-content">
            <div className="messages-container">
              {messages.map(renderMessage)}
              <div ref={messagesEndRef} />
            </div>
            <form className="message-form" onSubmit={handleSendMessage}>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="输入消息..."
              />
              <button type="submit">发送</button>
            </form>
          </div>
        </div>
      ) : showProfile ? (
        <div className="chat-main">
          <div className="chat-header">
            <h3>个人信息</h3>
          </div>
          <div className="profile-container">
            <div className="profile-form">
              <div className="form-group">
                <label>用户名</label>
                <input
                  type="text"
                  value={currentUser?.username || ''}
                  disabled
                />
              </div>
              <div className="form-group">
                <label>邮箱</label>
                <input
                  type="email"
                  value={currentUser?.email || ''}
                  disabled
                />
              </div>
              <div className="form-group">
                <label>注册时间</label>
                <input
                  type="text"
                  value={currentUser?.createdAt ? new Date(currentUser.createdAt).toLocaleString() : ''}
                  disabled
                />
              </div>
            </div>
            <div className="profile-actions">
              <button onClick={() => setShowKeyManagement(true)}>
                密钥管理
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="no-chat-selected">
          请选择一个聊天对象或查看个人信息
        </div>
      )}
      {showCreateGroup && (
        <div className="modal">
          <div className="modal-content">
            <h3>创建群组</h3>
            <form onSubmit={handleCreateGroup}>
              <div className="form-group">
                <label>群组名称：</label>
                <input
                  type="text"
                  value={groupFormData.name}
                  onChange={(e) => setGroupFormData({...groupFormData, name: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>群组描述：</label>
                <textarea
                  value={groupFormData.description}
                  onChange={(e) => setGroupFormData({...groupFormData, description: e.target.value})}
                />
              </div>
              <div className="button-group">
                <button type="submit">创建</button>
                <button type="button" onClick={() => setShowCreateGroup(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showAvailableGroups && (
        <div className="modal">
          <div className="modal-content">
            <h3>可加入的群组</h3>
            {availableGroups.length > 0 ? (
              <div className="available-groups">
                {availableGroups.map(group => (
                  <div key={group._id} className="available-group-item">
                    <div className="group-info">
                      <h4>{group.name}</h4>
                      <p>{group.description || '暂无描述'}</p>
                      <small>创建者: {group.creator.username}</small>
                    </div>
                    <button onClick={() => handleJoinGroup(group._id)}>
                      申请加入
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-groups">无可加入的群组</p>
            )}
            <div className="modal-footer">
              <button onClick={() => setShowAvailableGroups(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className={`message-alert ${error.type}`}>
          {error.message}
        </div>
      )}
      {showPendingMembers && (
        <div className="modal">
          <div className="modal-content">
            <h3>待审核成员</h3>
            {pendingMembers.length > 0 ? (
              <div className="pending-members">
                {pendingMembers.map(member => (
                  <div key={member.user._id} className="pending-member-item">
                    <div className="member-info">
                      <h4>{member.user.username}</h4>
                      <p>申请时间: {new Date(member.requestedAt).toLocaleString()}</p>
                    </div>
                    <div className="approval-buttons">
                      <button
                        className="approve"
                        onClick={() => handleMemberApproval(selectedGroup._id, member.user._id, true)}
                      >
                        同意
                      </button>
                      <button
                        className="reject"
                        onClick={() => handleMemberApproval(selectedGroup._id, member.user._id, false)}
                      >
                        拒绝
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-pending">暂无待审核成员</p>
            )}
            <div className="modal-footer">
              <button onClick={() => setShowPendingMembers(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
      {showMembers && (
        <div className="modal">
          <div className="modal-content">
            <h3>群组成员</h3>
            <div className="members-list">
              {groupMembers.map(member => (
                <div key={member.user._id} className="member-item">
                  <div className="member-info">
                    <h4>{member.user.username}</h4>
                    <span className="member-role">
                      {member.role === 'owner' ? '群主' : '成员'}
                    </span>
                  </div>
                  <div className="member-actions">
                    <div className="member-join-time">
                      加入时间：{new Date(member.joinedAt).toLocaleString()}
                    </div>
                    {selectedGroup?.members.some(
                      m => m.user._id === currentUser?._id && m.role === 'owner'
                    ) && member.role !== 'owner' && (
                      <button 
                        className="remove-member-button"
                        onClick={() => handleRemoveMember(member.user._id)}
                      >
                        移除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <div className="group-management">
                {selectedGroup?.members.some(
                  member => member.user._id === currentUser?._id && member.role === 'owner'
                ) ? (
                  <button 
                    className="disband-button"
                    onClick={() => handleDisbandGroup(selectedGroup._id)}
                  >
                    解散群组
                  </button>
                ) : (
                  <button 
                    className="leave-button"
                    onClick={() => handleLeaveGroup(selectedGroup._id)}
                  >
                    退出群组
                  </button>
                )}
              </div>
              <button onClick={() => setShowMembers(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatRoom; 