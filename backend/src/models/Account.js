const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

const Account = sequelize.define(
    'ACCOUNT',
    {
      user_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },

      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },

      password: {
        type: DataTypes.STRING,
        allowNull: false
      },

      type: {
        type: DataTypes.ENUM('ADM', 'PAT', 'DOC', 'NUR', 'PHY'),
        allowNull: false
      },

      created_by: {
        type: DataTypes.INTEGER
      },

      created_time: {
        type: DataTypes.DATE
      },

      status: {
        type: DataTypes.STRING
      },

      // session_id: {
      //   type: DataTypes.INTEGER,
      //   allowNull: true
      // }

      // loginAttempts: {
      //   type: DataTypes.INTEGER,
      //   defaultValue: 0
      // },

      // lockUntil: {
      //   type: DataTypes.DATE,
      //   allowNull: true
      // },

      // lastLogin: {
      //   type: DataTypes.DATE,
      //   allowNull: true
      // }
    },
    {
      tableName: 'ACCOUNT',
      freezeTableName: true,
      timestamps: false //tự động thêm cột createAt
    }
  );

  module.exports = Account;