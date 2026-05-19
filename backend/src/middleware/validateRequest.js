module.exports = function validateRequest(fn) {
  return (req, res, next) => {
    try {
      fn(req);
      next();
    } catch (e) {
      next(e);
    }
  };
};
