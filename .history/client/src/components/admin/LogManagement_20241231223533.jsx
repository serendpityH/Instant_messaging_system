import React, { useState, useEffect } from 'react';
import { api } from '../../config/api';
import './Admin.css';

// 日志管理
const LogManagement = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchParams, setSearchParams] = useState({
    username: '',
    type: '',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    fetchLogs();
  }, [page]);

  // 获取日志
  const fetchLogs = async () => {
    try {
      const queryParams = new URLSearchParams({
        page,
        limit: 20,
        ...searchParams
      });

      const response = await fetch(`${api.admin.logs}?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs);
        setTotalPages(data.totalPages);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || '获取日志失败');
      }
    } catch (error) {
      console.error('获取日志错误:', error);
      setError(error.message || '获取日志失败');
    } finally {
      setLoading(false);
    }
  };

  
  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const getActionText = (type, action) => {
    switch (type) {
      case 'login':
        return '登录系统';
      case 'logout':
        return '退出系统';
      case 'register':
        return '注册账号';
      case 'update':
        return `更新${action}`;
      case 'delete':
        return `删除${action}`;
      default:
        return action;
    }
  };

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="log-management">
      <div className="page-header">
        <h2>日志管理</h2>
      </div>

      <div className="search-bar">
        <form onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="用户名"
            value={searchParams.username}
            onChange={e => setSearchParams({...searchParams, username: e.target.value})}
          />
          <select
            value={searchParams.type}
            onChange={e => setSearchParams({...searchParams, type: e.target.value})}
          >
            <option value="">操作类型</option>
            <option value="login">登录</option>
            <option value="logout">退出</option>
            <option value="register">注册</option>
            <option value="update">更新</option>
            <option value="delete">删除</option>
          </select>
          <input
            type="date"
            value={searchParams.startDate}
            onChange={e => setSearchParams({...searchParams, startDate: e.target.value})}
          />
          <span>至</span>
          <input
            type="date"
            value={searchParams.endDate}
            onChange={e => setSearchParams({...searchParams, endDate: e.target.value})}
          />
          <button type="submit">查询</button>
          <button type="button" onClick={() => {
            setSearchParams({
              username: '',
              type: '',
              startDate: '',
              endDate: ''
            });
            setPage(1);
            fetchLogs();
          }}>重置</button>
        </form>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>用户名</th>
              <th>操作类型</th>
              <th>操作详情</th>
              <th>IP地址</th>
              <th>状态</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log._id}>
                <td>{log.username}</td>
                <td>{log.type}</td>
                <td>{getActionText(log.type, log.action)}</td>
                <td>{log.ip}</td>
                <td>
                  <span className={`status-tag ${log.status}`}>
                    {log.status === 'success' ? '成功' : '失败'}
                  </span>
                </td>
                <td>{new Date(log.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <span>共 {logs.length} 条</span>
        <button 
          disabled={page === 1}
          onClick={() => setPage(p => p - 1)}
        >
          上一页
        </button>
        <span>第 {page} 页</span>
        <button 
          disabled={page === totalPages}
          onClick={() => setPage(p => p + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  );
};

export default LogManagement; 