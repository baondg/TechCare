const coverService = require('../services/coverService');
const logger = require('../common/logger');

exports.createCoverRequest = async (req, res) => {
  try {
    const out = await coverService.createCoverRequest(req.user.userId, req.body);
    return res.status(out.status).json(out.json);
  } catch (error) {
    logger.error({ err: error }, 'Create cover request error');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getCoverRequests = async (req, res) => {
  try {
    const out = await coverService.getCoverRequests(req.user.userId);
    return res.status(out.status).json(out.json);
  } catch (error) {
    logger.error({ err: error }, 'Get cover requests error');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getMyCoverRequests = async (req, res) => {
  try {
    const out = await coverService.getMyCoverRequests(req.user.userId);
    return res.status(out.status).json(out.json);
  } catch (error) {
    logger.error({ err: error }, 'Get my cover requests error');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.acceptCoverRequest = async (req, res) => {
  try {
    const out = await coverService.acceptCoverRequest(req.user.userId, Number(req.params.id));
    return res.status(out.status).json(out.json);
  } catch (error) {
    logger.error({ err: error }, 'Accept cover request error');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.rejectCoverRequest = async (req, res) => {
  try {
    const out = await coverService.rejectCoverRequest(req.user.userId, Number(req.params.id));
    return res.status(out.status).json(out.json);
  } catch (error) {
    logger.error({ err: error }, 'Reject cover request error');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
