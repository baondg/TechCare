const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

const Diagnosis = sequelize.define('Diagnosis', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  patientId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  doctorId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  doctorName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  department: {
    type: DataTypes.STRING,
    allowNull: true
  },
  complaint: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Chief complaint / symptoms'
  },
  icd10: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'ICD-10 diagnosis code'
  },
  interpretation: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Diagnosis interpretation / description'
  },
  note: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'diagnoses',
  timestamps: true
});

module.exports = Diagnosis;
