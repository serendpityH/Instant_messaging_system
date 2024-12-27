import CryptoJS from 'crypto-js';
import JSEncrypt from 'jsencrypt';

class CryptoService {
  constructor() {
    this.jsencrypt = new JSEncrypt();
    this.publicKey = null;
    this.privateKey = null;
    this.myPublicKey = null;
    this.otherPublicKeys = new Map();
  }

  generateKeyPair() {
    try {
      const keyGenerator = new JSEncrypt({ default_key_size: 1024 });
      keyGenerator.getKey();
      
      this.privateKey = keyGenerator.getPrivateKey();
      this.publicKey = keyGenerator.getPublicKey();
      
      if (!this.publicKey || !this.privateKey) {
        throw new Error('密钥对生成失败');
      }

      return {
        publicKey: this.publicKey.replace(/\r\n/g, '\n').trim(),
        privateKey: this.privateKey.replace(/\r\n/g, '\n').trim()
      };
    } catch (error) {
      console.error('生成密钥对失败:', error);
      throw error;
    }
  }

  setPrivateKey(privateKey) {
    if (!privateKey) {
      throw new Error('私钥不能为空');
    }
    try {
      const decryptor = new JSEncrypt();
      decryptor.setPrivateKey(privateKey);
      // 验证私钥是否有效
      if (!decryptor.getPrivateKeyB64()) {
        throw new Error('无效的私钥');
      }
      this.privateKey = privateKey;
      this.jsencrypt.setPrivateKey(privateKey);
    } catch (error) {
      console.error('设置私钥失败:', error);
      throw new Error('设置私钥失败: ' + error.message);
    }
  }

  setOtherPublicKey(userId, publicKey) {
    const encryptor = new JSEncrypt();
    encryptor.setPublicKey(publicKey);
    this.otherPublicKeys.set(userId, encryptor);
  }

  signMessage(message) {
    try {
      // 使用私钥对消息进行签名
      this.jsencrypt.setPrivateKey(this.privateKey);
      const signature = this.jsencrypt.sign(message, CryptoJS.SHA256, "sha256");
      if (!signature) {
        throw new Error('消息签名失败');
      }
      return signature;
    } catch (error) {
      console.error('生成签名失败:', error);
      throw error;
    }
  }

  verifySignature(message, signature, senderPublicKey) {
    try {
      // 使用发送者的公钥验证签名
      const verifier = new JSEncrypt();
      verifier.setPublicKey(senderPublicKey);
      const isValid = verifier.verify(message, signature, CryptoJS.SHA256);
      if (!isValid) {
        throw new Error('签名验证失败，消息可能被篡改');
      }
      return true;
    } catch (error) {
      console.error('验证签名失败:', error);
      throw error;
    }
  }

