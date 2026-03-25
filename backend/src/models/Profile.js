const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Profile = sequelize.define('profile', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    firstName: { type: DataTypes.STRING },
    lastName: { type: DataTypes.STRING },
    userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    fullName: { type: DataTypes.STRING },
    dateOfBirth: { type: DataTypes.DATEONLY },
    sex: { type: DataTypes.STRING },
    phone: { type: DataTypes.STRING },
    email: { type: DataTypes.STRING },
    nationalId: { type: DataTypes.STRING },
    
    // Relative information
    relativeName: { type: DataTypes.STRING },
    relativeRelationship: { type: DataTypes.STRING },
    relativeDateOfBirth: { type: DataTypes.DATEONLY },
    relativeSex: { type: DataTypes.STRING },
    relativePhone: { type: DataTypes.STRING },
    relativeEmail: { type: DataTypes.STRING },
    relativeNationalId: { type: DataTypes.STRING },
    
    // Insurance information
    insuranceId: { type: DataTypes.STRING },
    insuranceProvider: { type: DataTypes.STRING },
    insuranceExpiry: { type: DataTypes.DATEONLY }
  });

  return Profile;
};
