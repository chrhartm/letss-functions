import functions = require("firebase-functions");
import admin = require("firebase-admin");
import {firestore} from "firebase-admin";
import utils = require("./utils");

exports.updateSubscription = functions.region("europe-west1")
    .runWith({
      enforceAppCheck: false,
    })
    .https.onCall(
        async (data, context) => {
          /*
          if (context.app == undefined) {
            throw new functions.https.HttpsError(
                "failed-precondition",
                "The function must be called from an App Check verified app.");
          }
          */
          const userId = context.auth?context.auth.uid:null;
          if (userId == null) {
            throw new functions.https.HttpsError("unauthenticated",
                "Not authenticated");
          }
          const db = admin.firestore();
          const productId = data.productId;
          const timestamp = new Date(data.timestamp);
          let badge = "";

          console.log("userid: " + userId);
          console.log("productId: " + productId);
          console.log("timestamp: " + timestamp);

          try {
            await db.collection("badges")
                .doc(productId)
                .get()
                .then((doc) => {
                  const docData = doc.data();
                  if (docData == null) {
                    throw new functions.https.HttpsError("not-found",
                        "Product not found");
                  }
                  badge = docData.badge;
                });
          } catch (error) {
            throw new functions.https.HttpsError("not-found",
                "Couldn 't find user.");
          }
          try {
            await db.collection("users")
                .doc(userId)
                .update({"subscription":
                    {"productId": productId, "timestamp": timestamp},
                "coins": 50});
          } catch (error) {
            throw new functions.https.HttpsError("unknown",
                "Couldn't update user.");
          }
          try {
            await db.collection("persons")
                .doc(userId)
                .update({"badge": badge});
          } catch (error) {
            console.log("couldn't update badge in person " + error);
            throw new functions.https.HttpsError("unknown",
                "Couldn't update person.");
          }
        });

exports.markReviewRequested = functions.region("europe-west1")
    .runWith({
      enforceAppCheck: false,
    })
    .https.onCall(
        async (data, context) => {
          /*
          if (context.app == undefined) {
            throw new functions.https.HttpsError(
                "failed-precondition",
                "The function must be called from an App Check verified app.");
          }
          */
          const userId = context.auth?context.auth.uid:null;
          if (userId == null) {
            throw new functions.https.HttpsError("unauthenticated",
                "Not authenticated");
          }
          const db = admin.firestore();

          console.log("userid: " + userId);

          try {
            await db.collection("users")
                .doc(userId)
                .update({"requestedReview": firestore.Timestamp.now()});
          } catch (error) {
            throw new functions.https.HttpsError("unknown",
                "Couldn't update user.");
          }
        });

exports.markSupportRequested = functions.region("europe-west1")
    .runWith({
      enforceAppCheck: false,
    })
    .https.onCall(
        async (data, context) => {
          /*
          if (context.app == undefined) {
            throw new functions.https.HttpsError(
                "failed-precondition",
                "The function must be called from an App Check verified app.");
          }
          */
          const userId = context.auth?context.auth.uid:null;
          if (userId == null) {
            throw new functions.https.HttpsError("unauthenticated",
                "Not authenticated");
          }
          const db = admin.firestore();

          console.log("userid: " + userId);

          try {
            await db.collection("users")
                .doc(userId)
                .update({"lastSupportRequest": firestore.Timestamp.now()});
          } catch (error) {
            throw new functions.https.HttpsError("unknown",
                "Couldn't update user.");
          }
        });

exports.markNotificationsRequested = functions.region("europe-west1")
    .runWith({
      enforceAppCheck: false,
    })
    .https.onCall(
        async (data, context) => {
          /*
          if (context.app == undefined) {
            throw new functions.https.HttpsError(
                "failed-precondition",
                "The function must be called from an App Check verified app.");
          }
          */
          const userId = context.auth?context.auth.uid:null;
          if (userId == null) {
            throw new functions.https.HttpsError("unauthenticated",
                "Not authenticated");
          }
          const db = admin.firestore();

          console.log("userid: " + userId);

          try {
            await db.collection("users")
                .doc(userId)
                .update({"lastNotificationsRequest":
                  firestore.Timestamp.now()});
          } catch (error) {
            throw new functions.https.HttpsError("unknown",
                "Couldn't update user.");
          }
        });

