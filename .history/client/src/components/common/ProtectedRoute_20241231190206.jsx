import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../../config/api';

const ProtectedRoute = ({ children, role }) => {
  // 使用useState管理状态
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);

  // 1. 验证用户身份
  useEffect(() => {
    const verifyUser = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }
        // 验证 token 有效性
        const response = await fetch(api.user.current, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const user = await response.json();
          setUserRole(user.role);
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('token');
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('验证用户失败:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    verifyUser();
  }, []);

  if (isLoading) {
    return <div className="loading">加载中...</div>;
  }

  // 2. 根据验证结果进行路由控制
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role && role !== userRole) {
    return <Navigate to={userRole === 'admin' ? '/admin' : '/chat'} replace />;
  }

  return children; 
};

export default ProtectedRoute; 