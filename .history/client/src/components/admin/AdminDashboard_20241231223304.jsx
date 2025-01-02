import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UserManagement from './UserManagement';
import LogManagement from './LogManagement';
import './Admin.css';
import { api } from '../../config/api';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [activeMenu, setActiveMenu] = useState('users');

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
      localStorage.removeItem('token');
      navigate('/login');
    }
  };

  
  const renderContent = () => {
    switch (activeMenu) {
      case 'users':
        return <UserManagement />;
      case 'logs':
        return <LogManagement />;
      default:
        return <UserManagement />;
    }
  };

  return (
    <div className="admin-layout">
      <div className="admin-sidebar">
        <div className="sidebar-header">
          <h2>管理控制台</h2>
        </div>
        <nav className="sidebar-menu">
          <div 
            className={`menu-item ${activeMenu === 'users' ? 'active' : ''}`}
            onClick={() => setActiveMenu('users')}
          >
            <i className="fas fa-users"></i>
            用户管理
          </div>
          <div 
            className={`menu-item ${activeMenu === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveMenu('logs')}
          >
            <i className="fas fa-clipboard-list"></i>
            日志管理
          </div>
        </nav>
        <div className="sidebar-footer">
          <button onClick={handleLogout} className="logout-button">
            <i className="fas fa-sign-out-alt"></i>
            退出登录
          </button>
        </div>
      </div>
      <div className="admin-content">
        {renderContent()}
      </div>
    </div>
  );
};

export default AdminDashboard; 