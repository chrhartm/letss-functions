import functions = require("firebase-functions");
import admin = require("firebase-admin");

exports.pushOnLike = functions.region("europe-west1").firestore
    .document("/activities/{activityId}/likes/{likeId}")
    .onCreate((snap, context) => {
      const db = admin.firestore();
      const like = snap.data();
      return db.collection("persons").doc(snap.id)
          .get().then((senderDoc) => {
            if (senderDoc.exists == false) {
              console.log("Couldn't find user: " + snap.id);
              return null;
            }
            const senderP = senderDoc.data()!;
            return db.collection("activities").doc(context.params.activityId)
                .get().then((activity) => {
                  if (activity.exists == false) {
                    console.log("Couldn't find activity: " +
                        context.params.activityId);
                    return null;
                  }
                  return db.collection("users").doc(activity.data()!.user)
                      .get().then((receiverDoc) => {
                        if (receiverDoc.exists == false) {
                          console.log("Couldn't find user: " +
                              activity.data()!.user);
                          return null;
                        }
                        const receiverU = receiverDoc.data()!;
                        const payload = {
                          notification: {
                            title: senderP.name,
                            body: like.message,
                            type: "like",
                          },
                        };
                        console.log("Sending message to " +
                            activity.data()!.user +
                            ": " + payload);
                        return admin.messaging()
                            .sendToDevice(receiverU.token.token, payload)
                            .then((response) => console.log(response.results));
                      });
                });
          });
    });

exports.pushOnMessage = functions.region("europe-west1").firestore
    .document("/chats/{chatId}")
    .onUpdate((change, _) => {
      const beforeM = change.before.data();
      const afterM = change.after.data();
      // Make sure sender changed
      if (beforeM.lastMessage.user == afterM.lastMessage.user) {
        return null;
      }
      return admin.firestore().collection("users").doc(beforeM.lastMessage.user)
          .get().then((document) => {
            if (document.exists == false) {
              console.log("Couldn't find user: " +
                  beforeM.lastMessage.user);
              return null;
            }
            const beforeU = document.data()!;
            return admin.firestore().collection("persons")
                .doc(afterM.lastMessage.user)
                .get().then((document) => {
                  if (document.exists == false) {
                    console.log("Couldn't find person: " +
                        afterM.lastMessage.user);
                    return null;
                  }
                  const afterP = document.data()!;
                  const payload = {
                    notification: {
                      title: afterP.name,
                      body: afterM.lastMessage.message,
                      type: "message",
                    },
                  };
                  console.log("Sending message to " +
                      beforeM.lastMessage.user +
                      ": " + payload);
                  return admin.messaging()
                      .sendToDevice(beforeU.token.token, payload)
                      .then((response) => console.log(response));
                });
          });
    });

