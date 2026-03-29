const sequelize = require('../common/database');
// const defineProfile = require('../models/Profile');
// const Profile = defineProfile(sequelize);

const Account = require('../models/Account');
const Patient = require('../models/Patient');
const User = require('../models/Users');
const Relative = require('../models/Relative');
const HealthInsurance = require('../models/HealthInsurance');

// ─── Internal helpers to keep controller logic small and readable ───

function getUserIdFromParams(req) {
  return req.params.userId;
}

function isSelfOrAdmin(req, userId) {
  return String(req.user.userId) === String(userId) || req.user.role === 'admin';
}

function ensureAuthorized(req, res, userId) {
  if (!isSelfOrAdmin(req, userId)) {
    res.status(403).json({ message: 'Forbidden' });
    return false;
  }
  return true;
}

async function findProfileByUserId(userId) {
  return Profile.findOne({ where: { userId } });
}

function sendProfileNotFound(res) {
  return res.status(404).json({ message: 'Profile not found' });
}

exports.getProfile = async (req, res) => {
  try {
    const userId = getUserIdFromParams(req);

    if (!ensureAuthorized(req, res, userId)) return;

    const account = await Account.findOne({
      where: { user_id },
      include: [
        {
          model: User,
          attributes: ['idcard', 'first_name', 'last_name', 'dob', 'sex', 'tel', 'email']
        }
      ],
    });

    if (!profile) {
      return sendProfileNotFound(res);
    }

    const u = account.User || account.user;
    const raw = u?.dataValues ?? u ?? {};
    const firstName = String(raw.first_name || '').trim();
    const lastName = String(raw.last_name || '').trim();
    const fullName = `${firstName} ${lastName}`.trim();

    const profile = {
      user_id: account.user_id,
      username: account.username,
      role: account.type,

      firstName,
      lastName,
      fullName: fullName || account.username,
      dateOfBirth: raw.dob,
      sex: raw.sex,
      phone: raw.tel,
      email: raw.email,
      nationalId: raw.idcard
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
    const userId = getUserIdFromParams(req);

    if (!ensureAuthorized(req, res, userId)) return;

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

// DELETE /api/profile/:userId
// Delete the patient's profile information
exports.deleteProfile = async (req, res) => {
  try {
    const userId = getUserIdFromParams(req);

    if (!ensureAuthorized(req, res, userId)) return;

    const deletedCount = await Profile.destroy({ where: { userId } });

    if (!deletedCount) {
      return sendProfileNotFound(res);
    }

    return res.status(200).json({ message: 'Profile deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
