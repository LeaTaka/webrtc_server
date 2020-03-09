#!/usr/bin/env node
/*
- registreer de pi door allen de serial in te voeren
- pair de Pi door Pi-button te drukken en keys in te voeren

*/
const axios = require('axios');
var mysql = require('mysql');
var fs = require('fs');
const crypto = require('crypto');

const cfg = JSON.parse(fs.readFileSync('/root/db-settings/cfg.json', 'utf8'))
const TeleBot = require('telebot');
const bot = new TeleBot('1012827763:AAHdG_ryiz6qVW64S95Iwq08LGc0qoe6O24');

const connection = mysql.createConnection(cfg.db);
let serial = 0

//REMOVE / ADD / LIST  -  TOKEN
function janustokens(token, action) {
	adminurl = cfg.jns.host+":"+cfg.jns.port+cfg.jns.path
	adminsecret = cfg.jns.adminsecret
	transaction = 'RUlslJnHGFeoto00u9oM5J2CzOc5gYRUlslJnHGFeoto00u9oM5J2CzOc5gY'
	if (action === "list") {action = "list_tokens"}
	if (action === "add") {action = "add_token"}
	if (action === "remove") {action = "remove_token"}
	axios({
		method: 'post',
		url: adminurl,
		data: {"janus" : ""+action+"", "token" : ""+token+"", "plugins": [ "janus.plugin.videoroom" ], "transaction" : ""+transaction+"", "admin_secret" : ""+adminsecret+""},
		headers: {'Content-Type': 'application/json'}
	})
	.then(function (response) {
	//console.log(response.data);
	if (response.data.janus === 'success') {
		console.log(response.data.janus);
			if ("data" in response.data) {
				if ("tokens" in response.data.data) {
					console.log("List tokens ",response.data.data.tokens);
				}
				if ("plugins" in response.data.data) {
					console.log("Successfull token addition for ",response.data.data.plugins);
				}
			}
		} else {
		console.log(response.data.error);
		}
	})
	.catch(function (error) {
	console.log(error);
	});
}

//REGISTER
bot.on('/reg', (msg) => {
	var query = connection.query('SELECT * FROM registr_users WHERE chatid = ?;', [msg.from.id], function(error, result, fields) {
		//if (result.length === 0) { 
		if (result.length > 0) {
			msg.reply.text(`Hello, ${ msg.from.first_name }! Hooray, You were allready registered !!`, { replyToMessage: msg.message_id });
			console.log('Allready registered');
		} else {
			msg.reply.text(`Hello, ${ msg.from.first_name }! Please register by entering your serial #`);
			console.log('Register by entering serial');
			var valid = 0
			return regSerial(msgid = msg.message_id, valid);
		}
	});
});

function regSerial(msgid,valid) {
	bot.on(/28:(.+)$/, (msg) => {
		// check in piserial if ok
		if(msg.message_id !== msgid && valid === 0) {
			var query = connection.query('SELECT * FROM registrations WHERE serial = ?;', [msg.text], function(error, result, fields) {
				if (result.length > 0) {
					msg.reply.text(`Serial # registered! Now push the button of your device, collect the credentials from its local website and pair by entering the Userkey below`, { replyToMessage: msg.message_id });
					var token = result[0].token;
					janustokens(token, "add");
					return regUserkey(msgid = msg.message_id, valid = 1, serial = msg.text)
				} else {
					var today = new Date();
					var date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+(today.getDate());
					var time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
					var dateTime = date+' '+time;
					var token = crypto.createHash('sha256').update(msg.text).digest('hex');
					var insert = { serial: msg.text, token: token, room: 0, timestamp: dateTime };
					var query = connection.query('INSERT INTO registrations SET ?', insert, function(error, result) {
						var last_insert_id = result.insertId;
						var insert = { chattypeid: 1, chatid: `NULL`, username: `NULL`, registrationsid: last_insert_id, timestamp: dateTime };
						var query = connection.query('INSERT INTO registr_users SET ?', insert, function(error, result) {
						});
						// insert token into janus
						janustokens(token, "add");
					});
					msg.reply.text(`Serial # registered! Now push the button of your device, collect the credentials from its local website and pair by entering the Userkey below`, { replyToMessage: msg.message_id });
					return regUserkey(msgid = msg.message_id, valid = 1, serial = msg.text)
				}
			});
		}
	});
}