  encryptMessage(message, receiverId) {
    try {
      // 1. 生成随机的AES密钥和IV
      const aesKey = CryptoJS.lib.WordArray.random(32);
      const iv = CryptoJS.lib.WordArray.random(16);

      // 2. 使用AES密钥加密消息内容
      const encryptedMessage = CryptoJS.AES.encrypt(message, aesKey, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });

      // 3. 生成消息签名
      const signature = this.signMessage(message);

      // 4. 分别使用发送者和接收者的公钥加密AES密钥
      const receiverEncryptor = this.otherPublicKeys.get(receiverId);
      if (!receiverEncryptor) {
        throw new Error('接收者的公钥未找到');
      }

      if (!this.myPublicKey) {
        throw new Error('发送者的公钥未找到');
      }

      const aesKeyBase64 = CryptoJS.enc.Base64.stringify(aesKey);
      
      // 为接收者加密
      const receiverEncryptedAesKey = receiverEncryptor.encrypt(aesKeyBase64);
      
      // 为发送者加密
      const senderEncryptor = new JSEncrypt();
      senderEncryptor.setPublicKey(this.myPublicKey);
      const senderEncryptedAesKey = senderEncryptor.encrypt(aesKeyBase64);

      if (!receiverEncryptedAesKey || !senderEncryptedAesKey) {
        throw new Error('AES密钥加密失败');
      }

      return {
        receiverKey: receiverEncryptedAesKey,
        senderKey: senderEncryptedAesKey,
        iv: CryptoJS.enc.Base64.stringify(iv),
        content: encryptedMessage.toString(),
        signature: signature
      };
    } catch (error) {
      console.error('消息加密失败:', error);
      throw error;
    }
  }

  decryptMessage(encryptedMessage, senderPublicKey) {
    try {
      if (!this.privateKey) {
        throw new Error('私钥未设置');
      }

      // 1. 使用私钥解密AES密钥
      const decryptor = new JSEncrypt();
      decryptor.setPrivateKey(this.privateKey);
      const aesKeyBase64 = decryptor.decrypt(encryptedMessage.key);
      
      if (!aesKeyBase64) {
        throw new Error('AES密钥解密失败');
      }

      // 2. 将Base64格式的AES密钥和IV转换为WordArray
      const aesKey = CryptoJS.enc.Base64.parse(aesKeyBase64);
      const iv = CryptoJS.enc.Base64.parse(encryptedMessage.iv);

      // 3. 使用解密出的AES密钥解密消息内容
      const decrypted = CryptoJS.AES.decrypt(
        encryptedMessage.content,
        aesKey,
        {
          iv: iv,
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7
        }
      );

      // 4. 转换为UTF-8文本
      const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
      if (!decryptedText) {
        throw new Error('消息解密结果为空');
      }

      // 5. 验证消息签名（如果有）
      if (encryptedMessage.signature && senderPublicKey) {
        const verifier = new JSEncrypt();
        verifier.setPublicKey(senderPublicKey);
        const isValid = verifier.verify(decryptedText, encryptedMessage.signature, CryptoJS.SHA256);
        if (!isValid) {
          throw new Error('消息签名验证失败');
        }
      }

      return decryptedText;
    } catch (error) {
      console.error('消息解密失败:', error);
      throw error;
    }
  }

  encryptGroupMessage(message, groupKey) {
    try {
      console.log('开始加密群组消息');
      // 使用原始的十六进制群组密钥
      const key = CryptoJS.enc.Hex.parse(groupKey);
      const iv = CryptoJS.lib.WordArray.random(16);

      const encrypted = CryptoJS.AES.encrypt(message, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });

      console.log('群组消息加密成功');
      return {
        encryptedContent: encrypted.toString(),
        iv: CryptoJS.enc.Base64.stringify(iv)
      };
    } catch (error) {
      console.error('加密群组消息失败:', error);
      throw new Error('加密群组消息失败: ' + error.message);
    }
  }

  decryptGroupMessage(encryptedContent, groupKey, iv) {
    try {
      console.log('开始解密群组消息，输入参数:', {
        encryptedContent,
        groupKey,
        iv
      });

      // 使用群组密钥直接解密消息
      const key = CryptoJS.enc.Hex.parse(groupKey);
      console.log('解析后的密钥:', {
        original: groupKey,
        parsed: key.toString(),
        words: key.words,
        sigBytes: key.sigBytes
      });

      const ivArray = CryptoJS.enc.Base64.parse(iv);
      console.log('解析后的IV:', {
        original: iv,
        parsed: ivArray.toString(),
        words: ivArray.words,
        sigBytes: ivArray.sigBytes
      });

      // 创建加密消息对象
      const cipherParams = {
        ciphertext: CryptoJS.enc.Base64.parse(encryptedContent)
      };
      console.log('解析后的加密内容:', {
        original: encryptedContent,
        parsed: cipherParams.ciphertext.toString(),
        words: cipherParams.ciphertext.words,
        sigBytes: cipherParams.ciphertext.sigBytes
      });
      
      // 解密
      const decrypted = CryptoJS.AES.decrypt(
        cipherParams,
        key,
        {
          iv: ivArray,
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7
        }
      );
      console.log('解密后的原始结果:', {
        words: decrypted.words,
        sigBytes: decrypted.sigBytes,
        toString: decrypted.toString()
      });

      // 转换为UTF8文本
      const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
      console.log('转换为UTF8后的结果:', {
        length: decryptedText.length,
        content: decryptedText
      });

      if (!decryptedText) {
        console.error('解密结果为空');
        throw new Error('解密结果为空');
      }

      return decryptedText;
    } catch (error) {
      console.error('解密群组消息失败:', {
        error: error,
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        inputs: {
          encryptedContent: encryptedContent,
          groupKey: groupKey,
          iv: iv
        }
      });
      throw new Error('解密群组消息失败: ' + error.message);
    }
  }

  decryptWithPrivateKey(encryptedData) {
    try {
      if (!this.privateKey) {
        throw new Error('私钥未设置');
      }

      // 修改：确保使用正确的 JSEncrypt 实例
      const decryptor = new JSEncrypt();
      decryptor.setPrivateKey(this.privateKey);
      
      // 修改：直接解密 Base64 编码的数据
      const decrypted = decryptor.decrypt(encryptedData);
      
      if (!decrypted) {
        throw new Error('解密群组密钥失败');
      }
      
      return decrypted;
    } catch (error) {
      console.error('解密失败:', error);
      throw new Error('解密群组密钥失败: ' + error.message);
    }
  }

  setMyPublicKey(publicKey) {
    if (!publicKey) {
      throw new Error('公钥不能为空');
    }
    try {
      const encryptor = new JSEncrypt();
      encryptor.setPublicKey(publicKey);
      // 验证公钥是否有效
      if (!encryptor.getPublicKeyB64()) {
        throw new Error('无效的公钥');
      }
      this.myPublicKey = publicKey;
      this.publicKey = publicKey;  // 保持向后兼容
    } catch (error) {
      console.error('设置公钥失败:', error);
      throw new Error('设置公钥失败: ' + error.message);
    }
  }
}

const cryptoService = new CryptoService();
export default cryptoService;