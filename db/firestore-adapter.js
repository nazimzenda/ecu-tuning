const initFirebase = require('../firebase-admin-init');
const { v4: uuidv4 } = require('uuid');

let firestore, bucket, admin;
try {
  const fb = initFirebase();
  admin = fb.admin;
  firestore = fb.db;
  bucket = fb.bucket;
} catch (err) {
  console.error('Failed to initialize Firebase:', err);
}

async function init() {
  if (!firestore) return Promise.resolve();
  // No special collection creation needed for Firestore
  console.log('✅ Firestore adapter initialized');
}

async function createOrder(orderData) {
  const docRef = firestore.collection('orders').doc();
  const data = {
    original_file_name: orderData.originalFileName,
    stored_file_name: orderData.storedFileName,
    file_path: orderData.filePath, // can be local path or storage path
    file_download_url: orderData.fileDownloadURL || null,
    service: orderData.service,
    custom_service_description: orderData.customServiceDescription || null,
    vehicle_info: orderData.vehicleInfo,
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

async function getAllOrders() {
  const snap = await firestore.collection('orders').orderBy('created_at', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getOrder(id) {
  const doc = await firestore.collection('orders').doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function updateOrderStatus(id, status) {
  await firestore.collection('orders').doc(id).update({ status, updated_at: admin.firestore.FieldValue.serverTimestamp() });
}

async function updateOrderModifiedFile(id, fileData) {
  const update = {
    modified_file_name: fileData.modifiedFileName,
    modified_stored_file_name: fileData.modifiedStoredFileName,
    modified_file_path: fileData.modifiedFilePath,
    modified_file_download_url: fileData.modifiedFileDownloadURL || null,
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  };
  await firestore.collection('orders').doc(id).update(update);
}

async function deleteOrder(id) {
  await firestore.collection('orders').doc(id).delete();
}

async function uploadLocalFileToStorage(localPath, destPath) {
  if (!bucket) throw new Error('Firebase storage bucket not initialized');
  const uuid = uuidv4();
  const file = bucket.file(destPath);
  await file.save(require('fs').readFileSync(localPath));
  await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: uuid } });
  const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destPath)}?alt=media&token=${uuid}`;
  return { path: destPath, downloadURL };
}

module.exports = {
  init,
  createOrder,
  getAllOrders,
  getOrder,
  updateOrderStatus,
  updateOrderModifiedFile,
  deleteOrder,
  uploadLocalFileToStorage
};
