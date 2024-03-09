import functions = require("firebase-functions");
import admin = require("firebase-admin");
import utils = require("./utils");

exports.pushOnLike = functions.region("europe-west1").firestore
    .document("/activities/{activityId}/likes/{likeId}")
    .onCreate((snap, context) => {
      const db = admin.firestore();
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
                        let bodyString = " wants to join";
                        if (receiverU.locale == "de") {
                          bodyString = " möchte mitmachen";
                        }
                        const message = {
                          notification: {
                            title: activityData.name,
                            body: senderP.name + bodyString,
                          },
                          data: {
                            link: "https://letss.app/myactivity/" +
                              context.params.activityId,
                          },
                          token: receiverU.token.token,
                          apns: {
                            payload: {
                              aps: {
                                "content-available": 1,
                              },
                            },
                          },
                        };
                        console.log("Sending message to " +
                            activityData.user +
                            ": " + message);
                        // Send push notification
                        return admin.messaging()
                            .send(message)
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
                                    let template =
                                      "d-93478b18f7ee4935b554dea49749663e";
                                    if (receiverU.locale == "de") {
                                      template =
                                      "d-b1264e8f012045d69eb72ee50400d01c";
                                    }
                                    // Send email
                                    return utils.sendEmail(
                                        template,
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
    .onUpdate(async (change, context) => {
      const beforeC = change.before.data();
      const afterC = change.after.data();

      // If a user moved to usersLeft, then update activity
      if (beforeC.activityData != null) {
        const activityUid = beforeC.activityData.uid;
        if (beforeC.usersLeft.length != afterC.usersLeft.length &&
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
                if (afterC.users != null && afterC.usersLeft != null) {
                  console.log("updating participants");
                  const participants = afterC.users;
                  const myIndex = participants.indexOf(
                      beforeC.activityData.user, 0);
                  console.log("Index: " + myIndex);
                  if (myIndex > -1) {
                    participants.splice(myIndex, 1);
                  }
                  console.log(participants);
                  return admin.firestore().collection("activities")
                      .doc(activityUid)
                      .update({"participants": participants,
                        "participantsLeft": afterC.usersLeft})
                      .catch(() => console.log("couldn't update activity"));
                } else {
                  console.log("Null users");
                  return;
                }
              }).catch(() => console.log("Error in updating activity"));
        } else {
          console.log("in else");
          console.log(beforeC.usersLeft);
          console.log(afterC.usersLeft);
          console.log(activityUid);
        }
      }

      // Make sure new message before sending notifications
      if (beforeC.lastMessage.timestamp == afterC.lastMessage.timestamp) {
        console.log("Message didn't change.");
        return null;
      }

      await admin.firestore().collection("persons")
          .doc(afterC.lastMessage.user)
          .get().then((document) => {
            if (document.exists == false) {
              console.log("Couldn't find person: " +
                afterC.lastMessage.user);
              throw new functions.https.HttpsError("not-found",
                  "Couldn't find person.");
            }
            const senderP = document.data();
            if (senderP == null) {
              throw new functions.https.HttpsError("not-found",
                  "Couldn't find person.");
            }
            // look through all users in chat and send message
            // to all except sender
            const receiverPromises = [];
            for (const user of afterC.users) {
              if (user != afterC.lastMessage.user) {
                receiverPromises.push(admin.firestore().collection("users")
                    .doc(user)
                    .get().then((document) => {
                      if (document.exists == false) {
                        console.log("Couldn't find user: " + user);
                        return;
                      }
                      const userData = document.data();
                      if (userData == null) {
                        console.log("Couldn't find user II: " + user);
                        return;
                      }
                      return userData;
                    }));
              }
            }
            return Promise.all(receiverPromises).then((receivers) => {
              for (const receiver of receivers) {
                if (receiver != null && receiver.token != null) {
                  const message = {
                    notification: {
                      title: senderP.name,
                      body: afterC.lastMessage.message,
                    },
                    data: {
                      link: "https://letss.app/chat/" +
                      context.params.chatId,
                    },
                    token: receiver.token.token,
                    apns: {
                      payload: {
                        aps: {
                          "content-available": 1,
                        },
                      },
                    },
                  };
                  console.log("Sending message to " +
                    receiver.name +
                    ": " + message);
                  return admin.messaging()
                      .send(message)
                      .then((response) => console.log(response));
                }
              }
              return;
            }
            );
          });
      return;
    });

exports.pushOnNewActivity = functions.region("europe-west1").firestore
    .document("/activities/{activityId}")
    .onCreate((snap, ) => {
      const activityData = snap.data();
      const notifiedUsers: string[] = [];
      const minMessages = 10;
      const maxMessages = 100;
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
            const messagePromises: Promise<void | void[]>[] = [];
            // Send update to all followers of sender
            messagePromises.push(admin.firestore().collection("followers")
                .doc(activityData.user).collection("followers")
                .limit(maxMessages)
                .get().then((querySnapshot) => {
                  const promises: Promise<void>[] = [];
                  querySnapshot.forEach((document) => {
                    const follower = document.id;
                    notifiedUsers.push(follower);
                    // check if receiver user has same location as activity
                    promises.push(admin.firestore().collection("persons")
                        .doc(follower).get().then((doc) => {
                          if (doc.exists == false) {
                            console.log("Couldn't find person: " +
                          follower);
                            throw new functions.https.HttpsError("not-found",
                                "Couldn't find person.");
                          }
                          const receiverP = doc.data();
                          if (receiverP == null) {
                            throw new functions.https.HttpsError("not-found",
                                "Couldn't find person.");
                          }
                          if (receiverP.location.locality ==
                            activityData.location.locality) {
                            // Get data on receiver
                            return admin.firestore().collection("users")
                                .doc(follower).get().then((doc) => {
                                  if (doc.exists == false) {
                                    console.log("Couldn't find user: " +
                            follower);
                                    throw new functions.https.HttpsError(
                                        "not-found", "Couldn't find user.");
                                  }
                                  const receiverU = doc.data();
                                  if (receiverU == null) {
                                    throw new functions.https.HttpsError(
                                        "not-found", "Couldn't find user.");
                                  }
                                  // Send message
                                  let titleString = " posted a new idea";
                                  if (receiverU.locale == "de") {
                                    titleString =
                                    " hat eine neue Idee gepostet";
                                  }
                                  const message = {
                                    notification: {
                                      title: senderP.name + titleString,
                                      body: activityData.name,
                                    },
                                    data: {
                                      link: "https://letss.app/activity/" +
                                      snap.id,
                                    },
                                    token: receiverU.token.token,
                                    apns: {
                                      payload: {
                                        aps: {
                                          "content-available": 1,
                                        },
                                      },
                                    },
                                  };
                                  console.log("Sending activity to " +
                          follower +
                          ": " + message);

                                  return admin.messaging()
                                      .send(message)
                                      .then((response) =>
                                        console.log(response));
                                });
                          } else {
                            // Ignore users with different location
                            return;
                          }
                        }));
                  });
                  return Promise.all(promises);
                }));
            // Send update to all users interested in activity
            // Start by getting all users with same location as
            // activity that have this interest
            messagePromises.push(admin.firestore().collection("persons")
                .where("location.locality", "==",
                    activityData.location.locality)
                .where("interests", "array-contains-any",
                    activityData.categories)
                .limit(maxMessages - notifiedUsers.length)
                .get().then((querySnapshot) => {
                  const promises: Promise<void>[] = [];
                  querySnapshot.forEach((document) => {
                    const user = document.id;
                    // Ignore users already notified
                    if (notifiedUsers.includes(user)) {
                      return;
                    }
                    notifiedUsers.push(user);
                    // Get data on receiver
                    promises.push(admin.firestore().collection("users")
                        .doc(user).get().then((doc) => {
                          if (doc.exists == false) {
                            console.log("Couldn't find user: " +
                        user);
                            throw new functions.https.HttpsError("not-found",
                                "Couldn't find user.");
                          }
                          const receiverU = doc.data();
                          if (receiverU == null) {
                            throw new functions.https.HttpsError("not-found",
                                "Couldn't find user.");
                          }
                          // Send message
                          let bodyString =
                          " posted an idea that matches your interests";
                          if (receiverU.locale == "de") {
                            bodyString = "'s Idee passt zu deinen Interessen";
                          }
                          const message = {
                            notification: {
                              title: activityData.name,
                              body: senderP.name + bodyString,
                            },
                            data: {
                              link: "https://letss.app/activity/" + snap.id,
                            },
                            token: receiverU.token.token,
                            apns: {
                              payload: {
                                aps: {
                                  "content-available": 1,
                                },
                              },
                            },
                          };
                          console.log("Sending activity to " +
                      user +
                      ": " + message);

                          return admin.messaging()
                              .send(message)
                              .then((response) => console.log(response));
                        }));
                  });
                  return Promise.all(promises);
                }));

            /* If sent to less than 10 users,
            send to random users that have the same location
            as the activity
            */
            if (notifiedUsers.length < minMessages) {
              messagePromises.push(admin.firestore().collection("persons")
                  .where("location.locality", "==",
                      activityData.location.locality)
                  .limit(minMessages)
                  .get().then((querySnapshot) => {
                    const promises: Promise<void>[] = [];
                    querySnapshot.forEach((document) => {
                      const user = document.id;
                      // Ignore followers
                      if (notifiedUsers.includes(user)) {
                        return;
                      }
                      // Get data on receiver
                      promises.push(admin.firestore().collection("users")
                          .doc(user).get().then((doc) => {
                            if (doc.exists == false) {
                              console.log("Couldn't find user: " +
                          user);
                              throw new functions.https.HttpsError("not-found",
                                  "Couldn't find user.");
                            }
                            const receiverU = doc.data();
                            if (receiverU == null) {
                              throw new functions.https.HttpsError("not-found",
                                  "Couldn't find user.");
                            }
                            // Send message
                            let bodyString = " is new to Letss. " +
                            "Check out their idea and follow them!";
                            if (receiverU.locale == "de") {
                              bodyString = " ist neu bei Letss. " +
                              "Mache bei der ersten Idee mit!";
                            }
                            const message = {
                              notification: {
                                title: activityData.name,
                                body: senderP.name + bodyString,
                              },
                              data: {
                                link: "https://letss.app/activity/" + snap.id,
                              },
                              token: receiverU.token.token,
                              apns: {
                                payload: {
                                  aps: {
                                    "content-available": 1,
                                  },
                                },
                              },
                            };
                            console.log("Sending activity to " +
                        user +
                        ": " + message);

                            return admin.messaging()
                                .send(message)
                                .then((response) => console.log(response));
                          }));
                    });
                    return Promise.all(promises);
                  }));
            }
            return Promise.all(messagePromises);
          });
    });

exports.pushOnFollower = functions.region("europe-west1").firestore
    .document("/followers/{personId}/followers/{followerId}")
    .onCreate((snap, context) => {
      const follower = snap.id;
      const personId = context.params.personId;
      const trigger = snap.data()["trigger"];
      if (trigger != null) {
        console.log("Trigger: " + trigger);
        if (trigger != "FOLLOW") {
          return;
        }
      }
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
                  let titleString = " started following you";
                  if (personU.locale == "de") {
                    titleString = " folgt dir jetzt";
                  }
                  let bodyString = "Follow them to get notified" +
                  " when they plan something";
                  if (personU.locale == "de") {
                    bodyString = "Folge zurück, um bei neuen Ideen" +
                    " benachrichtigt zu werden";
                  }
                  const message = {
                    notification: {
                      title: followerP.name + titleString,
                      body: bodyString,
                    },
                    data: {
                      link: "https://letss.app/profile/person/" + follower,
                    },
                    token: personU.token.token,
                    apns: {
                      payload: {
                        aps: {
                          "content-available": 1,
                        },
                      },
                    },
                  };
                  console.log("Sending follower to " +
                personId);
                  return admin.messaging()
                      .send(message)
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
