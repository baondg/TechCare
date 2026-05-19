const workShiftService = require('../services/workShiftService');

exports.getStaffDirectory = async (req, res) => {
  try {
    const out = await workShiftService.getStaffDirectory(req.user?.role);
    return res.status(out.status).json(out.json);
  } catch (error) {
    console.error('getStaffDirectory error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.getMyWorkShifts = async (req, res) => {
  try {
    const out = await workShiftService.getMyWorkShifts(req.user?.userId, req.user?.role, req.query);
    return res.status(out.status).json(out.json);
  } catch (error) {
    console.error('getMyWorkShifts error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};
