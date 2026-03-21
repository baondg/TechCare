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
    account_id:{
      type: DataTypes.INTEGER,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    sex: {
      type: DataTypes.STRING,
      allowNull: true
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
  },
);

module.exports = Users;
