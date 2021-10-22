import functions = require("firebase-functions");
import admin = require("firebase-admin");

admin.initializeApp();

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
