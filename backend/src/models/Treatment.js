const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

/**
 * MySQL `TREATMENT` — clinical encounter / chart row; disease context via `regimen_id` → REGIMEN only
 * (no `disease_id` on this table; see database_description.sql).
 */
const Treatment = sequelize.define(
  'Treatment',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    time: { type: DataTypes.DATE, allowNull: false },
    condition: { type: DataTypes.TEXT, allowNull: false },
    type: { type: DataTypes.STRING(100), allowNull: false },
    regimen_id: { type: DataTypes.INTEGER, allowNull: false },
    doctor_id: { type: DataTypes.INTEGER, allowNull: false },
    room_id: { type: DataTypes.INTEGER, allowNull: true },
    dept_id: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    tableName: 'TREATMENT',
    timestamps: false,
  }
);

module.exports = Treatment;
