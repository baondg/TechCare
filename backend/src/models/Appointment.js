const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

const Appointment = sequelize.define('Appointment', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users', // Assuming the table name is 'users'
      key: 'id'
    }
  },
  doctor: {
    type: DataTypes.STRING,
    allowNull: false
  },
  department: {
    type: DataTypes.STRING,
    allowNull: false
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  time: {
    type: DataTypes.TIME,
    allowNull: false
  },
<<<<<<< HEAD
=======
<<<<<<< HEAD
>>>>>>> backend
  patient: {
    type: DataTypes.STRING,
    allowNull: true
  },
<<<<<<< HEAD
  status: {
    type: DataTypes.ENUM('Pending', 'Confirmed', 'Done', 'Cancelled', 'Rejected'),
    defaultValue: 'Pending'
=======
  status: {
    type: DataTypes.ENUM('Pending', 'Confirmed', 'Done', 'Cancelled', 'Rejected'),
    defaultValue: 'Pending'
=======
  status: {
    type: DataTypes.ENUM('Upcoming', 'Done', 'Cancelled'),
    defaultValue: 'Upcoming'
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
>>>>>>> backend
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
