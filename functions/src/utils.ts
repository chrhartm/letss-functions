import sendGridClient = require("@sendgrid/mail");
import functions = require("firebase-functions");

/**
 * Copied from https://firebase.google.com/docs/firestore/manage-data/delete-data
 * @param {FirebaseFirestore.Firestore} db - db
 * @param {string} collectionPath - collectionPath
 * @param {number} batchSize - batchSize
 * @return {function} - Some function
 */
export async function deleteCollection(db: FirebaseFirestore.Firestore,
    collectionPath: string, batchSize: number) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy("__name__").limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve).catch(reject);
  });
}

/**
 * Adapted from above
 * @param {FirebaseFirestore.Firestore} db - db
 * @param {FirebaseFirestore.Query<FirebaseFirestore.DocumentData>} query - q
 * @param {number} batchSize - batchSize
 * @return {function} - Some function
 */
export async function deleteQueryResults(
    db: FirebaseFirestore.Firestore,
    query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>,
    batchSize: number) {
  const _query = query.limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, _query, resolve).catch(reject);
  });
}

/**
 * Copied from https://firebase.google.com/docs/firestore/manage-data/delete-data
 * @param {FirebaseFirestore.Firestore} db - db
 * @param {FirebaseFirestore.Query<FirebaseFirestore.DocumentData>} query - qu
 * @param {function} resolve - resolve
 * @return {function} - Some function
 */
async function deleteQueryBatch(
    db: FirebaseFirestore.Firestore,
    query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>,
    resolve: (value: unknown) => void): Promise<void> {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    // When there are no documents left, we are done
    resolve("Deleted all data");
    return;
  }

  // Delete documents in a batch
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  // Recurse on the next process tick, to avoid
  // exploding the stack.
  process.nextTick(() => {
    deleteQueryBatch(db, query, resolve);
  });
}

// requires firebase functions:config:set sendgrid.key="KEY"
/**
   * Send an email
   * @param {string} templateId - sendGrid template ID
   * @param {string} fromName - sender name
   * @param {string} fromAddress - sender address
   * @param {string} toAddress - address to send to
   * @param {string} unsubscribeId - unsubscribe ID
   * @param {any} data - data to be sent as json
   * @return {function} - Some function
   */
export async function sendEmail(templateId: string,
    fromName: string,
    fromAddress: string,
    toAddress: string,
    unsubscribeId: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any) {
  sendGridClient.setApiKey(functions.config().sendgrid.key);

  const mailData = {
    to: toAddress,
    asm: {
      groupId: unsubscribeId,
    },
    from: {
      email: fromAddress,
      name: fromName,
    },
    templateId: templateId,
    dynamic_template_data: data,
  };
  return sendGridClient.send(mailData);
}
