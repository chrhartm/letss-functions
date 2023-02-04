import functions = require("firebase-functions");
import admin = require("firebase-admin");
import utils = require("./utils");

exports.pushOnLike = functions.region("europe-west1").firestore
    .document("/activities/{activityId}/likes/{likeId}")
    .onCreate((snap, context) => {
      const db = admin.firestore();
      const like = snap.data();
      // Get data on sender
      return db.collection("persons").doc(snap.id)
          .get().then((senderDoc) => {
            if (senderDoc.exists == false) {
              console.log("Couldn't find person: " + snap.id);
              throw new functions.https.HttpsError("not-found",
                  "Couldn't find person.");
            }
            const senderP = senderDoc.data()!;
            // Get data on activity
            return db.collection("activities").doc(context.params.activityId)
                .get().then((activity) => {
                  if (activity.exists == false) {
                    console.log("Couldn't find activity: " +
                        context.params.activityId);
                    throw new functions.https.HttpsError("not-found",
                        "Couldn't find activity.");
                  }
                  // Get data on receiver
                  return db.collection("users").doc(activity.data()!.user)
                      .get().then((receiverDoc) => {
                        if (receiverDoc.exists == false) {
                          console.log("Couldn't find user: " +
                              activity.data()!.user);
                          throw new functions.https.HttpsError("not-found",
                              "Couldn't find user.");
                        }
                        const receiverU = receiverDoc.data()!;
                        const now = admin.firestore.Timestamp.now().seconds;
                        const limitUnopened = now - 60*60*24*3;
                        const limitOpened = now - 60*60*24;
                        const lastEmail = receiverU.lastEmail==null?null:
                            receiverU.lastEmail.seconds;
                        const lastOnline = receiverU.lastOnline.seconds;
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
                        // Send push notification
                        return admin.messaging()
                            .sendToDevice(receiverU.token.token, payload)
                            .then((response) => {
                              console.log("Successfully sent message:",
                                  response);
                              // Check if email should be sent
                              // Send if not sent before or
                              // last was sent > 3 days ago or
                              // last was sent > 1 day ago and opened app
                              if (lastEmail != null &&
                                (((lastOnline > lastEmail) &&
                                  (lastEmail > limitOpened)) ||
                                 ((lastOnline <= lastEmail) &&
                                  (lastEmail > limitUnopened)))) {
                                console.log("Not sending email (timing)");
                                return null;
                              }
                              // Get user email
                              return admin.auth().getUser(activity.data()!.user)
                                  .then((userRecord) => {
                                    // Send email
                                    return utils.sendEmail(
                                        "d-93478b18f7ee4935b554dea49749663e",
                                        "Letss",
                                        "noreply@letss.app",
                                        userRecord.email!,
                                        17654,
                                        {name: senderP.name as string,
                                          activity:
                                            activity.data()!.name as string,
                                          link: "https://letss.page.link/myactivities",
                                        })
                                        .then((response) => {
                                          console.log(
                                              "Successfully sent email:",
                                              response);
                                          // Update last email timestamp
                                          return db.collection("users")
                                              .doc(activity.data()!.user)
                                              .update({lastEmail:
                                                admin.firestore.Timestamp
                                                    .now()})
                                              .then((response) => {
                                                console.log("Updated user",
                                                    response);
                                              });
                                        });
                                  });
                            });
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
        console.log("Sender didn't change.");
        return null;
      }
      return admin.firestore().collection("users").doc(beforeM.lastMessage.user)
          .get().then((document) => {
            if (document.exists == false) {
              console.log("Couldn't find user: " +
                  beforeM.lastMessage.user);
              throw new functions.https.HttpsError("not-found",
                  "Couldn't find user.");
            }
            const beforeU = document.data()!;
            return admin.firestore().collection("persons")
                .doc(afterM.lastMessage.user)
                .get().then((document) => {
                  if (document.exists == false) {
                    console.log("Couldn't find person: " +
                        afterM.lastMessage.user);
                    throw new functions.https.HttpsError("not-found",
                        "Couldn't find person.");
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

exports.alertOnFlag = functions.region("europe-west1").firestore
    .document("/flags/{flagId}")
    .onCreate((snap, context) => {
      const flag = snap.data();
      // Get data on sender
      return utils.sendEmail(
          "d-789ed3810f334d018085cdc8d0fc959b",
          "Letss",
          "noreply@letss.app",
          "support@letss.app",
          17678,
          {message: flag.message as string,
            flagId: snap.id as string,
          })
          .then((response) => {
            console.log(
                "Successfully sent email:",
                response);
          })
          .catch(function(error) {
            console.log("Error sending email: ", error);
            throw new functions.https.HttpsError("unknown",
                "Error sending email.");
          });
    });
