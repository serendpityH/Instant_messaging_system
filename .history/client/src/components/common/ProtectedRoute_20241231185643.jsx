import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../../config/api';

const ProtectedRoute = ({ children, role }) => {
  // 使用useState管理状态
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);

  
  useEffect(() => {
    const verifyUser = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }

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

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role && role !== userRole) {
    return <Navigate to={userRole === 'admin' ? '/admin' : '/chat'} replace />;
  }

  return children;
};

export default ProtectedRoute; 