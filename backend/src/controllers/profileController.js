const sequelize = require('../common/database');
// const defineProfile = require('../models/Profile');
// const Profile = defineProfile(sequelize);

const Account = require('../models/Account');
const Patient = require('../models/Patient');
const User = require('../models/User');
const Relative = require('../models/Relative');
const HealthInsurance = require('../models/HealthInsurance');

exports.getProfile = async (req, res) => {
  try {
    const user_id = req.user.userId;

    if (req.user.userId != user_id && req.user.role !== 'ADM') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const account = await Account.findOne({
      where: { user_id },
      include: [
        {
          model: User,
          attributes: ['idcard',  'name', 'dob', 'sex', 'tel', 'email']
        }
      ],
    });

    if (!account) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = account.User;

    const profile = {
      user_id: account.user_id,
      username: account.username,
      role: account.type,

      fullName: user?.dataValues.name,
      dateOfBirth: user?.dataValues.dob,
      sex: user?.dataValues.sex,
      phone: user?.dataValues.tel,
      email: user?.dataValues.email,
      nationalId: user?.dataValues.idcard
    };

    const findRelative = await User.findOne({
      where: { id: user_id },
      include: [
        {
          model: Patient,
          attributes: ['patient_id'],
          include: [
            {
              model: Relative
            }
          ]
        }
      ]
    });

    var data = findRelative.get({ plain: true });

    const relative = data.Patient?.Relative;

    const findInsurance = await User.findOne({
      where: { id: user_id },
      include: [
        {
          model: Patient,
          attributes: ['patient_id'],
          include: [
            {
              model: HealthInsurance,
              as: 'insurance'
            }
          ]
        }
      ]
    });

    data = findInsurance.get({ plain: true });
    const insurance = data.Patient?.insurance;

    console.log('findInsurance', insurance);


    res.json({ profile: profile, relative: relative, insurance: insurance });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

exports.updateProfile = async (req, res) => {   //partial update, only update fields that are provided in the request body
  try {
    const user_id = req.params.userId;

    console.log('Updating profile for user_id:', user_id);

    if (req.user.userId != user_id && req.user.role !== 'ADM') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const {
      fullName,
      dateOfBirth,
      sex,
      phone,
      email,
      nationalId,

      relativeName,
      relativeRelationship,
      relativeDateOfBirth,
      relativeSex,
      relativePhone,
      relativeEmail,
      relativeNationalId
    } = req.body;

    // =====================
    // 1. UPDATE USER
    // =====================
    const user = await User.findByPk(user_id);

    if (user) {
      await user.update({
        name: fullName,
        dob: dateOfBirth,
        sex: sex === 'Male' ? 'M' : sex === 'Female' ? 'F' : 'O',
        tel: phone,
        email: email,
        idcard: nationalId
      });
    }

    // =====================
    // 2. FIND PATIENT
    // =====================
    const patient = await Patient.findOne({
      where: { user_id }
    });

    // =====================
    // 3. UPDATE RELATIVE
    // =====================
    if (patient) {
      let relative = await Relative.findOne({
        where: { patient_id: patient.patient_id }
      });

      if (relative) {
        await relative.update({
          name: relativeName,
          relationship: relativeRelationship,
          dob: relativeDateOfBirth,
          sex: relativeSex === 'Male' ? 'M' : relativeSex === 'Female' ? 'F' : 'O',
          tel: relativePhone,
          email: relativeEmail,
          idcard: relativeNationalId
        });
      } else {
        // nếu chưa có thì tạo mới
        await Relative.create({
          patient_id: patient.patient_id,
          name: relativeName,
          relationship: relativeRelationship,
          dob: relativeDateOfBirth,
          sex: relativeSex === 'Male' ? 'M' : relativeSex === 'Female' ? 'F' : 'O',
          tel: relativePhone,
          email: relativeEmail,
          idcard: relativeNationalId
        });
      }
    }

    return res.json({ message: 'Profile updated successfully' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
