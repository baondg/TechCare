const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

/** MySQL `TEST` — lab result header; PK equals `ORDER.id` (procedure chain). */
const LabTest = sequelize.define(
  'LabTest',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    time: { type: DataTypes.DATE, allowNull: false },
    type: { type: DataTypes.STRING(100), allowNull: false },
    technician_id: { type: DataTypes.INTEGER, allowNull: true },
    result: { type: DataTypes.TEXT, allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    attachment_url: { type: DataTypes.STRING(500), allowNull: true },
  },
  {
    tableName: 'TEST',
    timestamps: false,
  }
);

module.exports = LabTest;
