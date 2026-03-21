const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

const Appointment = sequelize.define('Appointment', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  time: {
    type: DataTypes.TIME,
    allowNull: false,
  },
  doctor_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'DOCTOR', // Assuming the table name is 'users'
      key: 'doctor_id'
    }
  },
  department: {
    type: DataTypes.STRING,
    allowNull: false
  },
  // date: {
  //   type: DataTypes.DATEONLY,
  //   allowNull: false
  // },
  patient_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references:{
      model: 'PATIENT',
      key: 'patient_id'
    }
  },
  status: {
    type: DataTypes.ENUM('Pending', 'Confirmed', 'Done', 'Cancelled', 'Rejected'),
    defaultValue: 'Pending'
  },
  room: {
    type: DataTypes.STRING,
    allowNull: true
  },
  symptoms: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
});

module.exports = Appointment;
