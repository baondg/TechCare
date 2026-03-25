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
  {
    tableName: 'USER',
    freezeTableName: true,
    timestamps: false
  }
);

module.exports = User;
