import functions = require("firebase-functions");
import admin = require("firebase-admin");

admin.initializeApp();

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
