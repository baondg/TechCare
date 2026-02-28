const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

const HealthInfo = sequelize.define('HealthInfo', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  patientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },

  // Vital signs
  height: { type: DataTypes.FLOAT, allowNull: true },
  weight: { type: DataTypes.FLOAT, allowNull: true },
  bmi: { type: DataTypes.FLOAT, allowNull: true },
  bloodPressureSys: { type: DataTypes.INTEGER, allowNull: true },
  bloodPressureDia: { type: DataTypes.INTEGER, allowNull: true },
  heartRate: { type: DataTypes.INTEGER, allowNull: true },
  respiratoryRate: { type: DataTypes.INTEGER, allowNull: true },
  temperature: { type: DataTypes.FLOAT, allowNull: true },
  spo2: { type: DataTypes.INTEGER, allowNull: true },
  bloodType: { type: DataTypes.STRING(5), allowNull: true },

  // Current symptoms
  currentSymptoms: { type: DataTypes.TEXT, allowNull: true },

  // Allergies (stored as JSON arrays)
  drugAllergies: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const val = this.getDataValue('drugAllergies');
      return val ? JSON.parse(val) : [];
    },
    set(val) {
      this.setDataValue('drugAllergies', JSON.stringify(val || []));
    }
  },
  foodAllergies: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const val = this.getDataValue('foodAllergies');
      return val ? JSON.parse(val) : [];
    },
    set(val) {
      this.setDataValue('foodAllergies', JSON.stringify(val || []));
    }
  },
  otherAllergies: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const val = this.getDataValue('otherAllergies');
      return val ? JSON.parse(val) : [];
    },
    set(val) {
      this.setDataValue('otherAllergies', JSON.stringify(val || []));
    }
  },

  // Medical history (stored as JSON arrays)
  chronicConditions: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const val = this.getDataValue('chronicConditions');
      return val ? JSON.parse(val) : [];
    },
    set(val) {
      this.setDataValue('chronicConditions', JSON.stringify(val || []));
    }
  },
  pastSurgeries: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const val = this.getDataValue('pastSurgeries');
      return val ? JSON.parse(val) : [];
    },
    set(val) {
      this.setDataValue('pastSurgeries', JSON.stringify(val || []));
    }
  },
  familyHistory: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const val = this.getDataValue('familyHistory');
      return val ? JSON.parse(val) : [];
    },
    set(val) {
      this.setDataValue('familyHistory', JSON.stringify(val || []));
    }
  },
  pastIllnesses: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const val = this.getDataValue('pastIllnesses');
      return val ? JSON.parse(val) : [];
    },
    set(val) {
      this.setDataValue('pastIllnesses', JSON.stringify(val || []));
    }
  },
  vaccinations: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const val = this.getDataValue('vaccinations');
      return val ? JSON.parse(val) : [];
    },
    set(val) {
      this.setDataValue('vaccinations', JSON.stringify(val || []));
    }
  },
  substanceAbuse: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const val = this.getDataValue('substanceAbuse');
      return val ? JSON.parse(val) : [];
    },
    set(val) {
      this.setDataValue('substanceAbuse', JSON.stringify(val || []));
    }
  },

  // Metadata
  updatedBy: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Username of who last updated'
  }
}, {
  tableName: 'health_infos',
  timestamps: true
});

module.exports = HealthInfo;