function regUserkey(msgid,valid,serial) {
	bot.on('text', (msg) => {
		// check in Userkey if ok
		if(msg.message_id !== msgid && valid === 1) {
			var query = connection.query('SELECT * FROM registrations WHERE room = ? and serial = ?;', [msg.text, serial], function(error, result, fields) {
				if (result.length > 0) {
					msg.reply.text(`Userkey validated! Please enter the Passkey`, { replyToMessage: msg.message_id });
					return regPasskey(msgid = msg.message_id, valid = 2, serial)
				} else {
					msg.reply.text(`Wrong Userkey: ${ msg.text }`);
				}
			});
		}
	});
}

function regPasskey(msgid,valid,serial) {
	bot.on('text', (msg) => {
		// check in Passkey if ok
		if(msg.message_id !== msgid && valid === 2) {
			var query = connection.query('SELECT r.id as registrationsid, r.authstring, r.active as active, u.id as userid FROM registrations r INNER JOIN registr_users u ON r.id = u.registrationsid WHERE pin = ? and serial = ?;', [msg.text, serial], function(error, result, fields) {
				var registrationsid = result[0].registrationsid;
				var authstring = result[0].authstring;
				var active = result[0].active;
				var userid = result[0].userid;
				var telegramurl = cfg.tb.host+":"+cfg.tb.port+"?"+authstring+userid;
				if (result.length > 0) {
					var update = [msg.from.id, msg.from.first_name, registrationsid];
					var query = connection.query('UPDATE registr_users SET chatid = ?, username = ? WHERE registrationsid = ?', update, function(error, result, fields) {
						if (active === 1) {
							msg.reply.text(`Passkey validated! Congratulations, you will now start receiving authentication url's when using your device!\n\nKiss @ <a href=\"${ telegramurl }\">${ serial }</a>`, {parseMode: 'HTML', replyToMessage: msg.message_id });
						} else {
							msg.reply.text(`Passkey validated! Congratulations, you will now start receiving authentication url's when using your device!`, {parseMode: 'HTML', replyToMessage: msg.message_id });
						}
					return valid = 3
					});
				} else {
					msg.reply.text(`Wrong Passkey: ${ msg.text }.`, { replyToMessage: msg.message_id });
				}
			});
		}
	});
}

//UNREGISTER
bot.on('/unreg', (msg) => {
	var query = connection.query('SELECT r.id, r.token, u.chatid, u.username FROM registrations r INNER JOIN registr_users u ON r.id = u.registrationsid WHERE u.chatid = ?;', [msg.from.id], function(error, result, fields) {
		if (result.length > 0) {
			msg.reply.text(`Your device will be unregistered, please confirm with Yes. No for cancel.`);
			console.log('Start unregister process');
			return unregSerial(msgid = msg.message_id, valid = 0, token = result[0].token, regid = result[0].id);
		} else {
			msg.reply.text(`Your device is not registered. Start registration through /reg.`);
			console.log('Not registered, go though /reg');
		}
	});
});

function unregSerial(msgid,valid,token,regid) {
	bot.on('text', (msg) => {

		if(msg.message_id !== msgid && valid === 0) {
			if (msg.text === 'yes' || msg.text === 'Yes') {
				var update = [regid];
				var query = connection.query('UPDATE registrations SET active = 0 WHERE id = ?;', update, function(error, result, fields) {
					console.log('Registration deactivated');
				})
				var update = [String(msg.from.id)];
				var query = connection.query('UPDATE registr_users SET chatid = NULL, username = NULL WHERE chatid = ?;', update, function(error, result, fields) {
					msg.reply.text(`Your credentials are removed.`, { replyToMessage: msg.message_id });
					console.log('Credentals removed');
					console.log('Token removed: '+token);
					janustokens(token, "remove");
				})
				return valid = 3
			} else if (msg.text === 'no' || msg.text === 'No') {
				return valid = 3
			}
		}
	});
}

