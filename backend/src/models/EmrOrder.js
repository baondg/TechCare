const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

/** MySQL `` `ORDER` `` — EMR order row; links lab / surgery / Rx chains to `TREATMENT`. */
const EmrOrder = sequelize.define(
  'EmrOrder',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    status: { type: DataTypes.STRING(50), allowNull: false },
    treatment_id: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    tableName: 'ORDER',
    timestamps: false,
  }
);

module.exports = EmrOrder;
