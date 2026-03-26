const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

const Patient = sequelize.define('Patient', {
  patient_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  blood_type: {
    type: DataTypes.ENUM('A', 'B', 'AB', 'O'),
    allowNull: false
  },

  allergic_info: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      drugAllergies: [],
      foodAllergies: [],
      otherAllergies: []
    }
  },

  medical_history: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      vaccinations: [],
      familyHistory: [],
      pastIllnesses: [],
      pastSurgeries: [],
      substanceAbuse: [],
      chronicConditions: []
    }
  }

}, {
  tableName: 'PATIENT',
  timestamps: false
});

module.exports = Patient;