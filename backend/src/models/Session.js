const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

const Session = sequelize.define (
  'SESSION',
  {
    id: { 
      type: DataTypes.INTEGER, 
      autoIncrement: true, 
      primaryKey: true },

    userId: { 
      type: DataTypes.INTEGER, 
      allowNull: false },

    token: { 
      type: DataTypes.STRING(512), 
      allowNull: false },

    refreshToken: { 
      type: DataTypes.STRING(512), 
      allowNull: true },

    expiresAt: { 
      type: DataTypes.DATE, 
      allowNull: false },

    lastActivity: { 
      type: DataTypes.DATE, 
      defaultValue: DataTypes.NOW },
    },
  {
    tableName: 'SESSION',
    freezeTableName: true,
    timestamps: false //tự động thêm cột createAt
  }
);

module.exports = Session;

// Session model with refresh token support for secure authentication management
