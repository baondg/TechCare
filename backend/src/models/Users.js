const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

const Users = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
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
      type: DataTypes.ENUM('ADM', 'PAT', 'DOC', 'NUR', 'PHY'),
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false
    },
    idcard: {
      type: DataTypes.STRING,
      allowNull: false
    },
  },
  {
    tableName: 'USER',
    freezeTableName: true,
    timestamps: false
  }
);

module.exports = Users;
