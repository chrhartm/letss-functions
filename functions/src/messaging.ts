import {HttpsError}
  from "firebase-functions/v2/https";
import {onDocumentCreated, onDocumentUpdated}
  from "firebase-functions/v2/firestore";
import {firestore, auth, messaging} from "firebase-admin";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as utils from "./utils";

// Send an email every Wednesday with activities they missed
exports.emailMissed = onSchedule({
  schedule: "0 10 * * 3",
  secrets: ["SENDGRID_KEY"]
}, () => {
      const db = firestore();
      // First get all users who haven't been online in last week
      // Then for the localities "Berlin", "London", and "Amsterdam"
      // Get the five most recent activities since last week
      // If there have been activities, get IDs of all persons in that locality
      // Then intersect with the users who haven't been online
      // Then send an email with the activities for their locality
      const now = firestore.Timestamp.now().seconds;
      const limit = now - 60*60*24*7;
      const localities = ["Berlin", "London", "Amsterdam"];
      // First get list of all user IDs who haven't been online
      const userIds: string[] = [];
      // Use map instead of array
      const userLanguage:{[key: string]: string} = {};
      const templateEN = "d-014f94e5aa594abd8991e09026a7c425";
      const templateDE = "d-5ed6163adc41487ca613f2889276fe56";

      return db.collection("users")
          .where("lastOnline", "<", firestore.Timestamp.fromMillis(
              limit*1000))
          .get().then((querySnapshot) => {
            querySnapshot.forEach((document) => {
              userIds.push(document.id);
              const locale = document.data().locale;
              if (locale != null && locale == "de") {
                userLanguage[document.id] = locale;
              } else {
                userLanguage[document.id] = "en";
              }
            });
            if (querySnapshot.size > 0) {
              console.log("Found " + userIds.length + " users." +
                "First is " + userIds[0]);
            }
          }).then(() => {
            // Then get the five most recent activities for each locality
            const activityPromises = [];
            for (const locality of localities) {
              console.log("Locality: " + locality);
              const activities: string[] = [];
              const personIDs: string[] = [];
              activityPromises.push(db.collection("activities")
                  .where("location.locality", "==", locality)
                  .where("timestamp", ">", firestore.Timestamp.fromMillis(
                      limit*1000))
                  .where("status", "==", "ACTIVE")
                  .orderBy("timestamp", "desc")
                  .limit(5)
                  .get()
                  .then((querySnapshot) => {
                    // get activity data
                    querySnapshot.forEach((document) => {
                      const activity = document.data();
                      activities.push("• " + activity.name);
                      personIDs.push(activity.user);
                    });

                    // Check if there are activities
                    if (activities.length == 0) {
                      console.log("No activities for " + locality);
                      return;
                    }

                    console.log("Activities (" + locality + "): " +
                      activities.map((a) => a).join("\n"));

                    // Get names for all persons of each activity
                    return db.collection("persons")
                        .where(firestore.FieldPath.documentId(), "in",
                            personIDs)
                        .get().then((querySnapshot) => {
                          const activityPersons: string[] = [];
                          const docIDs: string[] = [];
                          querySnapshot.forEach((document) => {
                            const person = document.data();
                            docIDs.push(document.id);
                            activityPersons.push(person.name);
                          });
                          // put activityPersons in the right order
                          const orderedPersons: string[] = [];
                          for (const id of personIDs) {
                            const index = docIDs.indexOf(id);
                            if (index > -1) {
                              orderedPersons.push(activityPersons[index]);
                            }
                          }
                          console.log("Persons: " + orderedPersons.join(", "));

                          // Get all persons in locality
                          const persons: string[] = [];
                          return db.collection("persons")
                              .where("location.locality", "==", locality)
                              .get().then((querySnapshot) => {
                                querySnapshot.forEach((document) => {
                                  persons.push(document.id);
                                });
                                // Intersect with users who haven't been online
                                const receivers = persons.filter((person) =>
                                  userIds.includes(person));
                                // Get email adresses
                                if (receivers.length == 0) {
                                  console.log("No users for " + locality);
                                  return;
                                }
                                // typscript string, string map
                                const emailData:
                                {[key: string]: string} =
                                  {locality: locality};
                                while (activities.length > 0) {
                                  emailData["idea-" +
                                  activities.length] =
                                    activities.pop() as string + " (" +
                                    orderedPersons.pop() + ")";
                                }
                                console.log(emailData);
                                const emailPromises = [];
                                for (const receiver of receivers) {
                                  emailPromises.push(
                                      auth().getUser(receiver)
                                          .then((userRecord) => {
                                            const userEmail = userRecord.email;
                                            if (userEmail == null) {
                                              console.log("No email for " +
                                                receiver);
                                              return;
                                            }
                                            if (Object.keys(emailData).length ==
                                              1) {
                                              console.log("No data for " +
                                                receiver);
                                              return;
                                            }

                                            const template =
                                              userLanguage[receiver] == "de" ?
                                              templateDE : templateEN;

                                            // Send email
                                            console.log("Sending email to " +
                                              userEmail);
                                            return utils.sendEmail(
                                              template,
                                              "Letss",
                                              "christoph@letss.app",
                                              userEmail,
                                              24545,
                                              emailData
                                              );
                                          }));
                                }
                                // then() needed to match return type
                                return Promise.all(emailPromises).then(() => {});
                              });
                        });
                  }
                  ));
            }
            // then() needed to match return type
            return Promise.all(activityPromises).then(() => {});
          });
    });


