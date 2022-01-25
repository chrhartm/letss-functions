import functions = require("firebase-functions");
import admin = require("firebase-admin");
import sendGridClient = require("@sendgrid/mail");


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
              return null;
            }
            const senderP = senderDoc.data()!;
            // Get data on activity
            return db.collection("activities").doc(context.params.activityId)
                .get().then((activity) => {
                  if (activity.exists == false) {
                    console.log("Couldn't find activity: " +
                        context.params.activityId);
                    return null;
                  }
                  // Get data on receiver
                  return db.collection("users").doc(activity.data()!.user)
                      .get().then((receiverDoc) => {
                        if (receiverDoc.exists == false) {
                          console.log("Couldn't find user: " +
                              activity.data()!.user);
                          return null;
                        }
                        const receiverU = receiverDoc.data()!;
                        const now = admin.firestore.Timestamp.now().seconds;
                        const daysUnopened = 60*60*24*3 + now;
                        const daysOpened = 60*60*24 + now;
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
                                (!(lastOnline > lastEmail &&
                                  lastEmail > daysOpened) &&
                                (lastEmail < daysUnopened))) {
                                return null;
                              }
                              // Get user email
                              return admin.auth().getUser(activity.data()!.user)
                                  .then((userRecord) => {
                                    // Send email
                                    return sendEmail(
                                        "d-93478b18f7ee4935b554dea49749663e",
                                        "noreply@letss.app",
                                        userRecord.email!,
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
                                                    .fromMillis(now)})
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

// requires firebase functions:config:set sendgrid.key="KEY"
/**
   * Send an email
   * @param {string} templateId - sendGrid template ID
   * @param {string} fromAddress - sender address
   * @param {string} toAddress - address to send to
   * @param {any} data - data to be sent as json
   * @return {function} - Some function
   */
async function sendEmail(templateId: string,
    fromAddress: string,
    toAddress: string,
    data: any) {
  sendGridClient.setApiKey(functions.config().sendgrid.key);

  const mailData = {
    to: toAddress,
    from: fromAddress,
    templateId: templateId,
    dynamic_template_data: data,
  };
  return sendGridClient.send(mailData);
}

