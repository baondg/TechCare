const { DataTypes } = require('sequelize');

const SessionModel = {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  token: { type: DataTypes.STRING(512), allowNull: false },
  refreshToken: { type: DataTypes.STRING(512), allowNull: true },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  lastActivity: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  ipAddress: { type: DataTypes.STRING },
  userAgent: { type: DataTypes.TEXT }
};

module.exports = (sequelize) => sequelize.define('session', SessionModel);

// Session model with refresh token support for secure authentication management
