import functions = require("firebase-functions");
import admin = require("firebase-admin");
import utils = require("./utils");

// Push a notification every Friday with a preselected activity
exports.pushScheduled = functions.region("europe-west1").pubsub
    .schedule("0 12 * * 5")
    .timeZone("Europe/Berlin")
    .onRun(() => {
      const db = admin.firestore();
      // Get notification data from database
      return db.collection("scheduled-notifications")
          .where("status", "==", "scheduled")
          .where("timestamp", "<=",
              admin.firestore.Timestamp.now())
          .get()
          .then((querySnapshot) => {
            const promises: Promise<void>[] = [];
            querySnapshot.forEach((document) => {
              const notification = document.data();
              console.log("User: " + notification.user);
              // Get user data
              promises.push(db.collection("users").doc(notification.user)
                  .get().then((userDoc) => {
                    if (userDoc.exists == false) {
                      console.log("Couldn't find user: " + notification.user);
                      return;
                    }
                    const user = userDoc.data();
                    if (user == null) {
                      console.log("Couldn't find user II: " +
                      notification.user);
                      return;
                    }
                    // Get template data
                    return db.collection("templates")
                        .doc(notification.template)
                        .get().then((templateDoc) => {
                          if (templateDoc.exists == false) {
                            console.log("Couldn't find template: " +
                            notification.template);
                            return;
                          }
                          const template = templateDoc.data();
                          if (template == null) {
                            console.log("Couldn't find template II: " +
                             notification.template);
                            return;
                          }
                          // Send push notificaiton
                          // title and body localization
                          let body = template.name;
                          let title =
                          "TGIF! Here's an idea for your weekend";
                          if (template.language == "de") {
                            body = template.title;
                            title =
                            "Endlich Freitag! Unsere Idee " +
                            "für dein Wochenende";
                          }
                          const message = {
                            notification: {
                              title: title,
                              body: body,
                            },
                            data: {
                              link: "https://letss.app/myactivity/from-template/" +
                              notification.template,
                            },
                            token: user.token.token,
                            apns: {
                              payload: {
                                aps: {
                                  "content-available": 1,
                                },
                              },
                            },
                          };
                          console.log("Sending message to " +
                          notification.user + ": " + message);
                          return admin.messaging()
                              .send(message)
                              .then((response) => {
                                console.log("Successfully sent message:",
                                    response);
                                // Update notification status
                                return db.collection("scheduled-notifications")
                                    .doc(document.id)
                                    .update({status: "sent"})
                                    .then((response) => {
                                      console.log("Updated notification",
                                          response);
                                    });
                              });
                        }
                        );
                  }
                  ));
            });
            return Promise.all(promises);
          });
    });

