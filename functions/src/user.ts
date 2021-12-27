import functions = require("firebase-functions");
import admin = require("firebase-admin");
import {firestore} from "firebase-admin";
import utils = require("./utils");

// TODO .region not needed?
exports.initializeUser = functions.auth
    .user()
    .onCreate(async (user, context) => {
      const db = admin.firestore();
      const payload = {"coins": 5,
        "lastSupportRequest": firestore.Timestamp.now(),
        "lastOnline": firestore.Timestamp.now()};
      return db.collection("users")
          .doc(user.uid)
          .set(payload, {merge: true})
          .then(() => console.log("Initialized user " + user.uid))
          .catch((err) => console.log("Error: " + err));
    });

exports.deleteUser = functions.region("europe-west1").https.onCall(
    async (data, context) => {
      const userId = (context.auth && context.auth.uid)!;
      return deleteUser(userId);
    });

/**
 * Delete a user
 * @param {string} userId - ID of user to be deleted
 * @return {function} - Some function TODO this doesn't make sense
 */
async function deleteUser(userId: string) {
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
                  await utils.deleteCollection(db,
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
                  // Don't filter on like because user
                  // could have first liked and then passed
                  // activity (eg after following link)
                  // if (data.status == "LIKE") {
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
                  // }
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
              await utils.deleteQueryResults(db,
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
  // delete images
  const defaultBucket = admin.storage().bucket();
  await defaultBucket.deleteFiles({prefix: "profilePics/" + userId})
      .then(() => console.log("deleted all files"))
      .catch((err) => console.log("error deleting profile pics: " + err));
  // delete person
  await db.collection("persons")
      .doc(userId)
      .delete()
      .catch(() => {
        return {code: 500, message: "Couldn't delete person"};
      });
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
