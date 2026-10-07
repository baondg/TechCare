const featureRepository = require('../../repositories/featureRepository');
const { NotFoundError } = require('../../errors/AppError');

function normalizeFeature(row) {
  return { ...row, status: Number(row.status) === 1 ? 1 : 0 };
}

async function listFeatures() {
  const features = (await featureRepository.listFeatures() || []).map(normalizeFeature);
  const enabled = features.filter((f) => f.status === 1).length;
  return {
    stats: { total: features.length, enabled, disabled: features.length - enabled },
    features,
  };
}

/** @param {0 | 1} status */
async function setFeatureStatus(id, status) {
  await featureRepository.setFeatureStatus(id, status);
  const row = await featureRepository.findFeature(id);
  if (!row) throw new NotFoundError('Feature not found');
  return normalizeFeature(row);
}

module.exports = { listFeatures, setFeatureStatus };
