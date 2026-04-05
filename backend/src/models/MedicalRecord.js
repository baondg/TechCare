const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

const MedicalRecord = sequelize.define('MedicalRecord', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  time: {
    type: DataTypes.DATE,
    allowNull: false
  },
  condition: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  weight: {
    type: DataTypes.FLOAT,
    allowNull: false,
    validate: {
      min: 0.1
    }
  },
  height: {
    type: DataTypes.FLOAT,
    allowNull: false,
    validate: {
      min: 0.1
    }
  },
  spo2: {
    type: DataTypes.FLOAT,
    allowNull: true,
    validate: {
      min: 0,
      max: 100
    }
  },
  heart_rate: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0
    }
  },
  blood_pressure: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  temperature: {
    type: DataTypes.FLOAT,
    allowNull: true,
    validate: {
      min: 30,
      max: 45
    }
  },
  respiratory_rate: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0,
      max: 60
    }
  },
  status: {
    type: DataTypes.ENUM('draft', 'confirmed'),
    allowNull: false,
    defaultValue: 'draft'
  },
  patient_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'MEDICAL_RECORD',
  timestamps: false
});

module.exports = MedicalRecord;