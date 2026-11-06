const crypto = require('crypto');
const initFirebase = require('../firebase-admin-init');

let firestore, bucket, admin;
try {
  const fb = initFirebase();
  admin = fb.admin;
  firestore = fb.db;
  bucket = fb.bucket;
} catch (err) {
  console.error('Failed to initialize Firebase:', err);
}

function ensureFirestore() {
  if (!firestore) throw new Error('Firestore is not initialized');
  return firestore;
}

async function init() {
  if (!firestore) throw new Error('Firestore is not initialized');
  // No special collection creation needed for Firestore
  console.log('✅ Firestore adapter initialized');
}

async function createOrder(orderData) {
  if (!firestore) throw new Error('Firestore is not initialized');
  const docRef = firestore.collection('orders').doc();
  const data = {
    original_file_name: orderData.originalFileName,
    stored_file_name: orderData.storedFileName,
    file_path: orderData.filePath, // can be local path or storage path
    file_download_url: orderData.fileDownloadURL || null,
    service: orderData.service,
    custom_service_description: orderData.customServiceDescription || null,
    vehicle_info: orderData.vehicleInfo,
    ecu_reference: orderData.ecuReference || null,
    customer_name: orderData.customerName,
    customer_email: orderData.customerEmail,
    customer_phone: orderData.customerPhone || null,
    status: orderData.status || 'pending',
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  };
  await docRef.set(data);
  const doc = await docRef.get();
  return { id: docRef.id, ...doc.data() };
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function getAllOrders() {
  // Do not orderBy('created_at'): Firestore excludes documents where the
  // ordered field is missing, which hides migrated rows with null timestamps.
  const snap = await ensureFirestore().collection('orders').get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => timestampMillis(b.created_at) - timestampMillis(a.created_at));
}

async function getOrder(id) {
  const doc = await ensureFirestore().collection('orders').doc(String(id)).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function updateOrderStatus(id, status) {
  await ensureFirestore().collection('orders').doc(String(id)).update({
    status,
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function updateOrderModifiedFile(id, fileData) {
  const update = {
    modified_file_name: fileData.modifiedFileName,
    modified_stored_file_name: fileData.modifiedStoredFileName,
    modified_file_path: fileData.modifiedFilePath,
    modified_file_download_url: fileData.modifiedFileDownloadURL || null,
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  };
  await ensureFirestore().collection('orders').doc(String(id)).update(update);
}

async function deleteOrder(id) {
  await ensureFirestore().collection('orders').doc(String(id)).delete();
}

async function uploadLocalFileToStorage(localPath, destPath) {
  if (!bucket) throw new Error('Firebase storage bucket not initialized');
  const uuid = crypto.randomUUID();
  const file = bucket.file(destPath);
  await file.save(require('fs').readFileSync(localPath));
  await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: uuid } });
  const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destPath)}?alt=media&token=${uuid}`;
  return { path: destPath, downloadURL };
}

async function downloadFileFromStorage(storagePath) {
  if (!bucket) throw new Error('Firebase storage bucket not initialized');
  const [buffer] = await bucket.file(storagePath).download();
  return buffer;
}

async function deleteFileFromStorage(storagePath) {
  if (!bucket) throw new Error('Firebase storage bucket not initialized');
  await bucket.file(storagePath).delete({ ignoreNotFound: true });
}

module.exports = {
  init,
  createOrder,
  getAllOrders,
  getOrder,
  updateOrderStatus,
  updateOrderModifiedFile,
  deleteOrder,
  uploadLocalFileToStorage,
  downloadFileFromStorage,
  deleteFileFromStorage
};
