const Log = require('../models/Log');

class LogService {
  static async createLog(data) {
    try {
      const log = new Log(data);
      await log.save();
      return log;
    } catch (error) {
      console.error('创建日志失败:', error);
      throw error;
    }
  }

  static async getLogs(query = {}, options = {}) {
    try {
      const { page = 1, limit = 20, sort = '-createdAt' } = options;
      const skip = (page - 1) * limit;

      const logs = await Log.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Log.countDocuments(query);

      return {
        logs,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('获取日志失败:', error);
      throw error;
    }
  }
}

module.exports = LogService; 