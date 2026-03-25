const { DataTypes } = require('sequelize');
const sequelize = require('../common/database');

const Relative = sequelize.define('Relative', {
  patient_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(150),
    primaryKey: true,
    allowNull: false
  },
  sex: {
    type: DataTypes.ENUM('M', 'F', 'O'),
    allowNull: true
  },
  dob: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  tel: {
    type: DataTypes.STRING(20),
    allowNull: true,
    validate: {
      is: /^[0-9+\-() ]+$/ // validate số điện thoại cơ bản
    }
  },
  email: {
    type: DataTypes.STRING(150),
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  relationship: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  idcard: {
    type: DataTypes.STRING(12),
    allowNull: true
  }
}, {
  tableName: 'RELATIVE',
  timestamps: false
});

module.exports = Relative;