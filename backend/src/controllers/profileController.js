const Account = require('../models/Account');
const Patient = require('../models/Patient');
const User = require('../models/Users');
const Relative = require('../models/Relative');
const HealthInsurance = require('../models/HealthInsurance');

function getUserIdFromParams(req) {
  return req.params.userId;
}

function parseUserIdParam(req, res) {
  const raw = getUserIdFromParams(req);
  const userId = parseInt(raw, 10);
  if (Number.isNaN(userId)) {
    res.status(400).json({ message: 'Invalid user ID' });
    return null;
  }
  return userId;
}

function isSelfOrAdmin(req, userId) {
  return String(req.user.userId) === String(userId) || req.user.role === 'admin';
}

function isMedicalStaff(req) {
  const role = String(req.user?.role || '').toLowerCase();
  return role === 'doctor' || role === 'nurse' || role === 'technician';
}

function ensureAuthorized(req, res, userId) {
  if (!isSelfOrAdmin(req, userId)) {
    res.status(403).json({ message: 'Forbidden' });
    return false;
  }
  return true;
}

/** Self, admin, or medical staff (same gate as GET profile — e.g. nurse editing patient). */
function ensureCanWriteProfile(req, res, targetUserId) {
  if (isSelfOrAdmin(req, targetUserId)) return true;
  if (isMedicalStaff(req)) return true;
  res.status(403).json({ message: 'Forbidden' });
  return false;
}

function splitFullName(fullName) {
  const s = String(fullName || '').trim();
  if (!s) return { first: '', last: '' };
  const parts = s.split(/\s+/);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') || '' };
}

/** Empty string fails RELATIVE.tel / RELATIVE.email Sequelize validators; use null instead. */
function nullIfEmpty(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

exports.getProfile = async (req, res) => {
  try {
    const userId = parseUserIdParam(req, res);
    if (userId == null) return;

    // Allow medical staff to view patient profile; PUT uses ensureCanWriteProfile (staff may update patient).
    if (!(isSelfOrAdmin(req, userId) || isMedicalStaff(req))) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const account = await Account.findOne({
      where: { user_id: userId },
      include: [
        {
          model: User,
          attributes: ['idcard', 'first_name', 'last_name', 'dob', 'sex', 'tel', 'email'],
        },
      ],
    });

    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
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
      nationalId: raw.idcard != null ? String(raw.idcard) : '',
    };

    let relative = null;
    let insurance = null;

    const userRow = await User.findOne({
      where: { id: userId },
      include: [
        {
          model: Patient,
          attributes: ['patient_id'],
          include: [
            {
              model: Relative,
            },
          ],
        },
      ],
    });

    if (userRow) {
      const relData = userRow.get({ plain: true });
      relative = relData.Patient?.Relative ?? null;
    }

    const userIns = await User.findOne({
      where: { id: userId },
      include: [
        {
          model: Patient,
          attributes: ['patient_id'],
          include: [
            {
              model: HealthInsurance,
              as: 'insurance',
            },
          ],
        },
      ],
    });

    if (userIns) {
      const insData = userIns.get({ plain: true });
      insurance = insData.Patient?.insurance ?? null;
    }

    res.json({ profile, relative, insurance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = parseUserIdParam(req, res);
    if (userId == null) return;

    if (!ensureCanWriteProfile(req, res, userId)) return;

    const {
      firstName,
      lastName,
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
      relativeNationalId,
    } = req.body;

    const fnRaw = (firstName ?? req.body.first_name ?? '').toString().trim();
    const lnRaw = (lastName ?? req.body.last_name ?? '').toString().trim();
    let first = fnRaw;
    let last = lnRaw;
    if (!first && !last && fullName != null && String(fullName).trim()) {
      const sp = splitFullName(fullName);
      first = sp.first;
      last = sp.last;
    }

    const user = await User.findByPk(userId);

    if (user) {
      await user.update({
        first_name: first || null,
        last_name: last || null,
        dob: dateOfBirth,
        sex: sex === 'Male' ? 'M' : sex === 'Female' ? 'F' : 'O',
        tel: phone,
        email,
        idcard: nationalId,
      });
    }

    const patient = await Patient.findOne({
      where: { user_id: userId },
    });

    if (patient) {
      const relNameIn = nullIfEmpty(relativeName);
      const relTel = nullIfEmpty(relativePhone);
      const relEmail = nullIfEmpty(relativeEmail);
      const relNat = nullIfEmpty(relativeNationalId);
      const relRelationship = nullIfEmpty(relativeRelationship) || 'Mother';
      const relSex =
        relativeSex === 'Male' ? 'M' : relativeSex === 'Female' ? 'F' : 'O';

      let relative = await Relative.findOne({
        where: { patient_id: patient.patient_id },
      });

      if (relative) {
        await relative.update({
          name: relNameIn || relative.name,
          relationship: relRelationship,
          dob: relativeDateOfBirth || null,
          sex: relSex,
          tel: relTel,
          email: relEmail,
          idcard: relNat,
        });
      } else if (relNameIn) {
        await Relative.create({
          patient_id: patient.patient_id,
          name: relNameIn,
          relationship: relRelationship,
          dob: relativeDateOfBirth || null,
          sex: relSex,
          tel: relTel,
          email: relEmail,
          idcard: relNat,
        });
      }
    }

    return res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

exports.deleteProfile = async (req, res) => {
  try {
    const userId = parseUserIdParam(req, res);
    if (userId == null) return;

    if (!ensureAuthorized(req, res, userId)) return;

    return res.status(501).json({
      message: 'Deleting the full patient profile is not supported; user data lives on the USER record.',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
