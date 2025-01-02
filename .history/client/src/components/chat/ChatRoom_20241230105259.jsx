import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './Chat.css';
import { api } from '../../config/api';
import cryptoService from '../../utils/crypto';
import KeyManagement from '../auth/KeyManagement';

// 聊天室主组件
const ChatRoom = () => {
  // 路由导航钩子
  const navigate = useNavigate();

  // 状态管理：消息、用户、群组、UI控制等
  const [messages, setMessages] = useState([]); // 消息列表
  const [newMessage, setNewMessage] = useState(''); // 新消息输入
  const [users, setUsers] = useState([]); // 用户列表
  const [selectedUser, setSelectedUser] = useState(null); // 选中的私聊用户
  const [currentUser, setCurrentUser] = useState(null); // 当前登录用户
  const [error, setError] = useState(''); // 错误信息
  
  // Refs用于引用DOM元素和WebSocket
  const messagesEndRef = useRef(null); // 消息滚动到底部
  const ws = useRef(null); // WebSocket连接
  const reconnectTimeout = useRef(null); // 重连超时
  const errorTimeoutRef = useRef(null); // 错误消息超时

  // 更多状态：群组、个人资料、UI控制等
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
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredUsers, setFilteredUsers] = useState([]);

  const handleError = (message, duration = 3000, type = 'error') => {
    // 清除之前的错误超时
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }

    // 设置错误状态
    setError({ message, type });

    // 设置定时清除错误消息
    errorTimeoutRef.current = setTimeout(() => {
      setError('');
    }, duration);
  };

  // 初始化副作用：检查登录状态、获取用户信息、初始化聊天
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    // 异步初始化聊天
    const init = async () => {
      setIsLoading(true);
      try {
        await initializeChat();
      } finally {
        setIsLoading(false);
      }
    };
    init();

    // 组件卸载时清理
    return cleanup;
  }, []);

  // 初始化聊天：获取私钥、用户信息、建立WebSocket连接
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

      // 4. 获取其他用户列表并设置他们的公钥
      await fetchUsers();

      // 5. 初始化WebSocket连接
      initializeWebSocket();
    } catch (error) {
      console.error('初始化聊天失败:', error);
      handleError('初始化聊天失败: ' + error.message);
    }
  };

  // WebSocket初始化：建立实时通信连接
  const initializeWebSocket = () => {
    // 清理之前的连接
    cleanup();

    // 创建WebSocket连接
    const token = localStorage.getItem('token');
    ws.current = new WebSocket(`${api.ws}?token=${token}`);

    // 连接建立事件
    ws.current.onopen = () => {
      console.log('WebSocket连接已建立');
    };

    // 接收消息事件
    ws.current.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('收到WebSocket消息:', message);

        // 处理不同类型的消息
        if (message.type === 'message') {
          await handlePrivateMessage(message);
        } else if (message.type === 'groupMessage') {
          await handleGroupMessage(message);
        }
      } catch (error) {
        console.error('处理消息失败:', error);
      }
    };

    // 连接关闭事件：自动重连
    ws.current.onclose = () => {
      console.log('WebSocket连接已断开，正在重新连接...');
      reconnectTimeout.current = setTimeout(initializeWebSocket, 3000);
    };

    // 错误处理
    ws.current.onerror = (error) => {
      console.error('WebSocket错误:', error);
    };
  };

  // ... 其他方法保持不变 ...

  // 渲染消息：根据发送者区分样式
  const renderMessage = (msg) => {
    // 判断是否为当前用户发送的消息
    const isSentByMe = msg.sender === currentUser?._id;
    
    return (
      <div 
        key={msg._id || msg.createdAt} 
        className={`message ${isSentByMe ? 'sent' : 'received'}`}
      >
        {/* 群组消息显示发送者名称 */}
        {selectedGroup && !isSentByMe && (
          <div className="message-sender">
            {msg.senderName}
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

  // 主渲染方法：聊天室整体布局
  return (
    <div className="chat-container">
      {/* 左侧导航栏 */}
      <div className="nav-sidebar">
        {/* 导航项：个人资料、群组、私聊、登出 */}
      </div>

      {/* 中间列表区域 */}
      {/* 包含个人中心、群组列表、用户列表 */}

      {/* 主聊天区域 */}
      {(selectedUser || selectedGroup) && (
        <div className="chat-main">
          {/* 聊天头部 */}
          {/* 消息列表 */}
          {/* 消息输入区 */}
        </div>
      )}

      {/* 各种模态框：群组成员、待审核成员、创建群组等 */}

      {/* 错误提示 */}
      {error && (
        <div className={`message-alert ${error.type}`}>
          {error.message}
        </div>
      )}
    </div>
  );
};

export default ChatRoom; 