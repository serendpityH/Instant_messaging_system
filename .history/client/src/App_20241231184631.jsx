import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import ChatRoom from './components/chat/ChatRoom';
import AdminDashboard from './components/admin/AdminDashboard';
// import UserProfile from './components/user/UserProfile';
import ProtectedRoute from './components/common/ProtectedRoute';
import './App.css';

const App = () => {
  return (
    <div className="app">
      <div className="main-content">
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route 
              path="/chat" 
              element={
                <ProtectedRoute role="user">
                  <ChatRoom />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin" 
              element={
                <ProtectedRoute role="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              } 
            />
            {/* <Route 
              path="/profile" 
              element={
                <ProtectedRoute>
                  <UserProfile />
                </ProtectedRoute>
              } 
            /> */}
            <Route path="/" element={<Navigate to="/login" replace />} />
          </Routes>
        </Router>
      </div>
    </div>
  );
};

export default App; 