// Push a notification every Friday with a preselected activity
exports.pushScheduled = onSchedule("0 10 * * 5", () => {
      const db = firestore();
      // Get notification data from database
      return db.collection("scheduled-notifications")
          .where("status", "==", "scheduled")
          .where("timestamp", "<=",
              firestore.Timestamp.now())
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
                          return messaging()
                              .send(message)
                              .then(() => {
                                console.log("Sent for: " + user.token.token);
                                // Update notification status
                                return db.collection("scheduled-notifications")
                                    .doc(document.id)
                                    .update({status: "sent"})
                                    .then((response) => {
                                      console.log("Updated notification",
                                          response);
                                    });
                              })
                              .catch((err) => {
                                console.log("Failed to send for: " +
                                user.token.token + err);
                              });
                        }
                        );
                  }
                  ));
            });
            // then() needed to match return type
            return Promise.all(promises).then(() => {});
          });
    });

exports.pushOnLike = onDocumentCreated(
  {
    document: "/activities/{activityId}/likes/{likeId}",
    secrets: ["SENDGRID_KEY"]
  }, (event) => {
      const snap = event.data;
      if (snap == null) {
        throw new HttpsError("not-found",
            "No data.");
      }      
      const db = firestore();
      console.log("ActivityId: " + event.params.activityId);
      console.log("LikeId: " + event.params.likeId);
      console.log("PersonId: " + snap.id);
      // Get data on sender
      return db.collection("persons").doc(snap.id)
          .get().then((senderDoc) => {
            if (senderDoc.exists == false) {
              console.log("Couldn't find person: " + snap.id);
              throw new HttpsError("not-found",
                  "Couldn't find person.");
            }
            const senderP = senderDoc.data();
            if (senderP == null) {
              throw new HttpsError("not-found",
                  "Couldn't find sender.");
            }
            // Get data on activity
            return db.collection("activities").doc(event.params.activityId)
                .get().then((activity) => {
                  if (activity.exists == false) {
                    console.log("Couldn't find activity: " +
                        event.params.activityId);
                    throw new HttpsError("not-found",
                        "Couldn't find activity.");
                  }
                  const activityData = activity.data();
                  if (activityData == null) {
                    throw new HttpsError("not-found",
                        "Couldn't find activity");
                  }
                  // Get data on receiver
                  console.log("Activity user: " + activityData.user);
                  return db.collection("users").doc(activityData.user)
                      .get().then((receiverDoc) => {
                        if (receiverDoc.exists == false) {
                          console.log("Couldn't find user: " +
                              activityData.user);
                          throw new HttpsError("not-found",
                              "Couldn't find user.");
                        }
                        const receiverU = receiverDoc.data();
                        if (receiverU == null) {
                          throw new HttpsError("not-found",
                              "Couldn't find user.");
                        }
                        /*
                        const now = firestore.Timestamp.now().seconds;
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
                              event.params.activityId,
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
                        return messaging()
                            .send(message)
                            .then(() => {
                              console.log("Sent for: " + receiverU.token.token);
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
                              return auth().getUser(activityData.user)
                                  .then((userRecord) => {
                                    const userEmail = userRecord.email;
                                    if (userEmail == null) {
                                      throw new HttpsError(
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
                                                firestore.Timestamp
                                                    .now()})
                                              .then((response) => {
                                                console.log("Updated user",
                                                    response);
                                              });
                                        });
                                  });
                            })
                            .catch((err) => {
                              console.log("Failed to send for: " +
                                  receiverU.token.token + err);
                            });
                      });
                });
          });
    });

exports.pushOnMessage = onDocumentUpdated(
  "/chats/{chatId}", (event) => {
      if(event.data == null) {
        throw new HttpsError("not-found",
            "No data.");
      }
      const beforeC = event.data.before.data();
      const afterC = event.data.after.data();

      console.log("ChatId: " + event.params.chatId);
      console.log("Before message: " + beforeC.lastMessage.message);
      console.log("After message: " + afterC.lastMessage.message);

      let updateUserPromise = Promise.resolve();

      // If a user moved to usersLeft, then update activity
      if (beforeC.activityData != null) {
        const activityUid = beforeC.activityData.uid;
        if (beforeC.usersLeft.length != afterC.usersLeft.length &&
          activityUid != null) {
          console.log("before first await");
          updateUserPromise = firestore().collection("activities")
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
                  return firestore().collection("activities")
                      .doc(activityUid)
                      .update({"participants": participants,
                        "participantsLeft": afterC.usersLeft})
                      .then(() => console.log("Updated activity"))
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
      if ((beforeC.lastMessage.timestamp.isEqual(
          afterC.lastMessage.timestamp)) &&
          (beforeC.lastMessage.message ==
            afterC.lastMessage.message)) {
        console.log("Message didn't change.");
        return null;
      }

      return updateUserPromise.then(() => {
        return firestore().collection("persons")
          .doc(afterC.lastMessage.user)
          .get().then((document) => {
            if (document.exists == false) {
              console.log("Couldn't find person: " +
                afterC.lastMessage.user);
              throw new HttpsError("not-found",
                  "Couldn't find person.");
            }
            const senderP = document.data();
            if (senderP == null) {
              throw new HttpsError("not-found",
                  "Couldn't find person.");
            }
            // look through all users in chat and send message
            // to all except sender
            const receiverPromises = [];
            for (const user of afterC.users) {
              if (user != afterC.lastMessage.user) {
                receiverPromises.push(firestore().collection("users")
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
                      event.params.chatId,
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
                      messaging()
                          .send(message)
                          .then(() => console.log("Sent message to: " +
                            receiver.token.token))
                          .catch((err) => console.log("Failed to send for: " +
                            receiver.token.token + "Err: " + err))
                  );
                }
              }
              return Promise.all(sendPromises);
            }
            );
          });
      });
    });

exports.pushOnNewActivity = onDocumentCreated(
    "/activities/{activityId}",
    (event) => {
      const snap = event.data;
      if (snap == null) {
        throw new HttpsError("not-found",
            "No data.");
      }
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
      return firestore().collection("persons").doc(activityData.user)
          .get().then((document) => {
            if (document.exists == false) {
              console.log("Couldn't find person: " +
              activityData.user);
              throw new HttpsError("not-found",
                  "Couldn't find person.");
            }
            const senderP = document.data();
            if (senderP == null) {
              throw new HttpsError("not-found",
                  "Couldn't find person.");
            }
            // Send update to all followers of sender
            const followerPromise = firestore().collection("followers")
                .doc(activityData.user).collection("followers")
                .limit(maxMessages)
                .get().then((querySnapshot) => {
                  const promises: Promise<void>[] = [];
                  querySnapshot.forEach((document) => {
                    const follower = document.id;
                    notifiedUsers.push(follower);
                    // check if receiver user has same location as activity
                    console.log("Follower: " + follower);
                    promises.push(firestore().collection("persons")
                        .doc(follower).get().then((doc) => {
                          if (doc.exists == false) {
                            console.log("Couldn't find person: " +
                          follower);
                            throw new HttpsError("not-found",
                                "Couldn't find person.");
                          }
                          const receiverP = doc.data();
                          if (receiverP == null) {
                            throw new HttpsError("not-found",
                                "Couldn't find person.");
                          }
                          if (receiverP.location.locality ==
                            activityData.location.locality) {
                            // Get data on receiver
                            return firestore().collection("users")
                                .doc(follower).get().then((doc) => {
                                  if (doc.exists == false) {
                                    console.log("Couldn't find user: " +
                            follower);
                                    throw new HttpsError(
                                        "not-found", "Couldn't find user.");
                                  }
                                  const receiverU = doc.data();
                                  if (receiverU == null) {
                                    throw new HttpsError(
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

                                  return messaging()
                                      .send(message)
                                      .then(() =>
                                        console.log("Sent for " +
                                        receiverU.token.token))
                                      .catch((err) => console.log(
                                          "Failed to send for: " +
                                        receiverU.token.token + "Err: " + err));
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
              locationPromise = firestore().collection("persons")
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
                      promises.push(firestore().collection("users")
                          .doc(user).get().then((doc) => {
                            if (doc.exists == false) {
                              console.log("Couldn't find user: " +
                        user);
                              throw new HttpsError("not-found",
                                  "Couldn't find user.");
                            }
                            const receiverU = doc.data();
                            if (receiverU == null) {
                              throw new HttpsError("not-found",
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

                            return messaging()
                                .send(message)
                                .then(() => console.log("Sent for " +
                                  receiverU.token.token))
                                .catch((err) => console.log(
                                    "Failed to send for: " +
                                  receiverU.token.token + " Err: " + err));
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
              newpersonPromise = firestore().collection("persons")
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
                      promises.push(firestore().collection("users")
                          .doc(user).get().then((doc) => {
                            if (doc.exists == false) {
                              console.log("Couldn't find user: " +
                          user);
                              throw new HttpsError("not-found",
                                  "Couldn't find user.");
                            }
                            const receiverU = doc.data();
                            if (receiverU == null) {
                              throw new HttpsError("not-found",
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

                            return messaging()
                                .send(message)
                                .then(() => console.log("Sent for " +
                                  receiverU.token.token))
                                .catch((err) => console.log(
                                    "Failed to send for: " +
                                  receiverU.token.token + " Err: " + err));
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

exports.pushOnFollower = onDocumentCreated(
    "/followers/{personId}/followers/{followerId}",
    (event) => {
      const snap = event.data;
      if (snap == null) {
        throw new HttpsError("not-found",
            "No data.");
      }
      const follower = snap.id;
      const personId = event.params.personId;
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
      return firestore().collection("persons").doc(follower)
          .get().then((document) => {
            if (document.exists == false) {
              console.log("Couldn't find person: " +
              follower);
              throw new HttpsError("not-found",
                  "Couldn't find person.");
            }
            const followerP = document.data();
            if (followerP == null) {
              throw new HttpsError("not-found",
                  "Couldn't find person.");
            }

            // Send message to person that they have a new follower
            return firestore().collection("users")
                .doc(personId).get().then((doc) => {
                  if (doc.exists == false) {
                    console.log("Couldn't find user: " +
                  personId);
                    throw new HttpsError("not-found",
                        "Couldn't find user.");
                  }
                  const personU = doc.data();
                  if (personU == null) {
                    throw new HttpsError("not-found",
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
                  return messaging()
                      .send(message)
                      .then(() => console.log("Sent for " +
                        personU.token.token))
                      .catch((err) => console.log("Failed to send for: " +
                        personU.token.token + "Err: " + err));
                });
          });
    });


exports.alertOnFlag = onDocumentCreated(
    {
      document: "/flags/{flagId}",
      secrets: ["SENDGRID_KEY"]
    },
    (event) => {
      const snap = event.data;
      if (snap == null) {
        throw new HttpsError("not-found",
            "No data.");
      }
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
            throw new HttpsError("unknown",
                "Error sending email.");
          });
    });
