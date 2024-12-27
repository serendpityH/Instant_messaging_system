import React from 'react';
import cryptoService from '../../utils/crypto';

const KeyManagement = () => {
  const generateNewKeyPair = () => {
    try {
      const { publicKey, privateKey } = cryptoService.generateKeyPair();
      localStorage.setItem('publicKey', publicKey);
      localStorage.setItem('privateKey', privateKey);
      alert('新的密钥对已生成并保存');
      window.location.reload(); // 重新加载页面以更新密钥
    } catch (error) {
      console.error('生成密钥对失败:', error);
      alert('生成密钥对失败: ' + error.message);
    }
  };

  const exportKeys = () => {
    const publicKey = localStorage.getItem('publicKey');
    const privateKey = localStorage.getItem('privateKey');
    
    if (!publicKey || !privateKey) {
      alert('未找到密钥');
      return;
    }

    const keysData = {
      publicKey,
      privateKey
    };

    const blob = new Blob([JSON.stringify(keysData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keys.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="key-management">
      <button onClick={generateNewKeyPair}>生成新密钥对</button>
      <button onClick={exportKeys}>导出密钥</button>
    </div>
  );
};

export default KeyManagement; 