exports.updateLastOnline = functions.region("europe-west1")
    .runWith({
      enforceAppCheck: false,
    })
    .https.onCall(
        async (data, context) => {
          /*
          if (context.app == undefined) {
            throw new functions.https.HttpsError(
                "failed-precondition",
                "The function must be called from an App Check verified app.");
          }
          */
          const userId = context.auth?context.auth.uid:null;
          if (userId == null) {
            throw new functions.https.HttpsError("unauthenticated",
                "Not authenticated");
          }
          const db = admin.firestore();

          console.log("userid: " + userId);

          try {
            await db.collection("users")
                .doc(userId)
                .update({"lastOnline": firestore.Timestamp.now()});
          } catch (error) {
            throw new functions.https.HttpsError("unknown",
                "Couldn't update user.");
          }
        });

exports.getConfig = functions.region("europe-west1")
    .runWith({
      enforceAppCheck: false,
    })
    .https.onCall(
        async (data, context) => {
          /*
          if (context.app == undefined) {
            throw new functions.https.HttpsError(
                "failed-precondition",
                "The function must be called from an App Check verified app.");
          }
          */
          const userId = context.auth?context.auth.uid:null;
          if (userId == null) {
            throw new functions.https.HttpsError("unauthenticated",
                "Not authenticated");
          }
          const db = admin.firestore();
          let forceAddActivity = true;
          const searchDays = 1000;

          console.log("userid: " + userId);

          try {
            await db.collection("persons")
                .doc(userId)
                .get().then((doc) => {
                  const personData = doc.data();
                  if (personData == null) {
                    throw new functions.https.HttpsError("not-found",
                        "Person not found");
                  }
                  const locality = personData.location.locality;
                  if (locality == "EAGx Utrecht") {
                    forceAddActivity = false;
                  }
                });
          } catch (error) {
            console.log("error: " + error);
            throw new functions.https.HttpsError("unknown",
                "Couldn't get person data.");
          }
          const returnData = {
            "forceAddActivity": forceAddActivity,
            "activityAddPromptEveryTenX": 2,
            "minChatsForReview": 3,
            "searchDays": searchDays,
            // Deprecated - Use Firebase Config instead for easier l10n
            "supportPitch": "Enjoying our app? Buy us a coffee and" +
              " get a supporter badge on your profile.",
            "supportRequestInterval": 360,
            "notificationsRequestInterval": 7,
            "hubs": [
              {"name": "Amsterdam",
                "lat": 52.370216,
                "lng": 4.895168,
                "emoji": "🇳🇱"},
              {"name": "Berlin",
                "lat": 52.520008,
                "lng": 13.404954,
                "emoji": "🇩🇪"},
              {"name": "Zurich",
                "lat": 47.376888,
                "lng": 8.541694,
                "emoji": "🇨🇭"},
              {"name": "London",
                "lat": 51.507351,
                "lng": -0.127758,
                "emoji": "🇬🇧"},
            ],
          };
          return returnData;
        });

exports.updateToken = functions.region("europe-west1")
    .runWith({
      enforceAppCheck: false,
    })
    .https.onCall(
        async (data, context) => {
          /*
          if (context.app == undefined) {
            throw new functions.https.HttpsError(
                "failed-precondition",
                "The function must be called from an App Check verified app.");
          }
          */
          const userId = context.auth?context.auth.uid:null;
          if (userId == null) {
            throw new functions.https.HttpsError("unauthenticated",
                "Not authenticated");
          }
          const db = admin.firestore();
          const token = data.token;
          if (token == null) {
            throw new functions.https.HttpsError("invalid-argument",
                "No token provided.");
          }

          console.log("userid: " + userId);
          console.log("token: " + token);

          try {
            await db.collection("users")
                .doc(userId)
                .update({"token": {"token": token,
                  "timestamp": firestore.Timestamp.now()}});
          } catch (error) {
            throw new functions.https.HttpsError("unknown",
                "Couldn't update user.");
          }
        });

