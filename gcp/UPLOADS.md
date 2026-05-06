# Ephemeral disk and `/uploads` on Cloud Run

The API serves and stores files under `uploads/` on local disk ([`backend/src/index.ts`](../backend/src/index.ts), [`doctorController.js`](../backend/src/controllers/doctorController.js)). Cloud Run instances use **ephemeral** filesystems; files can disappear after scale-down or on new revisions.

For durable uploads on Google Cloud, a typical follow-up is:

1. Create a **Cloud Storage** bucket (private) in the same project/region.
2. Use a service account on Cloud Run with `roles/storage.objectAdmin` (or minimal object create/read for that bucket).
3. Replace local `fs.writeFile` / static `/uploads` serving with **GCS** upload (signed URLs or server-side stream) and store object paths/URLs in MySQL.

This is not required for a first successful deploy if you do not rely on persisting lab uploads in production.
