const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

/** MySQL `DISEASE` — ICD catalog; linked from `REGIMEN.disease_id` only (not on `TREATMENT`). */
const Disease = sequelize.define(
  'Disease',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    icd_code: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    description: { type: DataTypes.TEXT, allowNull: false },
    category: { type: DataTypes.STRING(100), allowNull: true },
    symptoms: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    tableName: 'DISEASE',
    timestamps: false,
  }
);

module.exports = Disease;