exports.updateLocale = functions.region("europe-west1")
    .runWith({
      enforceAppCheck: false,
    })
    .https.onCall(
        async (data, context) => {
          /*
          if (context.app == undefined) {
            throw new functions.https.HttpsError(
                "failed-precondition",
                "The function must be called from an App Check verified app.");
          }
          */
          const userId = context.auth?context.auth.uid:null;
          if (userId == null) {
            throw new functions.https.HttpsError("unauthenticated",
                "Not authenticated");
          }
          const db = admin.firestore();
          const locale = data.locale;
          if (locale == null) {
            throw new functions.https.HttpsError("invalid-argument",
                "No locale provided.");
          }

          console.log("userid: " + userId);
          console.log("locale: " + locale);

          try {
            await db.collection("users")
                .doc(userId)
                .update({"locale": locale});
          } catch (error) {
            throw new functions.https.HttpsError("unknown",
                "Couldn't update user.");
          }
        });

exports.validatePerson = functions.region("europe-west1").firestore
    .document("/persons/{personId}")
    .onUpdate((change, ) => {
      const db = admin.firestore();
      const uid = change.after.id;
      const afterP = change.after.data();

      console.log("Validating person: " + uid);

      return sendEmailOnJoin(change).then(() => {
        return db.collection("users").doc(uid)
            .get().then((document) => {
              if (document.exists == false) {
                console.log("Couldn't find user: " + uid);
                throw new functions.https.HttpsError("not-found",
                    "Couldn't find user.");
              }
              const user = document.data();
              if (user == null) {
                throw new functions.https.HttpsError("not-found",
                    "User not found.");
              }
              if (user.badge == afterP.badge) {
                console.log("Nothing to do for : " + uid);
                return null;
              } else {
                return db.collection("badges")
                    .doc(user.subscription.productId)
                    .get()
                    .then((badge) => {
                      const badgeData = badge.data();
                      if (badgeData == null) {
                        throw new functions.https.HttpsError("not-found",
                            "Product not found");
                      }
                      return db.collection("persons")
                          .doc(uid)
                          .update({"badge": badgeData.badge}).then(() => {
                            console.log("Updated badge for " + uid);
                            return null;
                          });
                    });
              }
            });
      });
    });

/**
   * Send an email on join
   * @param {functions.Change<functions.firestore.QueryDocumentSnapshot>}
   * change - change
   * @return {function} - Some function
   */
async function sendEmailOnJoin(change:
    functions.Change<functions.firestore.QueryDocumentSnapshot>) {
  // Check if location changed from null to something
  const before = change.before.data();
  const after = change.after.data();
  const uid = change.after.id;

  if (before.location != null || after.location == null) {
    return;
  }

  const db = admin.firestore();
  let count = 1;

  console.log("Sending email for: " + uid);

  const counterPath = db.collection("stats")
      .doc(after.location["isoCountryCode"])
      .collection("localities")
      .doc(after.location["locality"]);
  await counterPath.get().then((doc) => {
    if (doc.exists) {
      counterPath.update({
        "count": firestore.FieldValue.increment(1),
      });
    } else {
      counterPath.set({
        "count": 1,
      });
    }
  });
  await counterPath.get().then((doc) => {
    if (doc.exists && doc.data() != null) {
      count = doc.data()!.count;
    }
  });

  return db.collection("persons")
      .doc(uid)
      .get()
      .then((document) => {
        if (document.exists == false) {
          console.log("Couldn't find person: " + uid);
          throw new functions.https.HttpsError("not-found",
              "Couldn't find person.");
        }
        const personData = document.data();
        if (personData == null) {
          throw new functions.https.HttpsError("not-found",
              "Person not found.");
        }

        return admin.auth().getUser(uid)
            .then((userRecord) => {
              const email = userRecord.email;
              if (email == null) {
                throw new functions.https.HttpsError("not-found",
                    "Email not found.");
              }
              // Send email
              return utils.addToEmailList(
                  personData.name as string,
                  email,
                  after.location["locality"] as string,
                  count as number,
                  personData.locale as string,
              ).then((response) => console.log(
                  "Successfully added user to list:", response)
              );
            })
            .catch(function(error) {
              console.log("Error adding user to list: ", error);
              throw new functions.https.HttpsError("unknown",
                  "Error adding user to list.");
            });
      });
}

