const { DataTypes } = require('sequelize');

const SystemConfigModel = {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  key: { type: DataTypes.STRING, allowNull: false, unique: true },
  value: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
};

module.exports = (sequelize) =>
  sequelize.define('SYSTEM_CONFIGURATION', SystemConfigModel, {
    tableName: 'SYSTEM_CONFIGURATION',
    freezeTableName: true,
    timestamps: false,
  });

// Định nghĩa model SystemConfig: lưu trữ các cấu hình hệ thống như số lượng user đồng thời tối đa và thời gian timeout session
