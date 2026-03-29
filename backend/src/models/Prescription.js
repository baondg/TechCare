const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

const Prescription = sequelize.define('Prescription', {
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
  status: {
    type: DataTypes.ENUM('Active', 'Completed', 'Cancelled'),
    defaultValue: 'Active'
  }
}, {
  tableName: 'prescriptions',
  timestamps: true
});

const PrescriptionMedication = sequelize.define('PrescriptionMedication', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  prescriptionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'prescriptions',
      key: 'id'
    }
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  frequency: {
    type: DataTypes.STRING,
    allowNull: true
  },
  quantity: {
    type: DataTypes.STRING,
    allowNull: true
  },
  instruction: {
    type: DataTypes.STRING,
    allowNull: true
  },
  note: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'prescription_medications',
  timestamps: true
});

// Associations
Prescription.hasMany(PrescriptionMedication, {
  foreignKey: 'prescriptionId',
  as: 'medications',
  onDelete: 'CASCADE'
});
PrescriptionMedication.belongsTo(Prescription, {
  foreignKey: 'prescriptionId'
});

module.exports = { Prescription, PrescriptionMedication };
