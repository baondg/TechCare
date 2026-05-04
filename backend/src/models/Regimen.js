const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

/** MySQL `REGIMEN` — one open row per (patient, disease) in app logic; `disease_id` lives here only. */
const Regimen = sequelize.define(
  'Regimen',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    start: { type: DataTypes.DATE, allowNull: false },
    endAt: { type: DataTypes.DATE, allowNull: true, field: 'end' },
    patient_id: { type: DataTypes.INTEGER, allowNull: false },
    disease_id: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    tableName: 'REGIMEN',
    timestamps: false,
  }
);

module.exports = Regimen;
