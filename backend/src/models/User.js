const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'ACCOUNT',
    {
      user_id: {
        type: DataTypes.INTEGER,
        primaryKey: true
      },

      username: {
        type: DataTypes.STRING,
        allowNull: true
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
      }
    },
    {
      tableName: 'ACCOUNT',
      freezeTableName: true,
      timestamps: false
    }
  );