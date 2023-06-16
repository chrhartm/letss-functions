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
            const senderP = senderDoc.data();
            if (senderP == null) {
              throw new functions.https.HttpsError("not-found",
                  "Couldn't find sender.");
            }
            // Get data on activity
            return db.collection("activities").doc(context.params.activityId)
                .get().then((activity) => {
                  if (activity.exists == false) {
                    console.log("Couldn't find activity: " +
                        context.params.activityId);
                    throw new functions.https.HttpsError("not-found",
                        "Couldn't find activity.");
                  }
                  const activityData = activity.data();
                  if (activityData == null) {
                    throw new functions.https.HttpsError("not-found",
                        "Couldn't find activity");
                  }
                  // Get data on receiver
                  return db.collection("users").doc(activityData.user)
                      .get().then((receiverDoc) => {
                        if (receiverDoc.exists == false) {
                          console.log("Couldn't find user: " +
                              activityData.user);
                          throw new functions.https.HttpsError("not-found",
                              "Couldn't find user.");
                        }
                        const receiverU = receiverDoc.data();
                        if (receiverU == null) {
                          throw new functions.https.HttpsError("not-found",
                              "Couldn't find user.");
                        }
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
                          data: {
                            link: "https://letss.app/myactivity/" +
                              context.params.activityId,
                          },
                        };
                        console.log("Sending message to " +
                            activityData.user +
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
                              return admin.auth().getUser(activityData.user)
                                  .then((userRecord) => {
                                    const userEmail = userRecord.email;
                                    if (userEmail == null) {
                                      throw new functions.https.HttpsError(
                                          "not-found",
                                          "Couldn't find user email.");
                                    }
                                    // Send email
                                    return utils.sendEmail(
                                        "d-93478b18f7ee4935b554dea49749663e",
                                        "Letss",
                                        "noreply@letss.app",
                                        userEmail,
                                        17654,
                                        {name: senderP.name as string,
                                          activity:
                                            activityData.name as string,
                                          link: "https://letss.page.link/myactivities",
                                        })
                                        .then((response) => {
                                          console.log(
                                              "Successfully sent email:",
                                              response);
                                          // Update last email timestamp
                                          return db.collection("users")
                                              .doc(activityData.user)
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
    .onUpdate(async (change, ) => {
      const beforeM = change.before.data();
      const afterM = change.after.data();

      // If a user moved to usersLeft, then update activity
      const activityUid = beforeM.activityData.uid;
      if (beforeM.usersLeft.length != afterM.usersLeft.length &&
        activityUid != null) {
        console.log("before first await");
        await admin.firestore().collection("activities")
            .doc(activityUid)
            .get().then((document) => {
              if (document.exists == false) {
                console.log("Couldn't find activity: " + activityUid);
                return;
              }
              const beforeA = document.data();
              if (beforeA == null) {
                console.log("Couldn't find activity II: " + activityUid);
                return;
              }
              if (afterM.users != null && afterM.usersLeft != null) {
                console.log("updating participants");
                const participants = afterM.users;
                const myIndex = participants.indexOf(
                    beforeM.activityData.user, 0);
                console.log("Index: " + myIndex);
                if (myIndex > -1) {
                  participants.splice(myIndex, 1);
                }
                console.log(participants);
                return admin.firestore().collection("activities")
                    .doc(activityUid)
                    .update({"participants": participants,
                      "participantsLeft": afterM.usersLeft})
                    .catch(() => console.log("couldn't update activity"));
              } else {
                console.log("Null users");
                return;
              }
            }).catch(() => console.log("Error in updating activity"));
      } else {
        console.log("in else");
        console.log(beforeM.usersLeft);
        console.log(afterM.usersLeft);
        console.log(activityUid);
      }

      // Make sure sender changed
      if (beforeM.lastMessage.user == afterM.lastMessage.user) {
        console.log("Sender didn't change.");
        return null;
      }

      await admin.firestore()
          .collection("users")
          .doc(beforeM.lastMessage.user)
          .get().then((document) => {
            if (document.exists == false) {
              console.log("Couldn't find user: " +
                  beforeM.lastMessage.user);
              throw new functions.https.HttpsError("not-found",
                  "Couldn't find user.");
            }
            const beforeU = document.data();
            if (beforeU == null) {
              throw new functions.https.HttpsError("not-found",
                  "Couldn't find user.");
            }
            return admin.firestore().collection("persons")
                .doc(afterM.lastMessage.user)
                .get().then((document) => {
                  if (document.exists == false) {
                    console.log("Couldn't find person: " +
                        afterM.lastMessage.user);
                    throw new functions.https.HttpsError("not-found",
                        "Couldn't find person.");
                  }
                  const afterP = document.data();
                  if (afterP == null) {
                    throw new functions.https.HttpsError("not-found",
                        "Couldn't find person.");
                  }
                  const payload = {
                    notification: {
                      title: afterP.name,
                      body: afterM.lastMessage.message,
                      type: "message",
                    },
                    data: {
                      link: "https://letss.app/chat/" + change.after.id,
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
      return;
    });

exports.pushOnNewActivity = functions.region("europe-west1").firestore
    .document("/activities/{activityId}")
    .onCreate((snap, ) => {
      const activityData = snap.data();
      // Get data on sender
      return admin.firestore().collection("persons").doc(activityData.user)
          .get().then((document) => {
            if (document.exists == false) {
              console.log("Couldn't find person: " +
              activityData.user);
              throw new functions.https.HttpsError("not-found",
                  "Couldn't find person.");
            }
            const senderP = document.data();
            if (senderP == null) {
              throw new functions.https.HttpsError("not-found",
                  "Couldn't find person.");
            }
            // Send update to all followers of sender
            return admin.firestore().collection("followers")
                .doc(activityData.user).collection("followers")
                .get().then((querySnapshot) => {
                  const promises: any[] = [];
                  querySnapshot.forEach((document) => {
                    const follower = document.id;
                    // Get data on receiver
                    promises.push(admin.firestore().collection("users")
                        .doc(follower).get().then((doc) => {
                          if (doc.exists == false) {
                            console.log("Couldn't find user: " +
                          follower);
                            throw new functions.https.HttpsError("not-found",
                                "Couldn't find user.");
                          }
                          const receiverU = doc.data();
                          if (receiverU == null) {
                            throw new functions.https.HttpsError("not-found",
                                "Couldn't find user.");
                          }
                          // Send message
                          const payload = {
                            notification: {
                              title: senderP.name + " posted a new idea",
                              body: activityData.name,
                              type: "message",
                            },
                            data: {
                              link: "https://letss.app/activity/" + snap.id,
                            },
                          };
                          console.log("Sending activity to " +
                        follower +
                        ": " + payload);

                          return admin.messaging()
                              .sendToDevice(receiverU.token.token, payload)
                              .then((response) => console.log(response));
                        }));
                  });
                  return Promise.all(promises);
                });
          });
    });

exports.pushOnFollower = functions.region("europe-west1").firestore
    .document("/followers/{personId}/followers/{followerId}")
    .onCreate((snap, context) => {
      const follower = snap.id;
      const personId = context.params.personId;
      // Get name of follower
      return admin.firestore().collection("persons").doc(follower)
          .get().then((document) => {
            if (document.exists == false) {
              console.log("Couldn't find person: " +
              follower);
              throw new functions.https.HttpsError("not-found",
                  "Couldn't find person.");
            }
            const followerP = document.data();
            if (followerP == null) {
              throw new functions.https.HttpsError("not-found",
                  "Couldn't find person.");
            }

            // Send message to person that they have a new follower
            return admin.firestore().collection("users")
                .doc(personId).get().then((doc) => {
                  if (doc.exists == false) {
                    console.log("Couldn't find user: " +
                  personId);
                    throw new functions.https.HttpsError("not-found",
                        "Couldn't find user.");
                  }
                  const personU = doc.data();
                  if (personU == null) {
                    throw new functions.https.HttpsError("not-found",
                        "Couldn't find user.");
                  }
                  // Send message
                  const payload = {
                    notification: {
                      title: followerP.name + " started following you",
                      body: "Follow them to get notified" +
                        " when they plan something",
                      type: "message",
                    },
                    data: {
                      link: "https://letss.app/profile/person/" + follower,
                    },
                  };
                  console.log("Sending follower to " +
                personId);
                  return admin.messaging()
                      .sendToDevice(personU.token.token, payload)
                      .then((response) => console.log(response));
                });
          });
    });


exports.alertOnFlag = functions.region("europe-west1").firestore
    .document("/flags/{flagId}")
    .onCreate((snap, ) => {
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
