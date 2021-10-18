import functions = require("firebase-functions");
import admin = require("firebase-admin");

admin.initializeApp();

exports.generateMatches = functions.https.onCall(
    async (data, context) => {
      const N = 30;
      const userid = (context.auth && context.auth.uid)!;
      const db = admin.firestore();

      console.log("userid: " + userid);

      // TODO select only relevant fields (not pic)
      const userinfo = (await db.collection("users")
          .doc(userid).get()).data();
      if (userinfo == null) {
        return {code: 500, message: "Couldn't find user id"};
      }
      const lastSearch = userinfo!.lastSearch;
      if ((admin.firestore.Timestamp.now().toMillis() -
          lastSearch.toMillis()) < (1000 * 60 * 60)) {
        return {code: 429, message: "Already requested within last hour"};
      }
      const activities = new Set();
      for (const category of userinfo!.interests) {
        // TODO filter by location
        await db.collection("activities")
            .where("status", "==", "ACTIVE")
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
              return {code: 500, message: "Unknown error"};
            });
      }
      // add some without interest filter
      // in case interests are too specific
      await db.collection("activities")
          .where("status", "==", "ACTIVE")
          .where("timestamp", ">", lastSearch)
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
            return {code: 500, message: "Unknown error"};
          });
      console.log(activities);

      const now = admin.firestore.Timestamp.now();
      db.collection("users").doc(userid)
          .update({lastSearch: now});
      console.log("after user update");

      if (activities.size == 0) {
        return {code: 204, message: "No new activities available"};
      }

      console.log("before batch");
      const batch = db.batch();
      activities.forEach((doc) => {
        const data = {activity: doc, user: userid, status: "NEW",
          timestamp: now};
        batch.set(db.collection("matches").doc(doc+"_"+userid), data);
      });
      batch.commit();
      console.log("after batch");

      return {code: 200, message: "Generated new matches"};
    }
);

exports.deleteUser = functions.https.onCall(
    async (data, context) => {
      const userid = (context.auth && context.auth.uid)!;

      console.log("Deleting userid: " + userid);
      console.warn("Delete function not yet implemented");

      return {code: 501, message: "Not implemented"};
    }
);

exports.pushOnLike = functions.firestore
    .document("/activities/{activityId}/likes/{likeId}")
    .onCreate((snap, context) => {
      const db = admin.firestore();
      const like = snap.data();
      db.collection("users").doc(snap.id)
          .get().then((senderDoc) => {
            if (senderDoc.exists == false) {
              console.log("Couldn't find user: " + snap.id);
              return;
            }
            const sender = senderDoc.data()!;
            db.collection("activities").doc(context.params.activityId)
                .get().then((activity) => {
                  if (activity.exists == false) {
                    console.log("Couldn't find activity: " +
                        context.params.activityId);
                    return;
                  }
                  db.collection("users").doc(activity.data()!.user)
                      .get().then((receiverDoc) => {
                        if (receiverDoc.exists == false) {
                          console.log("Couldn't find user: " +
                              activity.data()!.user);
                          return;
                        }
                        const receiver = receiverDoc.data()!;
                        const payload = {
                          notification: {
                            title: sender.name,
                            body: like.message,
                          },
                        };
                        console.log("Sending message to " + receiver.name +
                            ": " + payload);
                        admin.messaging()
                            .sendToDevice(receiver.token.token, payload)
                            .then((response) => console.log(response.results));
                      });
                });
          });
    });

exports.pushOnMessage = functions.firestore
    .document("/chats/{chatId}")
    .onUpdate((change, _) => {
      const beforeM = change.before.data();
      const afterM = change.after.data();
      // Make sure sender changed
      if (beforeM.lastMessage.user == afterM.lastMessage.user) {
        return;
      }
      admin.firestore().collection("users").doc(beforeM.lastMessage.user)
          .get().then((document) => {
            if (document.exists == false) {
              console.log("Couldn't find user: " +
                  beforeM.lastMessage.user);
              return;
            }
            const beforeU = document.data()!;
            admin.firestore().collection("users").doc(afterM.lastMessage.user)
                .get().then((document) => {
                  if (document.exists == false) {
                    console.log("Couldn't find user: " +
                        afterM.lastMessage.user);
                    return;
                  }
                  const afterU = document.data()!;
                  const payload = {
                    notification: {
                      title: afterU.name,
                      body: afterM.lastMessage.message,
                    },
                  };
                  console.log("Sending message to " + afterU.name +
                      ": " + payload);
                  admin.messaging()
                      .sendToDevice(beforeU.token.token, payload)
                      .then((response) => console.log(response));
                });
          });
    });