//OPT-OUT
bot.on('/optout', (msg) => {
	var query = connection.query('SELECT * FROM registr_users WHERE chatid = ?;', [msg.from.id], function(error, result, fields) {
		if (result.length > 0) {
			if (result[0].username === null) {
				msg.reply.text(`You are allready opted-out for receiving authentication url's.`);
				console.log('Allready opted-out!');
			} else {
				msg.reply.text(`You have choosen to opt-out from receiving authentication url's from your device. Please confirm with Yes. No for cancel.`);
				console.log('Start opt-out process');
				var valid = 0
				return optout(msgid = msg.message_id, valid);
			}
		} else {
			msg.reply.text(`Your device is not registered. Start registration through /reg.`);
			console.log('Unregistered device');
		}
	});
});

function optout(msgid,valid) {
	bot.on('text', (msg) => {
		if(msg.message_id !== msgid && valid === 0) {
			if (msg.text === 'yes' || msg.text === 'Yes') {
				var update = [String(msg.from.id)];
				var query = connection.query('UPDATE registr_users SET username = NULL WHERE chatid = ?;', update, function(error, result, fields) {
					//console.log(result);
					msg.reply.text(`Your credentials have been removed. You will stop receiving authentication url's from your device`, { replyToMessage: msg.message_id });
					return valid = 3
				})
			} else if (msg.text === 'no' || msg.text === 'No') {
				return valid = 3
			}
		}
	});
}

//OPT-IN
bot.on('/optin', (msg) => {
	var query = connection.query('SELECT * FROM registr_users WHERE chatid = ?;', [msg.from.id], function(error, result, fields) { 
		if (result.length > 0) {
			if (result[0].username !== null) {
				msg.reply.text(`You are allready opted-in for receiving authentication url's`);
				console.log('Allready opted-in!');
			} else {
				msg.reply.text(`You have choosen to opt-in on receiving authentication url's from your device. Please confirm with Yes. No for cancel`);
				console.log('Start opt-in process');
				var valid = 0
				return optin(msgid = msg.message_id, valid);
			}
		} else {
			msg.reply.text(`Your device is not registered. Start registration through /reg.`);
			console.log('Allready opted-in!');
		}
	});
});

function optin(msgid,valid) {
	bot.on('text', (msg) => {
		if(msg.message_id !== msgid && valid === 0) {
			if (msg.text === 'yes' || msg.text === 'Yes') {
				var update = [msg.from.first_name, String(msg.from.id)];
				var query = connection.query('UPDATE registr_users SET username = ? WHERE chatid = ?;', update, function(error, result, fields) {
					//console.log(result);
					msg.reply.text(`Your opt-in has been processed. You will now start receiving authentication url's when using your device.`, { replyToMessage: msg.message_id });
					return valid = 3
				})
			} else if (msg.text === 'no' || msg.text === 'No') {
				return valid = 3
			}
		}
	});
}

var telegramurl = 'http://www.knmi.nl';
var serials = '28:85dfef7e'
bot.on(['/ss', 'hello'], (msg) => {
	msg.reply.text(`Welcome!\n\nKiss @ <a href=\"${ telegramurl }\">${ serials }</a>`, {parseMode: 'HTML', replyToMessage: msg.message_id });
	//msg.reply.text(`Welcome!\n\nKiss @ <a href=\"${ telegramurl }\">${ serials }</a>`, {parseMode: 'HTML'}, { replyToMessage: msg.message_id });
	//msg.reply.text("!! Kiss @ <a href=\"http://www.knmi.nl\">flerp</a>", {parseMode: 'HTML'});
})

bot.start();