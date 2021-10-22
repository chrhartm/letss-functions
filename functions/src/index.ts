const like = require('./like');
const pushOnLike = require('./pushOnLike');
const generateMatches = require('./generateMatches');
const deleteUser = require('./deleteUser');
const resetCoins = require('./like');
const pushOnMessage = require('./pushOnMessage');
const incrementPopularity = require('./incrementPopularity');


exports.generateMatches = generateMatches.generateMatches;
exports.deleteUser = deleteUser.deleteUser;
exports.like = like.like;
exports.resetCoins = resetCoins.resetCoins;
exports.pushOnLike = pushOnLike.pushOnLike;
exports.pushOnMessage = pushOnMessage.pushOnMessage;
exports.incrementPopularity = incrementPopularity.incrementPopularity;
