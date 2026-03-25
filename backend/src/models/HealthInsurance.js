const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

const HealthInsurance = sequelize.define('HealthInsurance', {
  id: {
    type: DataTypes.STRING(15),
    primaryKey: true,
    allowNull: false
  },
  type: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  expired_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  initial_hospital: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  patient_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: 'valid',
    validate: {
      isIn: [['valid', 'expired', 'inactive']]
    }
  }
}, {
  tableName: 'HEALTH_INSURANCE',
  timestamps: false
});

module.exports = HealthInsurance;