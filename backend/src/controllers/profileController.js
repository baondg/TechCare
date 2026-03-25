const sequelize = require('../common/database');
const defineProfile = require('../models/Profile');
const Profile = defineProfile(sequelize);

exports.getProfile = async (req, res) => {
  try {
    const userId = req.params.userId;
    // Ensure user can only access their own profile or is admin
    if (req.user.userId != userId && req.user.role !== 'admin') {
       return res.status(403).json({ message: 'Forbidden' });
    }

    let profile = await Profile.findOne({ where: { userId } });
    
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    res.json({ profile });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.params.userId;
    if (req.user.userId != userId && req.user.role !== 'admin') {
       return res.status(403).json({ message: 'Forbidden' });
    }

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
