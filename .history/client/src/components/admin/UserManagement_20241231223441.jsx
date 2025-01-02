import React, { useState, useEffect } from 'react';
import { api } from '../../config/api';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [searchParams, setSearchParams] = useState({
    username: '',
    email: ''
  });

  const [formData, setFormData] = useState({
    username: '',
    email: ''
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  // 获取用户列表
  const fetchUsers = async () => {
    try {
      const response = await fetch(api.admin.users, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        throw new Error('获取用户列表失败');
      }
    } catch (error) {
      setError('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    // 实现搜索逻辑
    const filteredUsers = users.filter(user => {
      const matchUsername = user.username.toLowerCase().includes(searchParams.username.toLowerCase());
      const matchEmail = user.email.toLowerCase().includes(searchParams.email.toLowerCase());
      return matchUsername && matchEmail;
    });
    setUsers(filteredUsers);
  };

  const handleExport = () => {
    // 导出用户列表为CSV
    const headers = ['用户名', '邮箱', '注册时间'];
    const csvContent = users.map(user => {
      return [
        user.username,
        user.email,
        new Date(user.createdAt).toLocaleString()
      ].join(',');
    });

    const csv = [headers.join(','), ...csvContent].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '用户列表.csv';
    link.click();
  };

  
  const handleEditUser = (user) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      email: user.email
    });
    setEditMode(true);
  };

  // 更新用户
  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${api.admin.users}/${selectedUser._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      if (response.ok) {
        setSuccess('用户信息更新成功');
        setUsers(users.map(user => 
          user._id === selectedUser._id ? { ...user, ...formData } : user
        ));
        setEditMode(false);
        setSelectedUser(null);
      } else {
        setError(data.message || '更新失败');
      }
    } catch (error) {
      setError('更新失败，请稍后重试');
    }
  };

  // 删除用户
  const handleDeleteUser = async (userId) => {
    if (!window.confirm('确定要删除此用户吗？此操作不可撤销。')) {
      return;
    }

    try {
      const response = await fetch(`${api.admin.users}/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        setSuccess('用户删除成功');
        setUsers(users.filter(user => user._id !== userId));
      } else {
        const data = await response.json();
        setError(data.message || '删除失败');
      }
    } catch (error) {
      setError('删除失败，请稍后重试');
    }
  };

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="user-management">
      <div className="page-header">
        <h2>用户管理</h2>
        <div className="header-actions">
          <button className="btn-export" onClick={handleExport}>导出</button>
        </div>
      </div>

      <div className="search-bar">
        <form onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="用户名"
            value={searchParams.username}
            onChange={e => setSearchParams({...searchParams, username: e.target.value})}
          />
          <input
            type="text"
            placeholder="邮箱"
            value={searchParams.email}
            onChange={e => setSearchParams({...searchParams, email: e.target.value})}
          />
          <button type="submit">查询</button>
          <button type="button" onClick={() => {
            setSearchParams({ username: '', email: '' });
            fetchUsers(); // 重置时重新获取所有用户
          }}>重置</button>
        </form>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>用户名</th>
              <th>邮箱</th>
              <th>公钥</th>
              <th>注册时间</th>
              <th>角色</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user._id}>
                <td>{user.username}</td>
                <td>{user.email}</td>
                <td>
                  <div className="public-key" title={user.publicKey}>
                    {user.publicKey ? user.publicKey.substring(0, 20) + '...' : '-'}
                  </div>
                </td>
                <td>{new Date(user.createdAt).toLocaleString()}</td>
                <td>{user.role === 'admin' ? '管理员' : '普通用户'}</td>
                <td>
                  <button 
                    onClick={() => handleEditUser(user)}
                    className="btn-edit"
                  >
                    编辑
                  </button>
                  {user.role !== 'admin' && (
                    <button 
                      onClick={() => handleDeleteUser(user._id)}
                      className="btn-delete"
                    >
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <span>共 {users.length} 条</span>
      </div>

      {editMode && selectedUser && (
        <div className="modal">
          <div className="modal-content">
            <h3>编辑用户信息</h3>
            <form onSubmit={handleUpdateUser}>
              <div className="form-group">
                <label>用户名：</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>邮箱：</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  required
                />
              </div>
              <div className="button-group">
                <button type="submit">保存</button>
                <button type="button" onClick={() => {
                  setEditMode(false);
                  setSelectedUser(null);
                }}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement; 