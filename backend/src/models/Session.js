const { DataTypes } = require('sequelize');

const SessionModel = {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  token: { type: DataTypes.STRING, allowNull: false, unique: true },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  lastActivity: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  ipAddress: { type: DataTypes.STRING },
  userAgent: { type: DataTypes.STRING }
};

module.exports = (sequelize) => sequelize.define('session', SessionModel);

// Định nghĩa model Session: theo dõi các session đang hoạt động của user, lưu token, thời gian hết hạn và thông tin kết nối
