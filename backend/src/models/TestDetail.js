const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

/**
 * MySQL `TEST_DETAIL` — line items; numeric values are parsed from `result` (text) in the API layer.
 * Column `index` mapped as `item_index` in JS.
 */
const TestDetail = sequelize.define(
  'TestDetail',
  {
    test_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    no: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    item_index: {
      type: DataTypes.STRING(150),
      allowNull: false,
      field: 'index',
    },
    result: { type: DataTypes.TEXT, allowNull: false },
    unit: { type: DataTypes.STRING(20), allowNull: true },
  },
  {
    tableName: 'TEST_DETAIL',
    timestamps: false,
  }
);

module.exports = TestDetail;
