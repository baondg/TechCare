const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    idcard:{
      type: DataTypes.INTEGER,
      allowNull: false
    },
    first_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    last_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    sex: {
      type: DataTypes.ENUM('M','F','O'),
      allowNull: false
    },
    dob: {
      type: DataTypes.STRING,
      allowNull: false
    },
    tel: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false
    },
  },
  {
    tableName: 'USER',
    freezeTableName: true,
    timestamps: false //tự động thêm cột createAt
  }
);

module.exports = User;
