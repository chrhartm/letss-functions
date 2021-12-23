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
