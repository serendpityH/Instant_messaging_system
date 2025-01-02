import React, { useState } from 'react';
import './Auth.css';

const KeyManagement = () => {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 导出密钥
  const exportKeys = () => {
    try {
      const privateKey = localStorage.getItem('privateKey');
      if (!privateKey) {
        setError('未找到私钥');
        return;
      }

      const keyData = {
        privateKey,
        exportTime: new Date().toISOString() // 导出时间
      };

      // 创建blob对象，将JavaScript对象转换为JSON字符串
      const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); // 创建对象url
      const a = document.createElement('a');
      a.href = url;  
      a.download = `chat-keys-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess('密钥已成功导出');
      setError('');
    } catch (err) {
      console.error('导出密钥失败:', err);
      setError('导出密钥失败');
    }
  };

  const importKeys = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const keyData = JSON.parse(e.target.result);
        if (!keyData.privateKey) {
          setError('无效的密钥文件');
          return;
        }

        localStorage.setItem('privateKey', keyData.privateKey);
        setSuccess('密钥已成功导入');
        setError('');
      } catch (err) {
        console.error('导入密钥失败:', err);
        setError('导入密钥失败');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="key-management">
      <h3>密钥管理</h3>
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}
      <div className="key-actions">
        <button onClick={exportKeys} className="key-button">
          导出密钥
        </button>
        <div className="key-import">
          <label htmlFor="key-file" className="key-button">
            导入密钥
          </label>
          <input
            type="file"
            id="key-file"
            accept=".json"
            onChange={importKeys}
            style={{ display: 'none' }}
          />
        </div>
      </div>
      <div className="key-info">
        <p>请妥善保管您的密钥：</p>
        <ul>
          <li>密钥用于解密历史消息</li>
          <li>更换设备时需要导入密钥</li>
          <li>丢失密钥将无法读取加密消息</li>
        </ul>
      </div>
    </div>
  );
};

export default KeyManagement; 