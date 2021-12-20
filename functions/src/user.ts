import functions = require("firebase-functions");
import admin = require("firebase-admin");
import {firestore} from "firebase-admin";

/**
 * Copied from https://firebase.google.com/docs/firestore/manage-data/delete-data
 * @param {FirebaseFirestore.Firestore} db - db
 * @param {string} collectionPath - collectionPath
 * @param {number} batchSize - batchSize
 * @return {function} - Some function
 */
async function deleteCollection(db: FirebaseFirestore.Firestore,
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
async function deleteQueryResults(db: FirebaseFirestore.Firestore,
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
async function deleteQueryBatch(db: FirebaseFirestore.Firestore,
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

exports.deleteUser = functions.region("europe-west1").https.onCall(
    async (data, context) => {
      const userId = (context.auth && context.auth.uid)!;
      const db = admin.firestore();
      const batchSize = 100;

      console.log("Deleting userid: " + userId);

      // Delete likes of own activities and activities
      await db
          .collection("activities")
          .where("user", "==", userId)
          .get()
          .then(
              (query) => {
                return Promise.all(query.docs.map(
                    async (doc) => {
                      const collection = "activities/"+doc.id+"/likes";
                      console.log("Attempting delete for : " + collection);
                      await deleteCollection(db,
                          collection, batchSize)
                          .then((val) => {
                            console.log("Deleted likes on own activities: " +
                                val);
                          })
                          .catch((err) => {
                            console.log("Error in promise " + err);
                          });
                      await db.collection("activities")
                          .doc(doc.id)
                          .delete();
                    }));
              }
          )
          .catch((err) => console.log("Error in query " + err));
      // delete likes of other"s activities and matches
      await db
          .collection("matches")
          .where("user", "==", userId)
          .get()
          .then(
              (query) => {
                return Promise.all(query.docs.map(
                    async (doc) => {
                      const data = doc.data();
                      if (data.status == "LIKE") {
                        await db.collection("activities")
                            .doc(data.activity)
                            .collection("likes")
                            .doc(userId)
                            .delete()
                            .then(() => console.log(
                                "deleted like for activity: " + data.activity))
                            .catch((err) => console.log(
                                "failed to delete like for activity: " +
                                data.activity + " " + err));
                      }
                      await db.collection("matches")
                          .doc(doc.id)
                          .delete();
                    }));
              });
      // delete chat messages and anonymize chat
      await db
          .collection("chats")
          .where("users", "array-contains", userId)
          .get()
          .then(
              (query) => {
                return Promise.all(query.docs.map(async (doc) => {
                  const collection = "chats/"+doc.id+"/messages";
                  console.log("Attempting delete for : " + collection);
                  const query = db.collection(collection).where("user",
                      "==", userId);
                  await deleteQueryResults(db,
                      query, batchSize)
                      .then((val) => {
                        console.log("Deleted messages on own chat: " +
                            val);
                      })
                      .catch((err) => {
                        console.log("Error in promise " + err);
                      });
                  const users = doc.data().users;
                  const index = users.indexOf(userId, 0);
                  const deletemessage = {
                    "message": "This user deleted his account",
                    "user": "DELETED",
                    "timestamp": firestore.Timestamp.now()};
                  users[index] = "DELETED";
                  await db.collection("chats")
                      .doc(doc.id)
                      .set({"status": doc.data().status, "read": [],
                        "users": users, "lastMessage": deletemessage});
                  await db.collection("chats")
                      .doc(doc.id)
                      .collection("messages")
                      .add(deletemessage);
                }));
              }
          )
          .catch((err) => console.log("Error in query " + err));
      // delete notifications
      await db.collection("notifications")
          .doc(userId)
          .delete()
          .catch(() => {
            return {code: 500, message: "Couldn't delete notifications"};
          });
      // delete image
      const defaultBucket = admin.storage().bucket();
      const file = defaultBucket.file("profilePics/" + userId + ".jpg");
      await file.delete()
          .then(() => console.log("deleted profile pic"))
          .catch((err) => console.log("error deleting profile pic: " + err));

      // delete user
      await db.collection("users")
          .doc(userId)
          .delete()
          .catch(() => {
            return {code: 500, message: "Couldn't delete user"};
          });
      // delete user (auth)
      admin.auth().deleteUser(userId);
      return {code: 200, message: "Deleted user"};
    }
);

exports.initializeUser = functions.region("europe-west1").firestore
    .document("/users/{userId}")
    .onCreate((snap, context) => {
      const db = admin.firestore();
      const payload = {"coins": 5};
      return db.collection("users")
          .doc(snap.id)
          .update(payload)
          .then(() => console.log("Initialized user " + snap.id))
          .catch((err) => console.log("Error: " + err));
    });
