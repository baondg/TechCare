const sequelize = require('../common/database');
const defineProfile = require('../models/Profile');
const Profile = defineProfile(sequelize);

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

    const profile = await findProfileByUserId(userId);

    if (!profile) {
      return sendProfileNotFound(res);
    }

    res.json({ profile });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = getUserIdFromParams(req);

    if (!ensureAuthorized(req, res, userId)) return;

    const [profile, created] = await Profile.findOrCreate({
      where: { userId },
      defaults: { ...req.body, userId }
    });

    if (!created) {
      await profile.update(req.body);
    }

    res.json({ profile });
  } catch (err) {
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