exports.initializeUser = functions.auth
    .user()
    .onCreate(async (user, ) => {
      const db = admin.firestore();
      const payload = {"coins": 10,
        "lastSupportRequest": firestore.Timestamp.now(),
        "lastOnline": firestore.Timestamp.now(),
        "dateRegistered": firestore.Timestamp.now(),
        "status": "ACTIVE",
        "subscription":
            {"productId": "none", "timestamp": firestore.Timestamp.now()}};

      console.log("Initializing user: " + user.uid);

      return db.collection("users")
          .doc(user.uid)
          .set(payload, {merge: true})
          .then(() => console.log("Initialized user " + user.uid))
          .catch(function(error) {
            console.log("Error: " + error);
            throw new functions.https.HttpsError("unknown",
                "Error initializing user.");
          });
    });

exports.deleteUser = functions.region("europe-west1")
    .runWith({
      enforceAppCheck: false,
    })
    .https.onCall(
        async (data, context) => {
          /*
          if (context.app == undefined) {
            throw new functions.https.HttpsError(
                "failed-precondition",
                "The function must be called from an App Check verified app.");
          }
          */
          const userId = context.auth?context.auth.uid:null;
          if (userId == null) {
            throw new functions.https.HttpsError("unauthenticated",
                "Not authenticated");
          }
          console.log("Deleting userid: " + userId);
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
  // global error flag to not interrupt deletion process
  let error = false;
  const defaultBucket = admin.storage().bucket();

  console.log("Deleting userid: " + userId);

  // Make sure user doesn't have any flags against them
  console.log("Checking flags");
  await db
      .collection("flags")
      .where("flagged", "==", userId)
      .get()
      .then(
          (query) => {
            if (!query.empty) {
              throw new functions.https.HttpsError("unknown",
                  "User can't be deleted.");
            }
          });

  // Remove from sendGrid by first getting email from auth
  console.log("Removing from email list");
  await admin.auth().getUser(userId)
      .then((user) => {
        return utils.removeFromEmailList(user.email as string)
            .then(() => console.log("Removed user from list"))
            .catch(function(err) {
              console.log("Error removing user from list: " + err);
              error = true;
            });
      })
      .catch(function(err) {
        console.log("Error getting user: " + err);
        error = true;
      });

  // Delete blocks by user
  // ignore deletion of where user was blocked for now, low risk
  console.log("Deleting blocks");
  await db
      .collection("blocks")
      .doc(userId)
      .delete()
      .catch(function(err) {
        console.log("Error in blocks deletion " + err);
      });

  // Delete scheduled notifications
  console.log("Deleting scheduled notifications");
  await db
      .collection("scheduled-notifications")
      .where("user", "==", userId)
      .get()
      .then(
          (query) => {
            return Promise.all(query.docs.map(
                async (doc) => {
                  await db.collection("scheduled-notifications")
                      .doc(doc.id)
                      .delete().then(() => console.log(
                          "deleted scheduled notification: " + doc.id))
                      .catch(function(err) {
                        console.log(
                            "failed to delete scheduled notification: " +
                            doc.id + " " + err);
                        error = true;
                      });
                }));
          });

  // Delete likes of own activities and activities
  console.log("Deleting likes on own activities");
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
                        error = true;
                      });
                  await db.collection("activities")
                      .doc(doc.id)
                      .delete();
                  // Delete activity images
                  await defaultBucket.deleteFiles({prefix: "activityImages/" +
                       doc.id})
                      .then(() => console.log("deleted image for " + doc.id))
                      .catch(function(err) {
                        console.log("error deleting activity images: " + err);
                        error = true;
                      });
                }));
          }
      )
      .catch(function(err) {
        console.log("Error in query " + err);
        error = true;
      });
  // delete likes of other"s activities and matches
  console.log("Deleting likes on other's activities");
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
                      .catch(function(err) {
                        console.log(
                            "failed to delete like for activity: " +
                            data.activity + " " + err);
                        error = true;
                      });
                  // In case of join, delete join
                  await db.collection("activities")
                      .doc(data.activity)
                      .update({"participants":
                      firestore.FieldValue.arrayRemove(userId)})
                      .then(() => console.log(
                          "deleted participation for activity: " +
                          data.activity))
                      .catch(function(err) {
                        console.log(
                            "failed to delete participation for activity: " +
                        data.activity + " " + err);
                        error = true;
                      });
                  // In case of join, delete join
                  await db.collection("activities")
                      .doc(data.activity)
                      .update({"participantsLeft":
                      firestore.FieldValue.arrayRemove(userId)})
                      .then(() => console.log(
                          "deleted participLeft for activity: " +
                                        data.activity))
                      .catch(function(err) {
                        console.log(
                            "failed to delete participLeft for activity: " +
                                      data.activity + " " + err);
                        error = true;
                      });

                  await db.collection("matches")
                      .doc(doc.id)
                      .delete();
                }));
          });
  // delete followers
  // first delete all cases where others follow me then my record of it
  console.log("Deleting followers");
  await db
      .collection("followers")
      .doc(userId)
      .collection("followers")
      .get()
      .then(
          (query) => {
            return Promise.all(query.docs.map(
                async (doc) => {
                  await db
                      .collection("followers")
                      .doc(doc.id)
                      .collection("following")
                      .doc(userId)
                      .delete()
                      .then(() => console.log(
                          "deleted following for user: " + doc.id))
                      .catch(function(err) {
                        console.log(
                            "failed to delete following for user: " +
                doc.id + " " + err);
                        error = true;
                      });
                }));
          });
  const followers = "followers/" + userId + "/followers";
  console.log("Deleting followers");
  await utils.deleteCollection(db,
      followers, batchSize)
      .then(() => {
        console.log("Deleted followers ");
      })
      .catch((err) => {
        console.log("Error in followers " + err);
        error = true;
      });
  // first delete all cases where following others, then following
  console.log("Deleting following");
  await db
      .collection("followers")
      .doc(userId)
      .collection("following")
      .get()
      .then(
          (query) => {
            return Promise.all(query.docs.map(
                async (doc) => {
                  await db
                      .collection("followers")
                      .doc(doc.id)
                      .collection("followers")
                      .doc(userId)
                      .delete()
                      .then(() => console.log(
                          "deleted follower for user: " + doc.id))
                      .catch(function(err) {
                        console.log(
                            "failed to delete follower for user: " +
                    doc.id + " " + err);
                        error = true;
                      });
                }));
          });


  const following = "following/" + userId + "/following";
  console.log("Deleting following");
  await utils.deleteCollection(db,
      following, batchSize)
      .then(() => {
        console.log("Deleted following ");
      })
      .catch((err) => {
        console.log("Error in following " + err);
        error = true;
      });
  // delete followers for user
  console.log("Deleting followers for user: " + userId);
  await db
      .collection("followers")
      .doc(userId)
      .delete()
      .then(() => console.log(
          "deleted followers for user: " + userId))
      .catch(function(err) {
        console.log(
            "failed to delete followers for user: " +
        userId + " " + err);
        error = true;
      });

  // delete chat messages and anonymize chat
  console.log("Deleting chat messages");
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
                    error = true;
                  });

              if (doc.data().activityData == null) {
                const users = doc.data().users;
                const index = users.indexOf(userId, 0);
                const deletemessage = {
                  "message": "This user deleted their account",
                  "user": "DELETED",
                  "timestamp": firestore.Timestamp.now()};
                users[index] = "DELETED";
                await db.collection("chats")
                    .doc(doc.id)
                    .update({"status": doc.data().status, "read": [],
                      "users": users, "lastMessage": deletemessage});
                await db.collection("chats")
                    .doc(doc.id)
                    .collection("messages")
                    .add(deletemessage);
              } else {
                if (doc.data().activityData.user == userId) {
                  const users = doc.data().users;
                  const index = users.indexOf(userId, 0);
                  const deletemessage = {
                    "message": "This user deleted their account",
                    "user": "DELETED",
                    "timestamp": firestore.Timestamp.now()};
                  users[index] = "DELETED";
                  const a = doc.data().activityData;
                  a.user = "DELETED";
                  a.uid = "DELETED";
                  await db.collection("chats")
                      .doc(doc.id)
                      .update({"status": doc.data().status, "read": [],
                        "users": users, "lastMessage": deletemessage,
                        "activityData": a});
                  await db.collection("chats")
                      .doc(doc.id)
                      .collection("messages")
                      .add(deletemessage);
                } else {
                  await db.collection("chats")
                      .doc(doc.id)
                      .update({"users":
                      firestore.FieldValue.arrayRemove(userId)});
                }
              }
            }));
          }
      )
      .catch(function(err) {
        console.log("Error in query " + err);
        error = true;
      });

  // delete chat messages and anonymize chat
  console.log("Deleting chat messages on own leftChat");
  await db
      .collection("chats")
      .where("usersLeft", "array-contains", userId)
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
                    console.log("Deleted messages on own leftChat: " +
                      val);
                  })
                  .catch((err) => {
                    console.log("Error in promise " + err);
                    error = true;
                  });
              if (doc.data().activityData == null) {
                const usersLeft = doc.data().usersLeft;
                const index = usersLeft.indexOf(userId, 0);
                const deletemessage = {
                  "message": "This user deleted their account",
                  "user": "DELETED",
                  "timestamp": firestore.Timestamp.now()};
                usersLeft[index] = "DELETED";
                await db.collection("chats")
                    .doc(doc.id)
                    .update({"status": doc.data().status, "read": [],
                      "usersLeft": usersLeft, "lastMessage": deletemessage});
                await db.collection("chats")
                    .doc(doc.id)
                    .collection("messages")
                    .add(deletemessage);
              } else {
                await db.collection("chats")
                    .doc(doc.id)
                    .update({"usersLeft":
                      firestore.FieldValue.arrayRemove(userId)});
              }
            }));
          }
      )
      .catch(function(err) {
        console.log("Error in query " + err);
        error = true;
      });
  // delete notifications
  console.log("Deleting notifications");
  await db.collection("notifications")
      .doc(userId)
      .delete()
      .catch(function(err) {
        console.log("error deleting notifications: " + err);
        error = true;
      });
  // delete images
  console.log("Deleting images");
  await defaultBucket.deleteFiles({prefix: "profilePics/" + userId})
      .then(() => console.log("deleted all files"))
      .catch(function(err) {
        console.log("error deleting profile pics: " + err);
        error = true;
      });
  // delete person
  console.log("Deleting person");
  await db.collection("persons")
      .doc(userId)
      .delete()
      .catch(function(err) {
        console.log("Couldn't delete person: " + err);
        error = true;
      });
  // delete user
  console.log("Deleting user");
  await db.collection("users")
      .doc(userId)
      .delete()
      .catch(function(err) {
        console.log("Couldn't delete user " + err);
        error = true;
      });
  // delete user (auth)
  console.log("Deleting user (auth)");
  admin.auth().deleteUser(userId)
      .catch(function(err) {
        console.log("Couldn't delete auth user: " + err);
        error = true;
      });
  if (error) {
    throw new functions.https.HttpsError("unknown",
        "Error deleting user.");
  }
}
