const coverService = require('../services/coverService');

exports.createCoverRequest = async (req, res) => {
  try {
    const out = await coverService.createCoverRequest(req.user.userId, req.body);
    return res.status(out.status).json(out.json);
  } catch (error) {
    console.error('Create cover request error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.getCoverRequests = async (req, res) => {
  try {
    const out = await coverService.getCoverRequests(req.user.userId);
    return res.status(out.status).json(out.json);
  } catch (error) {
    console.error('Get cover requests error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.getMyCoverRequests = async (req, res) => {
  try {
    const out = await coverService.getMyCoverRequests(req.user.userId);
    return res.status(out.status).json(out.json);
  } catch (error) {
    console.error('Get my cover requests error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.acceptCoverRequest = async (req, res) => {
  try {
    const out = await coverService.acceptCoverRequest(req.user.userId, Number(req.params.id));
    return res.status(out.status).json(out.json);
  } catch (error) {
    console.error('Accept cover request error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.rejectCoverRequest = async (req, res) => {
  try {
    const out = await coverService.rejectCoverRequest(req.user.userId, Number(req.params.id));
    return res.status(out.status).json(out.json);
  } catch (error) {
    console.error('Reject cover request error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};
