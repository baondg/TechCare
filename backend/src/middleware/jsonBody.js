const express = require('express');

/**
 * JSON body parsing. The app-wide parser keeps express's 100 kB default; a few routes carry files
 * as base64 and parse their own larger body in the router, after authentication, so anonymous
 * clients cannot make the server buffer big bodies.
 */

/** Full request paths whose router parses the JSON body itself. */
const OWN_JSON_BODY_PATHS = new Set(['/api/doctor/lab-attachments']);

const defaultJsonBody = express.json();

/** App-wide `express.json()`, except for OWN_JSON_BODY_PATHS. */
function jsonBody(req, res, next) {
  const pathNoSlash = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
  if (OWN_JSON_BODY_PATHS.has(pathNoSlash)) return next();
  return defaultJsonBody(req, res, next);
}

/** Lab attachment: up to 15 MB of file as base64 (~20 MB) plus the other fields. */
const labAttachmentJsonBody = express.json({ limit: '21mb' });

module.exports = { jsonBody, labAttachmentJsonBody, OWN_JSON_BODY_PATHS };
