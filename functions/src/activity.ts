import functions = require("firebase-functions");
import admin = require("firebase-admin");
import {firestore} from "firebase-admin";

exports.like = functions.region("europe-west1")
    .runWith({
      enforceAppCheck: false,
    })
    .https.onCall(
        async (data, context) => {
          /* TODO uncomment when enforceAppCheck true
          if (context.app == undefined) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'The function must be called from an App Check verified app.')
          }
          */
          const userId = (context.auth && context.auth.uid)!;
          const db = admin.firestore();
          const activityId = data.activityId;
          const activityUserId = data.activityUserId;
          const matchId = data.activityId + "_" + userId;
          const like = {
            "message": data.message,
            "status": "ACTIVE",
            "timestamp": firestore.Timestamp.now(),
            "read": false};
          const match = {
            "timestamp": firestore.Timestamp.now(),
            "status": "LIKE",
            "activity": activityId,
            "user": userId};

          console.log("userid: " + userId);
          console.log("activityId: " + activityId);
          console.log("matchId" + matchId);
          console.log("like: " + like.message);


          const userinfo = (await db.collection("users")
              .doc(userId).get()).data();
          if (userinfo == null) {
            throw new functions.https.HttpsError("not-found",
                "Couldn't find user.");
          }

          console.log("coins: " + userinfo.coins);

          if (userinfo.coins == null || userinfo.coins <= 0) {
            throw new functions.https.HttpsError("resource-exhausted",
                "No likes remaining.");
          }

          try {
            await db.collection("matches")
                .doc(matchId)
                // set with all details in case it's coming from a link
                // (needed as audit trail for deleting later)
                .set(match, {merge: true});
          } catch (error) {
            throw new functions.https.HttpsError("unknown",
                "Couldn't update matches.");
          }

          try {
            await db.collection("users")
                .doc(userId)
                .update({"coins": userinfo.coins - 1})
                .then((value) => console.log("Updated coins"));
          } catch (error) {
            console.log("couldn't update coins " + error);
            throw new functions.https.HttpsError("unknown",
                "Couldn't update likes.");
          }

          let blocked = false;
          try {
            await db.collection("blocks")
                .doc(activityUserId)
                .collection("blocks")
                .doc(userId)
                .get()
                .then((value) => {
                  if (value.exists) {
                    blocked = true;
                    console.log(userId + "is blocked by" + activityUserId);
                  }
                });
          } catch (error) {
            // TODO check if this error happens when blocked does not exist
            console.log("couldn't get blocked " + error);
          }

          if (blocked) {
            return;
          }

          try {
            await db.collection("activities")
                .doc(activityId)
                .collection("likes")
                .doc(userId)
                .set(like)
                .then((value) => console.log("set like"));
          } catch (error) {
            console.log("couldn't set like " + error);
            throw new functions.https.HttpsError("unknown",
                "Couldn't set like.");
          }
          try {
            await db.collection("notifications")
                .doc(activityUserId)
                .set({"newLikes": true}, {merge: true})
                .then((value) => console.log("Updated notifications"));
          } catch (error) {
            console.log("couldn't update notifications " + error);
            throw new functions.https.HttpsError("unknown",
                "Couldn't update notifications.");
          }
        }
    );