exports.pushOnLike = functions.region("europe-west1").firestore
    .document("/activities/{activityId}/likes/{likeId}")
    .onCreate((snap, context) => {
      const db = admin.firestore();
      console.log("ActivityId: " + context.params.activityId);
      console.log("LikeId: " + context.params.likeId);
      console.log("PersonId: " + snap.id);
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
                  console.log("Activity user: " + activityData.user);
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
                        /*
                        const now = admin.firestore.Timestamp.now().seconds;
                        const limitUnopened = now - 60*60*24*3;
                        const limitOpened = now - 60*60*24;
                        const lastEmail = receiverU.lastEmail==null?null:
                            receiverU.lastEmail.seconds;
                        const lastOnline = receiverU.lastOnline.seconds;
                        */
                        let bodyString = " wants to join";
                        if ("locale" in receiverU &&
                        receiverU.locale == "de") {
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
                            ": " + message.notification.body);
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
                              // ## Don't do this because it just feels
                              // unreliable if emails only come sometimes
                              /*
                              if (lastEmail != null &&
                                (((lastOnline > lastEmail) &&
                                  (lastEmail > limitOpened)) ||
                                 ((lastOnline <= lastEmail) &&
                                  (lastEmail > limitUnopened)))) {
                                console.log("Not sending email (timing)");
                                return null;
                              }
                              */
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
                                    if ("locale" in receiverU &&
                                      receiverU.locale == "de") {
                                      template =
                                      "d-b1264e8f012045d69eb72ee50400d01c";
                                    }
                                    console.log("Sending email");
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

      console.log("ChatId: " + context.params.chatId);
      console.log("Before message: " + beforeC.lastMessage.message);
      console.log("After message: " + afterC.lastMessage.message);

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
      if ((beforeC.lastMessage.timestamp == afterC.lastMessage.timestamp) &&
        (beforeC.lastMessage.message == afterC.lastMessage.message)) {
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
                      console.log("Got " + user);
                      return userData;
                    }));
              }
            }
            return Promise.all(receiverPromises).then((receivers) => {
              const sendPromises = [];
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
                  console.log("Sending message: " +
                    message.notification.title,
                  " -  " + message.notification.body);
                  console.log("Using token: " +
                    receiver.token.token);
                  sendPromises.push(
                      admin.messaging()
                          .send(message)
                          .then((response) => console.log(response))
                  );
                }
              }
              return Promise.all(sendPromises);
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
      let minMessages = 30;
      const minMessagesVirtual = 10;
      const maxMessages = 100;

      console.log("ActivityId: " + snap.id);
      console.log("Activity user: " + activityData.user);
      // TODO refactor bigtime
      if (activityData.location.country != null &&
          activityData.location.country == "Virtual") {
        minMessages = minMessagesVirtual;
        let minDate = new Date();
        minDate.setFullYear(2000);
        if (activityData.location.locality == "EAG London") {
          minDate = new Date("2024-05-31");
        } else if (activityData.location.locality == "EAGx Utrecht") {
          minDate = new Date("2024-07-05");
        }
        // Return if today's date smaller than minDate
        if (new Date() < minDate) {
          return;
        }
      }
      notifiedUsers.push(activityData.user); // Don't notify sender
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
            const followerPromise = admin.firestore().collection("followers")
                .doc(activityData.user).collection("followers")
                .limit(maxMessages)
                .get().then((querySnapshot) => {
                  const promises: Promise<void>[] = [];
                  querySnapshot.forEach((document) => {
                    const follower = document.id;
                    notifiedUsers.push(follower);
                    // check if receiver user has same location as activity
                    console.log("Follower: " + follower);
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
                                  if (receiverU.token == null) {
                                    console.log("No token for " + follower);
                                    return;
                                  }
                                  // Send message
                                  let titleString = " posted a new idea";
                                  if ("locale" in receiverU &&
                                  receiverU.locale == "de") {
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
                                }).catch((err) => {
                                  console.log("Error in sending message:");
                                  console.log(err);
                                });
                          } else {
                            // Ignore followers with different location
                            return;
                          }
                        }));
                  });
                  return Promise.all(promises);
                });
            // Send update to all users interested in activity
            // Start by getting all users with same location as
            // activity that have this interest
            console.log("## Message all with shared interests");
            console.log("Interests: " + activityData.categories);
            let locationPromise = Promise.resolve() as Promise<void | void[]>;
            if (activityData.categories.length > 0) {
              locationPromise = admin.firestore().collection("persons")
                  .where("location.locality", "==",
                      activityData.location.locality)
                  .where("interests", "array-contains-any",
                    activityData.categories as string[])
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
                      console.log("InterestUser: " + user);
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
                            if (receiverU.token == null) {
                              console.log("No token for " + user);
                              return;
                            }
                            // Send message
                            let bodyString =
                          " posted an idea that matches your interests";
                            if ("locale" in receiverU &&
                              receiverU.locale == "de") {
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
                  });
            }
            /* If sent to less than 10 users,
            send to random users that have the same location
            as the activity
            */
            let newpersonPromise = Promise.resolve() as Promise<void | void[]>;
            if (notifiedUsers.length < minMessages) {
              newpersonPromise = admin.firestore().collection("persons")
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
                      console.log("RandomUser: " + user);
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
                            let bodyString = " posted a new idea. " +
                            "Check it out!";
                            if ("locale" in receiverU &&
                            receiverU.locale == "de") {
                              bodyString = " hat eine neue Idee. " +
                              "Mach mit!";
                            }
                            // if no token, return
                            if (receiverU.token == null) {
                              console.log("No token for " + user);
                              return;
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
                  });
            }
            console.log("## Message all followers");
            return followerPromise.then(() => {
              console.log("## Message all with shared interests");
              return locationPromise.then(() => {
                console.log("## Message random users");
                return newpersonPromise;
              });
            });
          });
    });

exports.pushOnFollower = functions.region("europe-west1").firestore
    .document("/followers/{personId}/followers/{followerId}")
    .onCreate((snap, context) => {
      const follower = snap.id;
      const personId = context.params.personId;
      const trigger = snap.data()["trigger"];
      console.log("PersonId: " + personId);
      console.log("FollowerId: " + follower);
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
                  if ("locale" in personU &&
                  personU.locale == "de") {
                    titleString = " folgt dir jetzt";
                  }
                  let bodyString = "Follow them to get notified" +
                  " when they plan something";
                  if ("locale" in personU &&
                  personU.locale == "de") {
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
      console.log("FlagId: " + snap.id);
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