exports.generateMatches = functions.region("europe-west1")
    .runWith({
      enforceAppCheck: false,
    })
    .https.onCall(
        async (data, context) => {
          /* TODO uncomment when enforceAppCheck true
          if (context.app == undefined) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'The function must be called from an App Check verified app.')
          }
          */
          const N = 30;
          const minN = 100;
          const waitSeconds = 10;
          const userid = (context.auth && context.auth.uid)!;
          const db = admin.firestore();

          console.log("userid: " + userid);

          const userInfo = (await db.collection("users")
              .doc(userid).get()).data();
          if (userInfo == null) {
            throw new functions.https.HttpsError("not-found",
                "Couldn't find user.");
          }
          const personInfo = (await db.collection("persons")
              .doc(userid).get()).data();
          if (personInfo == null) {
            throw new functions.https.HttpsError("not-found",
                "Couldn't find person.");
          }
          const locality = personInfo.location.locality;
          let lastSearch = null;
          if (userInfo!.lastSearch != null) {
            lastSearch = userInfo!.lastSearch[locality];
          }

          if ((lastSearch != null) &&
              (admin.firestore.Timestamp.now().toMillis() -
              lastSearch.toMillis()) < (1000 * waitSeconds)) {
            throw new functions.https.HttpsError("resource-exhausted",
                "Already requested recently");
          }

          if (lastSearch == null) {
            lastSearch = admin.firestore.Timestamp.fromMillis(0);
          }
          const activities = new Set();
          for (const category of personInfo!.interests) {
            await db.collection("activities")
                .where("status", "==", "ACTIVE")
                .where("location.locality", "==", locality)
                .where("timestamp", ">", lastSearch)
                .where("categories", "array-contains", category)
                .orderBy("timestamp", "desc")
                .limit(N)
                .select("user")
                .get()
                .then((querySnapshot) => {
                  querySnapshot.forEach((doc) => {
                    if (doc.data()["user"] != userid) {
                      activities.add(doc.id);
                    }
                  });
                })
                .catch(function(error) {
                  console.log("Error getting documents: ", error);
                  throw new functions.https.HttpsError("unknown",
                      "Error generating matches.");
                });
          }
          // add some without interest filter
          // in case interests are too specific
          let n = minN - activities.size;
          if (n < N) {
            n = N;
          }
          await db.collection("activities")
              .where("status", "==", "ACTIVE")
              .where("location.locality", "==", locality)
              .where("timestamp", ">", lastSearch)
              .orderBy("timestamp", "desc")
              .limit(n)
              .select("user")
              .get()
              .then((querySnapshot) => {
                querySnapshot.forEach((doc) => {
                  if (doc.data()["user"] != userid) {
                    activities.add(doc.id);
                  }
                });
              })
              .catch(function(error) {
                console.log("Error getting documents: ", error);
                throw new functions.https.HttpsError("unknown",
                    "Error generating default matches");
              });
          console.log(activities);

          const now = admin.firestore.Timestamp.now();
          await db.collection("users").doc(userid)
              .update({[`lastSearch.${locality}`]: now});
          console.log("after user update");

          if (activities.size == 0) {
            // Get matches that were most recently passed if no activities
            await db.collection("matches")
                .where("status", "==", "PASS")
                .where("user", "==", userid)
                .where("location.locality", "==", locality)
                .orderBy("timestamp", "desc")
                .limit(N)
                .get()
                .then((querySnapshot) => {
                  querySnapshot.forEach((doc) => {
                    activities.add(doc.data()["activity"]);
                  });
                });
            if (activities.size == 0) {
              console.log("No new activities");
              throw new functions.https.HttpsError("resource-exhausted",
                  "No new activities");
            }
          }

          console.log("before batch");
          const batch = db.batch();
          // TODO should this be activity location?
          activities.forEach((doc) => {
            const data = {activity: doc, user: userid, status: "NEW",
              timestamp: now, location: personInfo!.location};
            batch.set(db.collection("matches").doc(doc+"_"+userid), data);
          });
          await batch.commit();
          console.log("after batch");
        }
    );

exports.resetCoins = functions.region("europe-west1")
    .pubsub.schedule("0 10 * * *")
    .timeZone("Europe/Paris")
    .onRun((context) => {
      const db = admin.firestore();
      const coinsFree = 5;
      const coinsSupporter = 10;
      return db.collection("users")
          .get()
          .then((snapshot) => {
            snapshot.forEach((doc) => {
              const coins = (doc.data().supporter == true)?
                  coinsSupporter:coinsFree;
              db.collection("users")
                  .doc(doc.id)
                  .update({"coins": coins});
            });
          })
          .catch(function(error) {
            console.log("Error resetting coins: ", error);
            throw new functions.https.HttpsError("unknown",
                "Error updating coins.");
          });
    });
